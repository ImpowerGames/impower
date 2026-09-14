import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {validateReviewPlan,createReviewJob,advanceReviewJob,claimReviewJob,cancelReviewJob,jobStatus} from './review-supervisor.mjs';
import {verifyNativeReviewResult,runHandoff} from './agent-handoff.mjs';
import {processIdentity} from './reviewer-slots.mjs';
import {appendEvent,withJob,readEvents,readJson,worktreePaths} from './review-job-store.mjs';
import {continuationHost,continuationClaimIdentity} from './continuation-host.mjs';
import {claudeContinuationHost,claudeReceiptMarker,sendClaudeFrame,readClaudeRows,verifyClaudeClaimConfiguration} from './claude-continuation-host.mjs';
import {recordClaudeHook,appendClaudeReceipt} from './claude-continuation-hook.mjs';
import {verifyReviewerExecutable} from './native-reviewer.mjs';
import {protectPrivatePath,reviewerEnvironment} from './reviewer-security.mjs';
import {claudeClaimArgv,renderClaudeClaimCommand} from './claude-claim-proof.mjs';
import {testShell} from '../.agents/skills/drive-web-editor/redgreen.mjs';

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
  const echo=path.join(privateDir,'quote-proof.mjs');fs.writeFileSync(echo,'console.log(JSON.stringify({args:process.argv.slice(2),id:process.env.IMPOWER_CLAUDE_CLAIM_ID}));');
  const literal="space ' quote $() ; & literal",quoted=renderClaudeClaimCommand([process.execPath,echo,literal]);
  assert.deepEqual(JSON.parse(execFileSync(process.env.AGENT_TOOLING_BASH||testShell(),['-c',quoted],{encoding:'utf8',windowsHide:true})),{args:[literal],id:literal});
  plan.reviews[0].args.splice(-1,0,'--disable','multi_agent','--disable','multi_agent_v2');
  plan.reviews[0].args.splice(-1,0,'--ignore-user-config','--ignore-rules','--strict-config','-c','model_provider="openai"','-c','sandbox_workspace_write.writable_roots=[]','-c','sandbox_workspace_write.exclude_tmpdir_env_var=true','-c','sandbox_workspace_write.exclude_slash_tmp=true');
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
  const shared=structuredClone(plan);shared.reviews.push({...structuredClone(shared.reviews[0]),id:'second'});assert.throws(()=>validateReviewPlan(shared),/disjoint/);
  for(const flag of ['--ignore-user-config','--ignore-rules','--strict-config']) {const invalid=structuredClone(plan);invalid.reviews[0].args.splice(invalid.reviews[0].args.indexOf(flag),1);assert.throws(()=>validateReviewPlan(invalid),/isolated effective/);}
  assert.throws(()=>continuationHost({}),/Originating destination identity required/);
  assert.throws(()=>verifyReviewerExecutable({transport:'native-codex-jsonl',executable:process.execPath}),/version is unverified|Windows only/);
  if(process.env.IMPOWER_TEST_CODEX_EXECUTABLE)verifyReviewerExecutable({transport:'native-codex-jsonl',executable:process.env.IMPOWER_TEST_CODEX_EXECUTABLE});
  else console.log('SKIP: installed pinned Codex executable probe requires IMPOWER_TEST_CODEX_EXECUTABLE; version mismatch refusal ran');
  assert.deepEqual(reviewerEnvironment({CLAUDE_CODE_MESSAGING_TOKEN:'sentinel',CLAUDE_CODE_MESSAGING_SOCKET:'sentinel',CODEX_APP_TOOLS_PIPE_PATH:'sentinel',CODEX_THREAD_ID:'sentinel',claude_pid:'1',GIT_DIR:'bad',PATH:'keep'}),{PATH:'keep'});
  for(const extra of [['--enable','multi_agent'],['--disable','multi_agent'],['--disable','multi_agent_v2'],['-c','features.multi_agent=true'],['--disable','unknown']]) {
    const invalid=structuredClone(plan);invalid.reviews[0].args.splice(-1,0,...extra);assert.throws(()=>validateReviewPlan(invalid));
  }
  for(const feature of ['multi_agent','multi_agent_v2']) {
    const invalid=structuredClone(plan);invalid.reviews[0].args.splice(invalid.reviews[0].args.indexOf(feature)-1,2);assert.throws(()=>validateReviewPlan(invalid),/disable both/);
  }
  const alias=path.join(scratch,'review-alias');fs.symlinkSync(privateDir,alias,process.platform==='win32'?'junction':'dir');
  const aliased=structuredClone(plan);aliased.jobDir=path.join(alias,'job');assert.throws(()=>validateReviewPlan(aliased),/writes must exclude/);
  console.log('PASS: declared reviewer arguments reject alternate roots/configuration, shared private directories, missing feature disables and mismatched versions');

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
  const messageId=randomUUID();
  const record=(event)=>recordClaudeHook(hookConfig,{session_id:sessionId,cwd:repo,prompt_id:promptId,message_id:messageId,...event},{env,ancestor:()=>identity,version:()=> '2.1.270 (Claude Code)'});
  assert.throws(()=>recordClaudeHook(hookConfig,{hook_event_name:'SessionStart',session_id:sessionId,cwd:repo},{env,ancestor:()=>identity,version:()=> '2.1.220 (Claude Code)'}),/version/);
  record({hook_event_name:'SessionStart',model:plan.writer,transcript_path:transcript});
  record({hook_event_name:'UserPromptSubmit',permission_mode:'dontAsk'});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,final:true,delta:'Ready'});
  record({hook_event_name:'Stop',effort:{level:'high'},permission_mode:'dontAsk'});
  const registration=path.join(hookDir,'registration.json'),registered=readJson(registration),receipts=registered.receipts;
  assert.equal(fs.readFileSync(receipts,'utf8').includes(env.CLAUDE_CODE_MESSAGING_TOKEN),false);
  record({hook_event_name:'SessionStart',model:plan.writer,transcript_path:transcript});assert.equal(readJson(registration).registrationId,registered.registrationId,'repeat native SessionStart preserves registration generation');
  assert.throws(()=>record({hook_event_name:'SessionStart',session_id:randomUUID(),model:plan.writer,transcript_path:transcript}),/another session generation/);
  const claudePlan={...plan,destination:{host:'claude-cli-windows',threadId:sessionId,turnId,cwd:repo,registration,registrationId:registered.registrationId}};
  const adapter=()=>continuationHost(claudePlan,{platform:'win32',env});
  assert.equal((await adapter().preflight(claudePlan.destination,claudePlan)).supported,true);
  if(process.platform==='win32')assert.equal((await adapter().preflight({...claudePlan.destination,cwd:repo.toUpperCase()},claudePlan)).supported,true,'Windows case aliases retain native directory identity');
  assert.deepEqual(await adapter().inspect(claudePlan.destination,claudePlan),{state:'idle'});
  protectPrivatePath(registration,{verifyOnly:true});
  if(process.platform==='win32') {
    const aclEnv={...process.env,IMPOWER_TEST_ACL:registration};for(const key of Object.keys(aclEnv))if(key.toUpperCase()==='PSMODULEPATH')delete aclEnv[key];
    const acl=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$a=Get-Acl -LiteralPath $env:IMPOWER_TEST_ACL; $s=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $r=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); @{protected=$a.AreAccessRulesProtected;ownerOnly=($r.Count -eq 1 -and $r[0].IdentityReference.Value -eq $s)} | ConvertTo-Json -Compress"],{env:aclEnv,encoding:'utf8',windowsHide:true}));
    assert.deepEqual(acl,{protected:true,ownerOnly:true},'independent Windows ACL readback excludes sandbox groups');
  }
  assert.equal(continuationClaimIdentity(claudePlan,{env}),sessionId);
  assert.throws(()=>continuationClaimIdentity(claudePlan,{env:{}}),/registered/);
  await assert.rejects(claudeContinuationHost({plan:claudePlan,env,platform:'linux'}).preflight(claudePlan.destination),/awaited/);
  await assert.rejects(claudeContinuationHost({plan:claudePlan,env:{},platform:'win32'}).preflight(claudePlan.destination),/registered/);
  await assert.rejects(adapter().preflight({...claudePlan.destination,threadId:randomUUID()}),/registration/);
  await assert.rejects(adapter().preflight({...claudePlan.destination,registrationId:randomUUID()}),/registration/);
  await assert.rejects(adapter().preflight(claudePlan.destination,{...claudePlan,writerEffort:'medium'}),/permissions/);
  const newerPrompt=randomUUID();record({hook_event_name:'UserPromptSubmit',prompt_id:newerPrompt});
  record({hook_event_name:'MessageDisplay',prompt_id:newerPrompt,turn_id:randomUUID(),final:true,delta:'I will submit now.'});
  await assert.doesNotReject(adapter().preflight(claudePlan.destination),'completed anchor admits a narrated active submitting turn');
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'unknown'});
  record({hook_event_name:'Stop',prompt_id:newerPrompt,effort:{level:'high'},permission_mode:'dontAsk'});
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'idle'});
  fs.appendFileSync(transcript,JSON.stringify({type:'user',interruptedMessageId:'interrupted',timestamp:'2999-01-01T00:00:00Z'})+'\n');
  assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'unknown'});fs.writeFileSync(transcript,modelRow);
  const originalReceipts=fs.readFileSync(receipts);
  record({hook_event_name:'SessionEnd'});assert.deepEqual(await adapter().inspect(claudePlan.destination),{state:'disconnected'});await assert.rejects(adapter().preflight(claudePlan.destination),/lifecycle/);fs.writeFileSync(receipts,originalReceipts);
  fs.appendFileSync(receipts,'{corrupt}\n');const unreadable=await adapter().inspect(claudePlan.destination);assert.equal(unreadable.state,'unknown');assert.match(unreadable.reason,/complete row/);fs.writeFileSync(receipts,originalReceipts);
  for(const directory of [repo,path.join(repo,'.git')]) {
    const copy=path.join(directory,'private-registration.json');fs.copyFileSync(registration,copy);
    const badPlan={...claudePlan,destination:{...claudePlan.destination,registration:copy}};
    await assert.rejects(claudeContinuationHost({plan:badPlan,env,platform:'win32'}).reconcile({}),/outside|administrative/);fs.unlinkSync(copy);
  }
  const linked=path.join(scratch,'linked-review');git('worktree','add','--detach',linked,'HEAD');
  for(const [location,cwd] of [[linked,repo],[path.join(repo,'.git'),linked]]) {
    const copy=path.join(location,'private-linked-registration.json');fs.writeFileSync(copy,JSON.stringify({...registered,cwd}));
    const badPlan={...claudePlan,worktree:linked,destination:{...claudePlan.destination,cwd,registration:copy}};
    await assert.rejects(claudeContinuationHost({plan:badPlan,env,platform:'win32'}).reconcile({}),/outside|administrative/);fs.unlinkSync(copy);
  }
  console.log('PASS: session/version/credential mismatch, active-turn admission, SessionEnd, containment and recoverable corrupt receipts are asserted; Linux automatic refuses');

  const envelope={version:1,jobId:randomUUID(),continuationId:randomUUID(),destination:{threadId:sessionId,turnId,cwd:repo},head,base:head,round:1,coverage:['correctness'],reports:[],authorizedAction:'adjudicate',claimCommand:['node','claim']};
  assert.deepEqual(await adapter().reconcile(envelope),{status:'uncertain'});
  const marker=claudeReceiptMarker(envelope.continuationId);
  const arrival={type:'attachment',attachment:{type:'queued_command',prompt:marker},timestamp:new Date().toISOString()};
  fs.appendFileSync(transcript,JSON.stringify(arrival)+'\n');
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:1,final:true,delta:''});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:0,final:false,delta:marker+'\n'});
  record({hook_event_name:'MessageDisplay',turn_id:turnId,index:1,final:true,delta:''});
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
  assert.equal((await sendClaudeFrame({...registered,socket:socketPath},envelope)).status,'not-sent');
  const failedWrite=new (await import('node:events')).EventEmitter();failedWrite.destroy=()=>{};failedWrite.write=(_frame,done)=>done(new Error('write result lost'));
  const uncertain=sendClaudeFrame(registered,envelope,{connect:()=>{queueMicrotask(()=>failedWrite.emit('connect'));return failedWrite;}});await assert.rejects(uncertain,/uncertain/);
  console.log('PASS: actual local socket sends one authenticated exact-session frame; closed endpoint never creates a replacement');

  if(process.platform==='win32') {
    const module=pathToFileURL(path.resolve('scripts/claude-continuation-hook.mjs')).href;
    const actual=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {claudeAncestor} from ${JSON.stringify(module)};console.log(JSON.stringify(claudeAncestor(process.execPath)));`],{encoding:'utf8',windowsHide:true}));
    assert.deepEqual(actual,identity,'native ancestor walker binds a real parent Node process');
  }else console.log('SKIP: Windows native ancestor walker; simulated session identity fixtures ran');
  const compact=path.join(hookDir,'compact.jsonl');
  for(let i=0;i<530;i++)appendClaudeReceipt(compact,{hook_event_name:'MessageDisplay',turn_id:turnId,final:true,delta:'',index:i});
  assert.equal(readClaudeRows(compact).length,512);assert.ok(fs.statSync(compact).size<150000);
  const concurrent=path.join(hookDir,'concurrent.jsonl'),hookModule=pathToFileURL(path.resolve('scripts/claude-continuation-hook.mjs')).href;
  await Promise.all(Array.from({length:4},(_,id)=>new Promise((resolve,reject)=>{
    const child=childProcess.spawn(process.execPath,['--input-type=module','-e',`import {appendClaudeReceipt} from ${JSON.stringify(hookModule)};for(let i=0;i<10;i++)appendClaudeReceipt(${JSON.stringify(concurrent)},{id:${id}+'-'+i,hook_event_name:'Stop'});`],{windowsHide:true,stdio:'ignore'});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Concurrent hook child failed')));
  })));
  assert.equal(new Set(readClaudeRows(concurrent).map(row=>row.id)).size,40,'concurrent compact writers preserve every completed row');
  console.log('PASS: compact receipt retention is bounded; native ancestor process is checked on Windows');

  // Exercise the real handoff's rewritten argv, environment, stdout/stderr,
  // completion and actual child exit with a native-CLI stand-in, not a model.
  if(process.platform==='win32') {
    const child=path.join(scratch,'native-review-child.mjs'),capture=path.join(scratch,'launch-capture.json'),sourceHome=path.join(scratch,'source-home');fs.mkdirSync(sourceHome);
    fs.writeFileSync(path.join(sourceHome,'auth.json'),'{}');fs.writeFileSync(path.join(sourceHome,'config.toml'),'model_provider="unwanted"');
    fs.writeFileSync(child,`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;const completion=/Write (.*?) with the editor tool/.exec(text)[1];fs.writeFileSync(completion,JSON.stringify({head:${JSON.stringify(head)},next:null,commentIds:[101],summary:'fixture report'}));fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({argv:JSON.parse(process.env.FIXTURE_ARGV),token:process.env.CLAUDE_CODE_MESSAGING_TOKEN??null,pipe:process.env.CODEX_APP_TOOLS_PIPE_PATH??null,thread:process.env.CODEX_THREAD_ID??null,home:process.env.CODEX_HOME,config:fs.existsSync(process.env.CODEX_HOME+'/config.toml')}));for(const row of ${JSON.stringify(stream)})console.log(JSON.stringify(row));console.error('diagnostic after terminal result');`);
    const launchDir=path.join(scratch,'launch-job');fs.mkdirSync(launchDir);
    const config={worktree:repo,journal:path.join(launchDir,'handoff.jsonl'),pr:548,writer:plan.writer,reviewer:plan.reviewer,completedReviewRound:0,maxSteps:1,first:'check',steps:{check:{...structuredClone(plan.reviews[0]),role:'review',round:1,model:plan.reviewer,nativeResult:'codex-jsonl',next:[null]}}};
    const configFile=path.join(scratch,'launch.json');fs.writeFileSync(configFile,JSON.stringify(config));
    const originalExec=childProcess.execFileSync,originalSpawn=childProcess.spawn,previous={};
    for(const [key,value] of Object.entries({CODEX_HOME:sourceHome,CLAUDE_CODE_MESSAGING_TOKEN:'fixture-token',CODEX_APP_TOOLS_PIPE_PATH:'fixture-pipe',CODEX_THREAD_ID:'fixture-thread'})){previous[key]=process.env[key];process.env[key]=value;}
    childProcess.execFileSync=(exe,args,options)=>exe===process.execPath&&args[0]==='--version'?'codex-cli 0.154.0-alpha.6.2':exe==='gh'?JSON.stringify({issue_url:'https://api.github.com/repos/ImpowerGames/impower/issues/548',body:`Fixture full report ${head}`}):originalExec(exe,args,options);
    childProcess.spawn=(exe,args,options)=>exe===process.execPath&&args[0]==='exec'?originalSpawn(exe,[child],{...options,env:{...options.env,FIXTURE_ARGV:JSON.stringify(args)}}):originalSpawn(exe,args,options);
    syncBuiltinESMExports();
    try{await runHandoff(configFile,{slotRoot:path.join(scratch,'launcher-slots')});}
    finally{childProcess.execFileSync=originalExec;childProcess.spawn=originalSpawn;syncBuiltinESMExports();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
    const journal=readClaudeRows(config.journal),launch=journal.find(row=>row.event==='launching'),observed=readJson(capture);
    assert.equal(journal.at(-1).event,'finished');assert.ok(journal.findIndex(row=>row.event==='exited')<journal.findIndex(row=>row.event==='completed'));
    assert.equal(observed.token,null);assert.equal(observed.pipe,null);assert.equal(observed.thread,null);assert.equal(observed.config,false);assert.notEqual(observed.home,sourceHome);
    assert.equal(observed.argv.at(-1),'-');assert.deepEqual(observed.argv,launch.args);assert.deepEqual(observed.argv.slice(0,-3),config.steps.check.args.slice(0,-1));assert.equal(observed.argv.at(-3),'--add-dir');
    assert.equal(observed.argv.at(-2),path.dirname(launch.completion));assert.notEqual(path.dirname(launch.output),path.dirname(launch.completion));assert.notEqual(path.dirname(launch.diagnostics),path.dirname(launch.completion));
    assert.match(fs.readFileSync(launch.diagnostics,'utf8'),/diagnostic after terminal/);assert.doesNotMatch(fs.readFileSync(launch.output,'utf8'),/diagnostic after terminal/);verifyNativeReviewResult(launch.output,'codex-jsonl');
    protectPrivatePath(path.dirname(launch.output),{verifyOnly:true});
    console.log('PASS: actual launcher child receives exact narrow argv, isolated credentials/config home and separate protected native evidence; real exit precedes completion');
  }else console.log('SKIP: automatic Codex launcher is Windows-only; shared argument and environment fixtures ran');

  // The same supervisor lifecycle uses the Claude adapter, not a second store.
  // Reset hook history to an idle origin before each private job admission.
  const idleRows=readClaudeRows(receipts).filter(row=>row.hook_event_name!=='UserPromptSubmit'||row.prompt_id===promptId).filter(row=>row.hook_event_name!=='Stop'||row.prompt_id===promptId).filter(row=>row.hook_event_name!=='MessageDisplay'||(!row.delta&&row.turn_id===turnId));
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
    const beforeClaim=fs.readFileSync(receipts,'utf8');
    record({hook_event_name:'UserPromptSubmit',prompt_id:randomUUID(),permission_mode:'default'});
    assert.throws(()=>verifyClaudeClaimConfiguration(f.saved.destination,f.saved,{env:{...env,CLAUDE_EFFORT:'low'},identify:()=>identity}),/claim.*(?:proof|configuration)|receiving/i,'a newer receiving turn cannot borrow prior Stop configuration');
    fs.writeFileSync(receipts,beforeClaim);
    const claimArgv=claudeClaimArgv(f.saved),command=renderClaudeClaimCommand(claimArgv),toolId=randomUUID();
    const claimEnv={...env,CLAUDE_EFFORT:'high',IMPOWER_CLAUDE_CLAIM_ID:f.saved.continuationId};
    const check=(extra={})=>verifyClaudeClaimConfiguration(f.saved.destination,f.saved,{env:claimEnv,argv:claimArgv,identify:()=>identity,...extra});
    assert.throws(()=>check(),/claim proof/,'prior incidental hooks cannot satisfy a fresh claim');
    record({hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:toolId,tool_input:{command},permission_mode:'dontAsk',effort:{level:'high'}});
    const proof=fs.readFileSync(receipts,'utf8');
    assert.equal(check().turnId,turnId);
    fs.writeFileSync(receipts,beforeClaim);record({hook_event_name:'Stop'});record({hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:toolId,tool_input:{command},permission_mode:'dontAsk',effort:{level:'high'}});
    assert.throws(()=>check(),/claim proof/,'an ended receiving prompt cannot admit another claim');fs.writeFileSync(receipts,proof);
    for(const event of [
      {hook_event_name:'PostToolUse',tool_name:'Bash',tool_use_id:toolId},
      {hook_event_name:'PostToolUseFailure',tool_name:'Bash',tool_use_id:toolId},
      {hook_event_name:'Stop'},
      {hook_event_name:'UserPromptSubmit',prompt_id:randomUUID()},
      {hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:randomUUID(),tool_input:{command:'echo incidental'},permission_mode:'dontAsk',effort:{level:'high'}},
      {hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:randomUUID(),tool_input:{command},permission_mode:'dontAsk',effort:{level:'high'}}
    ]){record(event);assert.throws(()=>check(),/claim proof/);fs.writeFileSync(receipts,proof);}
    for(const changed of [{CLAUDE_EFFORT:'low'},{CLAUDE_EFFORT:undefined},{IMPOWER_CLAUDE_CLAIM_ID:'other'}])assert.throws(()=>check({env:{...claimEnv,...changed}}),/claim proof/);
    assert.throws(()=>check({argv:[...claimArgv,'extra']}),/claim proof/);
    for(const changed of [{permission_mode:'default'},{effort:{level:'low'}},{prompt_id:randomUUID()},{tool_input:{command:command+' '}}]){
      fs.writeFileSync(receipts,beforeClaim);record({hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:toolId,tool_input:{command},permission_mode:'dontAsk',effort:{level:'high'},...changed});assert.throws(()=>check(),/claim proof/);
    }
    fs.writeFileSync(receipts,proof);
    assert.equal(claimReviewJob(f.input.jobDir,f.saved.continuationId,{threadId:sessionId,identify:()=>null,verifyConfiguration:()=>check()}).claimed,true);f.restore();
    console.log('PASS: claim requires current native effort, permission, receiving prompt and exact unended Bash command proof; stale, closed, duplicate and mismatched proofs refuse');
  }
  {
    const f=await fixture();f.complete();const submit=f.host.submit;let refused=true;
    f.host.submit=envelope=>refused?Promise.resolve({status:'not-sent',reason:'proven pre-send refusal'}):submit(envelope);
    await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,0);assert.equal(jobStatus(f.input.jobDir).state,'continuation-pending');
    assert.throws(()=>claimReviewJob(f.input.jobDir,f.saved.continuationId,{threadId:sessionId,identify:()=>null,verifyConfiguration:()=>{}}),/identity\/state/);
    refused=false;await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,1);assert.equal(jobStatus(f.input.jobDir).state,'continuation-accepted');
    assert.equal(readEvents(f.input.jobDir).filter(row=>row.event==='dispatch-refused').length,1);f.restore();
  }
  {
    const f=await fixture();f.complete();f.host.inspect=async()=>({state:'unknown'});let retracts=0;f.host.retract=async()=>{retracts++;return{status:'unsupported'};};
    await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});await cancelReviewJob(f.input.jobDir,f.host);await advanceReviewJob(f.input.jobDir,f.host,{identify:()=>null});assert.equal(f.sends,0);assert.equal(retracts,1);
    assert.deepEqual(readEvents(f.input.jobDir).at(-1).clear,{status:'unsupported'});f.restore();
  }
  console.log('PASS: Claude adapter shares worker-exit, disconnect/reconnect, uncertain acknowledgment, idempotent reconciliation, claim, and workflow cancellation gates');
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
