import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {validateReviewPlan,createReviewJob,advanceReviewJob,claimReviewJob,cancelReviewJob,jobStatus} from './review-supervisor.mjs';
import {verifyNativeReviewResult} from './agent-handoff.mjs';
import {processIdentity} from './reviewer-slots.mjs';
import {appendEvent,withJob,readEvents,readJson,worktreePaths} from './review-job-store.mjs';
import {continuationHost,continuationClaimIdentity} from './continuation-host.mjs';
import {claudeContinuationHost,claudeReceiptMarker,sendClaudeFrame,readClaudeRows} from './claude-continuation-host.mjs';
import {recordClaudeHook} from './claude-continuation-hook.mjs';

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'impower-cross-provider-'));
let receivedServer;
console.log(`Scratch repository: ${scratch}`);
const repo=path.join(scratch,'repo');fs.mkdirSync(repo);
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true});
git('init','--quiet');git('-c','user.name=test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','fixture');
const head=git('rev-parse','HEAD').trim(),privateDir=path.join(scratch,'review');fs.mkdirSync(privateDir);
const prompt=path.join(privateDir,'prompt.txt');fs.writeFileSync(prompt,'Review the frozen repository, publish the full report, and write the completion artifact.');
const plan={worktree:repo,jobDir:path.join(scratch,'job'),head,base:head,pr:548,writer:'claude-opus-5',writerEffort:'high',permissions:{permissionMode:'dontAsk'},reviewer:'gpt-6-astra',round:1,completedReviewRound:0,destination:{host:'claude-cli-windows',threadId:'origin',turnId:'prior-turn',cwd:repo},reviews:[{id:'correctness',transport:'native-codex-jsonl',executable:process.execPath,prompt,effort:'medium',permissions:{sandbox:'workspace-write',approvalPolicy:'never',networkAccess:true,cwd:privateDir},args:['exec','--model','gpt-6-astra','-c','model_reasoning_effort="medium"','-c','approval_policy="never"','--sandbox','workspace-write','-c','sandbox_workspace_write.network_access=true','--cd',privateDir,'--skip-git-repo-check','--json','--output-last-message',path.join(privateDir,'report.md'),'-']}]};
try {
  plan.reviews[0].args.splice(-1,0,'--disable','multi_agent','--disable','multi_agent_v2');
  plan.reviews[0].permissions.artifactWrites='handoff-directory';
  assert.doesNotThrow(()=>validateReviewPlan(plan),'explicit Codex reviewer transport must be supported without Claude-only flags');
  console.log('PASS: explicit Codex reviewer route passes the shared plan gate');
  for(const extra of [['--add-dir',repo],['-c','sandbox_workspace_write.writable_roots=["/tmp"]'],['--dangerously-bypass-approvals-and-sandbox'],['--profile','other'],['--model=gpt-6-astra'],['--sandbox','danger-full-access']]) {
    const invalid=structuredClone(plan);invalid.reviews[0].args.splice(-1,0,...extra);assert.throws(()=>validateReviewPlan(invalid));
  }
  for(const cwd of [repo,scratch]) {
    const invalid=structuredClone(plan);invalid.reviews[0].permissions.cwd=cwd;invalid.reviews[0].args[invalid.reviews[0].args.indexOf('--cd')+1]=cwd;
    assert.throws(()=>validateReviewPlan(invalid),/writes must exclude/);
  }
  const denied=structuredClone(plan);denied.reviews[0].permissions.networkAccess=false;assert.throws(()=>validateReviewPlan(denied),/permissions/);
  for(const extra of [['--enable','multi_agent'],['--disable','multi_agent'],['--disable','multi_agent_v2'],['-c','features.multi_agent=true'],['--disable','unknown']]) {
    const invalid=structuredClone(plan);invalid.reviews[0].args.splice(-1,0,...extra);assert.throws(()=>validateReviewPlan(invalid));
  }
  for(const feature of ['multi_agent','multi_agent_v2']) {
    const invalid=structuredClone(plan);invalid.reviews[0].args.splice(invalid.reviews[0].args.indexOf(feature)-1,2);assert.throws(()=>validateReviewPlan(invalid),/disable both/);
  }
  const alias=path.join(scratch,'review-alias');fs.symlinkSync(privateDir,alias,process.platform==='win32'?'junction':'dir');
  const aliased=structuredClone(plan);aliased.jobDir=path.join(alias,'job');assert.throws(()=>validateReviewPlan(aliased),/writes must exclude/);
  console.log('PASS: reviewer permissions cannot hide alternate roots, config overrides, model substitutions, or network denial');

  const stream=[{type:'thread.started',thread_id:randomUUID()},{type:'turn.started'},{type:'item.completed',item:{id:'answer',type:'agent_message',text:'Full review posted and completion written.'}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:2}}];
  const output=path.join(privateDir,'stdout.jsonl');
  const writeStream=rows=>fs.writeFileSync(output,rows.map(JSON.stringify).join('\n')+'\n');
  writeStream(stream);assert.equal(verifyNativeReviewResult(output,'codex-jsonl').status,'completed');
  for(const invalid of [stream.slice(0,-1),[...stream,{type:'error',message:'failed'}],[...stream.slice(0,-1),{type:'turn.failed',error:{message:'failed'}}],[...stream,stream.at(-1)],[stream[0],...stream],stream.filter(row=>row.type!=='item.completed'),[{type:'result',subtype:'success',is_error:false,stop_reason:'end_turn'}]]) {
    writeStream(invalid);assert.throws(()=>verifyNativeReviewResult(output,'codex-jsonl'));
  }
  fs.writeFileSync(output,JSON.stringify(stream[0]));assert.throws(()=>verifyNativeReviewResult(output,'codex-jsonl'),/Incomplete/);
  writeStream(stream);assert.throws(()=>verifyNativeReviewResult(output,'claude-json'));
  console.log('PASS: Codex completion is distinct from errors, interruption, partial streams, duplicate terminal events, and Claude results');

  const hookDir=path.join(scratch,'hook');fs.mkdirSync(hookDir);
  const transcript=path.join(hookDir,'transcript.jsonl'),modelRow=JSON.stringify({type:'assistant',message:{model:plan.writer}})+'\n';fs.writeFileSync(transcript,modelRow);
  const sessionId=randomUUID(),turnId=randomUUID(),promptId=randomUUID();
  const env={CLAUDE_CODE_MESSAGING_SOCKET:'uds:fixture-socket',CLAUDE_CODE_MESSAGING_TOKEN:'private-fixture-token'};
  const identity=processIdentity(process.pid);
  const hookConfig={directory:hookDir,executable:process.execPath};
  const record=(event)=>recordClaudeHook(hookConfig,{session_id:sessionId,cwd:repo,prompt_id:promptId,...event},{env,ancestor:()=>identity,version:()=> '2.1.270 (Claude Code)'});
  record({hook_event_name:'SessionStart',model:plan.writer,transcript_path:transcript});
  record({hook_event_name:'UserPromptSubmit',permission_mode:'dontAsk'});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,final:true,delta:'Ready'});
  record({hook_event_name:'Stop',effort:{level:'high'},permission_mode:'dontAsk'});
  const registration=path.join(hookDir,'registration.json'),registered=readJson(registration),receipts=registered.receipts;
  assert.equal(fs.readFileSync(receipts,'utf8').includes(env.CLAUDE_CODE_MESSAGING_TOKEN),false);
  assert.throws(()=>record({hook_event_name:'SessionStart',model:plan.writer,transcript_path:transcript}),/EEXIST/);
  const claudePlan={...plan,destination:{host:'claude-cli-windows',threadId:sessionId,turnId,cwd:repo,registration,registrationId:registered.registrationId}};
  const adapter=()=>continuationHost(claudePlan,{platform:'win32',env});
  assert.equal((await adapter().preflight(claudePlan.destination,claudePlan)).supported,true);
  assert.deepEqual(await adapter().inspect(claudePlan.destination,claudePlan),{state:'idle'});
  assert.equal(continuationClaimIdentity(claudePlan,{env}),sessionId);
  assert.throws(()=>continuationClaimIdentity(claudePlan,{env:{}}),/registered/);
  await assert.rejects(claudeContinuationHost({plan:claudePlan,env,platform:'linux'}).preflight(claudePlan.destination),/awaited/);
  await assert.rejects(claudeContinuationHost({plan:claudePlan,env:{},platform:'win32'}).preflight(claudePlan.destination),/registered/);
  await assert.rejects(adapter().preflight({...claudePlan.destination,threadId:randomUUID()}),/registration/);
  await assert.rejects(adapter().preflight({...claudePlan.destination,registrationId:randomUUID()}),/registration/);
  await assert.rejects(adapter().preflight(claudePlan.destination,{...claudePlan,writerEffort:'medium'}),/permissions/);
  const newerPrompt=randomUUID();record({hook_event_name:'UserPromptSubmit',prompt_id:newerPrompt});
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'unknown'});
  record({hook_event_name:'Stop',prompt_id:newerPrompt,effort:{level:'high'},permission_mode:'dontAsk'});
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'idle'});
  fs.appendFileSync(transcript,JSON.stringify({type:'user',interruptedMessageId:'interrupted',timestamp:'2999-01-01T00:00:00Z'})+'\n');
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'unknown'});fs.writeFileSync(transcript,modelRow);
  console.log('PASS: private registration binds native session, version, routing, process, lifecycle, and claims; Linux automatic refuses');

  const envelope={version:1,jobId:randomUUID(),continuationId:randomUUID(),destination:{threadId:sessionId,turnId,cwd:repo},head,base:head,round:1,coverage:['correctness'],reports:[],authorizedAction:'adjudicate',claimCommand:['node','claim']};
  assert.deepEqual(await adapter().reconcile(envelope),{status:'uncertain'});
  const marker=claudeReceiptMarker(envelope.continuationId);
  const arrival={type:'attachment',attachment:{type:'queued_command',prompt:marker},timestamp:new Date().toISOString()};
  fs.appendFileSync(transcript,JSON.stringify(arrival)+'\n');
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:1,final:true,delta:marker});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:0,final:false,delta:'Earlier delta'});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:1,final:true,delta:marker});
  fs.appendFileSync(receipts,'{"partial":');
  assert.deepEqual(await adapter().reconcile(envelope),{status:'accepted',turnId});
  const completed=fs.readFileSync(receipts,'utf8');fs.writeFileSync(receipts,completed.slice(0,completed.lastIndexOf('\n')+1));
  assert.ok(readClaudeRows(receipts).length>0);
  record({hook_event_name:'MessageDisplay',turn_id:randomUUID(),final:true,delta:marker});
  assert.deepEqual(await adapter().reconcile(envelope),{status:'uncertain'},'multiple native turns require manual reconciliation');
  assert.deepEqual(await adapter().retract(envelope),{status:'unsupported'});
  assert.deepEqual(await adapter().cancelTurn(envelope.destination),{status:'unsupported'});
  console.log('PASS: same-turn native receipts reconcile duplicate/out-of-order hooks and partial tails without accepting ambiguous turns');

  const socketPath=process.platform==='win32'?`\\\\.\\pipe\\impower-claude-${randomUUID()}`:path.join(scratch,'inbox.sock');
  let frames;
  const received=new Promise(resolve=>{
    const server=net.createServer(socket=>{
      let buffer='';socket.on('data',chunk=>{buffer+=chunk;const lines=buffer.trim().split('\n');if(lines.length===2){frames=lines.map(JSON.parse);resolve();}});
    });
    server.listen(socketPath);server.on('error',error=>{throw error;});
    receivedServer=server;
  });
  await new Promise(resolve=>receivedServer.listening?resolve():receivedServer.once('listening',resolve));
  assert.equal((await sendClaudeFrame({...registered,socket:socketPath},envelope)).status,'written-awaiting-native-receipt');
  await received;await new Promise(resolve=>receivedServer.close(resolve));
  assert.deepEqual(frames[0],{type:'auth',token:env.CLAUDE_CODE_MESSAGING_TOKEN});
  assert.equal(frames[1].session_id,sessionId);assert.equal(frames[1].uuid,envelope.continuationId);assert.equal(frames[1].msg_id,envelope.continuationId);assert.equal(frames[1].priority,'next');
  assert.ok(frames[1].message.content.includes(marker));assert.equal(frames[1].message.content.includes(env.CLAUDE_CODE_MESSAGING_TOKEN),false);
  await assert.rejects(sendClaudeFrame({...registered,socket:socketPath},envelope),/uncertain/);
  console.log('PASS: actual local socket sends one authenticated exact-session frame; closed endpoint never creates a replacement');

  // The same supervisor lifecycle uses the Claude adapter, not a second store.
  // Reset hook history to an idle origin before each private job admission.
  const idleRows=readClaudeRows(receipts).filter(row=>row.hook_event_name!=='UserPromptSubmit'||row.prompt_id===promptId).filter(row=>row.hook_event_name!=='Stop'||row.prompt_id===promptId).filter(row=>row.hook_event_name!=='MessageDisplay'||row.delta==='Ready');
  fs.writeFileSync(receipts,idleRows.map(JSON.stringify).join('\n')+'\n');
  let jobIndex=0;
  const fixture=async()=>{
    const freeze=worktreePaths(repo).freeze;if(fs.existsSync(freeze))fs.unlinkSync(freeze);
    const input={...claudePlan,jobDir:path.join(scratch,`cross-job-${jobIndex++}`)};let sends=0,live=true;
    const host=claudeContinuationHost({plan:input,platform:'win32',env,identify:()=>live?identity:null,send:async(_record,message)=>{
      sends++;const receipt=claudeReceiptMarker(message.continuationId);
      fs.appendFileSync(transcript,JSON.stringify({type:'user',uuid:message.continuationId,message:{content:receipt}})+'\n');
      record({hook_event_name:'MessageDisplay',turn_id:turnId,final:true,delta:receipt});
      throw new Error('Acknowledgment lost');
    }});
    const original=fs.readFileSync(receipts,'utf8');
    await createReviewJob(input,host,{verifyExecutable:()=>{}});
    const saved=readJson(path.join(input.jobDir,'plan.json'));
    const complete=()=>{
      withJob(input.jobDir,()=>{appendEvent(input.jobDir,'worker-launch-intent');appendEvent(input.jobDir,'worker-started',{identity});appendEvent(input.jobDir,'worker-finished',{ok:true});});
      const result=path.join(input.jobDir,'review.jsonl');fs.writeFileSync(result,stream.map(JSON.stringify).join('\n')+'\n');
      fs.writeFileSync(path.join(input.jobDir,'handoff.jsonl'),[{event:'launching',step:'correctness',completion:'full-report.json',output:result},{event:'exited',step:'correctness',code:0},{event:'completed',step:'correctness',head,completedRound:1,commentIds:[101]},{event:'finished'}].map(JSON.stringify).join('\n')+'\n');
    };
    return{host,input,saved,complete,restore(){fs.writeFileSync(receipts,original);fs.writeFileSync(transcript,modelRow);},get sends(){return sends;},disconnect(){live=false;},reconnect(){live=true;}};
  };
  {
    const f=await fixture();f.complete();
    await advanceReviewJob(f.input.jobDir,f.host);assert.equal(f.sends,0,'reviewer process remains owned until exit');
    f.disconnect();await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,0);
    f.reconnect();await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,1);assert.equal(jobStatus(f.input.jobDir).state,'continuation-accepted');
    await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,1);
    const publicEvent=readEvents(f.input.jobDir).find(row=>row.event==='continuation-pending');assert.equal(JSON.stringify(publicEvent).includes('registration'),false);
    assert.equal(claimReviewJob(f.input.jobDir,f.saved.continuationId,{threadId:sessionId,identify:()=>null}).claimed,true);f.restore();
  }
  {
    const f=await fixture();f.complete();await cancelReviewJob(f.input.jobDir,f.host);await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,0);
    assert.deepEqual(readEvents(f.input.jobDir).at(-1).clear,{status:'unsupported'});f.restore();
  }
  console.log('PASS: Claude adapter shares worker-exit, disconnect/reconnect, uncertain acknowledgment, idempotent reconciliation, claim, and workflow cancellation gates');
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
