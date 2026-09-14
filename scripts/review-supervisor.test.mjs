import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { runHandoff } from './agent-handoff.mjs';
import { createReviewJob,advanceReviewJob,cancelReviewJob,claimReviewJob,jobStatus,launchReviewWorker,runReviewWorker,validateReviewPlan } from './review-supervisor.mjs';
import { appendEvent,withJob,readJson,readEvents,worktreePaths,assertJobFreeze } from './review-job-store.mjs';
import { processIdentity } from './reviewer-slots.mjs';
import { codexContinuationHost,verifyOriginConfiguration,verifyHostCatalog } from './continuation-host.mjs';

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'impower-supervisor-'));
console.log(`Scratch repository: ${scratch}`);
const repo=path.join(scratch,'repo');fs.mkdirSync(repo);
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true});
git('init','--quiet');git('-c','user.name=test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','fixture');
const head=git('rev-parse','HEAD').trim();
const prompt=path.join(scratch,'prompt.txt');fs.writeFileSync(prompt,'fixture');
const child=path.join(scratch,'child.mjs');
fs.writeFileSync(child,`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head:'${head}',next:null,commentIds:[],summary:'fixture'}));`);
const plan={worktree:repo,journal:path.join(scratch,'legacy.jsonl'),writer:'writer',reviewer:'reviewer',completedReviewRound:0,maxSteps:1,first:'work',continuation:{destination:'unavailable'},steps:{work:{role:'implement',model:'writer',executable:process.execPath,args:[child,'--model','writer'],prompt,next:[null]}}};
const file=path.join(scratch,'legacy.json');fs.writeFileSync(file,JSON.stringify(plan));
try {
  await assert.rejects(runHandoff(file),/Automatic continuation requires review-supervisor/,'automatic mode must refuse before an unverified destination can launch work');
  assert.equal(fs.existsSync(plan.journal),false);
  console.log('PASS: automatic mode cannot silently run as awaited mode');
  let index=0;
  const identify=()=>null;
  const fixture=async()=>{
    const freeze=worktreePaths(repo).freeze;if(fs.existsSync(freeze))fs.unlinkSync(freeze);
    const jobDir=path.join(scratch,`job-${index++}`);
    let sends=0,accepted=false,state='idle';
    const host={preflight:async()=>({supported:true}),inspect:async()=>({state}),submit:async()=>{sends++;accepted=true;return{queued:true};},reconcile:async()=>({status:accepted?'accepted':'uncertain',turnId:'native-turn'})};
    const input={worktree:repo,jobDir,head,base:head,pr:547,writer:'writer',writerEffort:'medium',permissions:{mode:'fixture'},reviewer:'reviewer',round:1,completedReviewRound:0,destination:{threadId:'origin',turnId:'old-turn',cwd:repo,credential:'must-stay-private'},reviews:[{id:'correctness',transport:'native-claude-json',executable:process.execPath,args:[child,'--model','reviewer','--effort','high','--permission-mode','dontAsk','--output-format','json'],effort:'high',permissions:'dontAsk',prompt}]};
    await createReviewJob(input,host);
    const p=readJson(path.join(jobDir,'plan.json'));
    const complete=()=>{
      withJob(jobDir,()=>{appendEvent(jobDir,'worker-launch-intent');appendEvent(jobDir,'worker-started',{identity:processIdentity(process.pid)});appendEvent(jobDir,'worker-finished',{ok:true});});
      const output=path.join(jobDir,'review.log');fs.writeFileSync(output,JSON.stringify({type:'result',subtype:'success',is_error:false,stop_reason:'end_turn'})+'\n');
      fs.writeFileSync(path.join(jobDir,'handoff.jsonl'),[{event:'launching',step:'correctness',completion:'report.json',output},{event:'exited',step:'correctness',code:0},{event:'completed',step:'correctness',head,completedRound:1,commentIds:[101]},{event:'finished'}].map(JSON.stringify).join('\n')+'\n');
    };
    return{jobDir,p,input,host,complete,get sends(){return sends;},disconnect(){state='disconnected';}};
  };
  {
    const f=await fixture();f.complete();
    const alias=`${scratch}${path.sep}.${path.sep}${path.basename(f.jobDir)}`;
    assert.doesNotThrow(()=>assertJobFreeze(f.p,alias),'equivalent absolute job-directory spellings must retain ownership');
    const other=path.join(scratch,'different-job');fs.mkdirSync(other);assert.throws(()=>assertJobFreeze(f.p,other),/another automatic job/);
    await advanceReviewJob(f.jobDir,f.host);assert.equal(f.sends,0,'live worker prevents continuation even with a completed journal');
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,1);assert.equal(jobStatus(f.jobDir).state,'continuation-accepted');
    assert.equal(JSON.stringify(readEvents(f.jobDir).find(row=>row.event==='continuation-pending').envelope).includes('must-stay-private'),false);
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,1);
    assert.throws(()=>launchReviewWorker(f.jobDir),/already launched/);
    assert.throws(()=>claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'other',identify}),/identity/);
    assert.equal(claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify}).claimed,true);
    assert.equal(fs.existsSync(worktreePaths(repo).freeze),false);
    assert.equal(claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify}).alreadyClaimed,true);
  }
  {
    const f=await fixture();f.complete();f.host.submit=async()=>{throw new Error('lost acknowledgment');};
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(jobStatus(f.jobDir).state,'delivery-uncertain');
    f.host.submit=async()=>{assert.fail('uncertain delivery must not resend');};
    await advanceReviewJob(f.jobDir,f.host,{identify});
    f.host.reconcile=async()=>({status:'accepted',turnId:'same-active-turn'});
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(readEvents(f.jobDir).at(-1).turnId,'same-active-turn');
  }
  for(const point of ['after-validation','before-submit','after-submit']) {
    const f=await fixture();f.complete();
    try{await advanceReviewJob(f.jobDir,f.host,{identify,failpoint:p=>{if(p===point)throw new Error(`crash ${point}`);}});}catch(error){assert.match(error.message,/crash/);}
    await advanceReviewJob(f.jobDir,f.host,{identify});
    assert.equal(f.sends,point==='before-submit'?0:1,point);
    if(point==='before-submit')assert.equal(jobStatus(f.jobDir).state,'delivery-uncertain');
  }
  {
    const f=await fixture();f.complete();f.disconnect();await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(jobStatus(f.jobDir).state,'continuation-pending');assert.equal(f.sends,0);
    const order=[];f.host.retract=async()=>{order.push('clear');assert.equal(jobStatus(f.jobDir).state,'workflow-cancelled');throw new Error('not supported');};f.host.cancelTurn=async()=>{order.push('cancel');return{status:'requested'};};
    await cancelReviewJob(f.jobDir,f.host);assert.deepEqual(order,['clear','cancel']);await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,0);
    assert.throws(()=>claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify}),/identity/);
  }
  {
    const f=await fixture();f.complete();await advanceReviewJob(f.jobDir,f.host,{identify,failpoint:async point=>{if(point==='before-submit')await cancelReviewJob(f.jobDir,f.host);}});assert.equal(f.sends,0,'cancel wins admission race');
  }
  {
    const f=await fixture(),lock=path.join(f.jobDir,'mutation.lock');fs.writeFileSync(lock,JSON.stringify({token:'busy',identity:processIdentity(process.pid)}));
    setTimeout(()=>fs.unlinkSync(lock),50);await cancelReviewJob(f.jobDir,f.host);assert.equal(jobStatus(f.jobDir).state,'workflow-cancelled','brief monitor contention must not discard cancellation');
  }
  {
    const f=await fixture();f.complete();fs.writeFileSync(path.join(repo,'changed'),'dirty');await assert.rejects(advanceReviewJob(f.jobDir,f.host,{identify}),/changed/);assert.equal(f.sends,0);fs.unlinkSync(path.join(repo,'changed'));
    const journal=path.join(f.jobDir,'handoff.jsonl');fs.writeFileSync(journal,fs.readFileSync(journal,'utf8').replace('"commentIds":[101]','"commentIds":[]'));await assert.rejects(advanceReviewJob(f.jobDir,f.host,{identify}),/coverage/);
  }
  {
    const f=await fixture();f.complete();fs.appendFileSync(path.join(f.jobDir,'events.jsonl'),'{');assert.throws(()=>jobStatus(f.jobDir),/Truncated/);
  }
  {
    const f=await fixture();const rollout=path.join(scratch,'rollout.jsonl');
    const destination={...f.p.destination,rollout};const permissions={approvalPolicy:'never',sandboxPolicy:{type:'danger-full-access'}};
    fs.writeFileSync(rollout,[{type:'session_meta',payload:{id:'origin'}},{type:'turn_context',payload:{turn_id:'old-turn',cwd:repo,model:'writer',effort:'medium',approval_policy:'never',sandbox_policy:{type:'danger-full-access'}}}].map(JSON.stringify).join('\n')+'\n');
    verifyOriginConfiguration(destination,{...f.p,permissions});assert.throws(()=>verifyOriginConfiguration(destination,{...f.p,permissions,writer:'wrong'}),/mismatch/);
    await assert.rejects(codexContinuationHost({platform:'linux'}).preflight(destination,f.p),/awaited/);
    const native=codexContinuationHost({platform:'win32',env:{CODEX_THREAD_ID:'origin',CODEX_APP_TOOLS_PIPE_PATH:'fixture'},request:async()=>({success:true,contentItems:[{type:'inputText',text:JSON.stringify({thread:{id:'origin',hostId:'local',cwd:repo,status:{type:'active'}},page:{order:'newest_first',hasMore:false},turns:[{id:'old-turn',items:[{type:'functionCallOutput',name:'send_message_to_thread',namespace:'codex_app',output:{truncated:false,text:`<source_thread_id>origin</source_thread_id><input>Review continuation ${f.p.continuationId}:`}}]}]})}]})});
    assert.deepEqual(await native.reconcile({destination,continuationId:f.p.continuationId}),{status:'accepted',turnId:'old-turn'});
  }
  {
    const f=await fixture();
    assert.throws(()=>validateReviewPlan({...f.input,base:'0'.repeat(40)}),/existing commit/);
    const blob=execFileSync('git',['hash-object','-w','--stdin'],{cwd:repo,input:'fixture blob',encoding:'utf8',windowsHide:true}).trim();
    assert.throws(()=>validateReviewPlan({...f.input,base:blob}),/existing commit/);
    f.complete();withJob(f.jobDir,()=>{appendEvent(f.jobDir,'submission-intent');appendEvent(f.jobDir,'blocked',{reason:'fixture'});});
    assert.equal(jobStatus(f.jobDir).state,'blocked');await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,0);
    const outcome=childProcess.spawnSync(process.execPath,[path.resolve('scripts/review-supervisor.mjs'),'run',f.jobDir],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(outcome.status,0,'blocked monitor exits instead of spinning');
  }
  {
    const f=await fixture();f.complete();fs.writeFileSync(path.join(f.jobDir,'review.log'),JSON.stringify({type:'result',subtype:'success',is_error:false,stop_reason:'interrupt'}));
    await assert.rejects(advanceReviewJob(f.jobDir,f.host,{identify}),/interrupted/);assert.equal(f.sends,0);
  }
  {
    const catalog={tools:[{name:'send_message_to_thread',namespace:'codex_app',inputSchema:{type:'object',additionalProperties:false,required:['threadId','prompt'],properties:{threadId:{type:'string'},prompt:{type:'string'}}}},{name:'read_thread',namespace:'codex_app',inputSchema:{type:'object',additionalProperties:false,required:['threadId'],properties:{threadId:{type:'string'},cursor:{type:'string'},turnLimit:{type:'integer'},includeOutputs:{type:'boolean'},maxOutputCharsPerItem:{type:'integer'}}}}]};
    verifyHostCatalog(catalog);assert.throws(()=>verifyHostCatalog({tools:[]}),/capability/);catalog.tools[0].inputSchema.required.push('model');assert.throws(()=>verifyHostCatalog(catalog),/capability/);
    const f=await fixture();const native=codexContinuationHost({platform:'win32',env:{CODEX_THREAD_ID:'origin',CODEX_APP_TOOLS_PIPE_PATH:'fixture'},request:async()=>({tools:[]})});
    const jobDir=path.join(scratch,'unsupported-job');await assert.rejects(createReviewJob({...f.input,jobDir},native),/capability/);assert.equal(fs.existsSync(jobDir),false);
  }
  {
    const f=await fixture();
    fs.writeFileSync(child,`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head:'${head}',next:null,commentIds:[101],summary:'fixture review'}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,stop_reason:'end_turn'}));`);
    withJob(f.jobDir,()=>appendEvent(f.jobDir,'worker-launch-intent'));
    const original=childProcess.execFileSync;
    childProcess.execFileSync=(exe,args,options)=>exe==='gh'?JSON.stringify({issue_url:'https://api.github.com/repos/ImpowerGames/impower/issues/547',body:`Fixture report for ${head}`}):original(exe,args,options);
    syncBuiltinESMExports();
    try{await runReviewWorker(f.jobDir+path.sep+'.',{slotRoot:path.join(scratch,'slots')});}finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
    assert.equal(readEvents(f.jobDir).at(-1).event,'worker-finished');
    await advanceReviewJob(f.jobDir,f.host);assert.equal(f.sends,0,'worker completion alone is not process exit');
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,1);
    const interrupted=await fixture();
    fs.writeFileSync(child,fs.readFileSync(child,'utf8').replace("stop_reason:'end_turn'","stop_reason:'interrupt'"));
    withJob(interrupted.jobDir,()=>appendEvent(interrupted.jobDir,'worker-launch-intent'));
    await assert.rejects(runReviewWorker(interrupted.jobDir,{slotRoot:path.join(scratch,'slots')}),/interrupted/);
    assert.equal(readEvents(interrupted.jobDir).at(-1).ok,false);
    assert.equal(fs.readFileSync(path.join(interrupted.jobDir,'handoff.jsonl'),'utf8').includes('"event":"completed"'),false,'native interruption rejects before report validation or another reviewer');
  }
  console.log('PASS: durable lifecycle, frozen claim, unknown delivery, crash boundaries, cancellation admission, report coverage, native identity, same-turn reconciliation and guarded real child execution');
} finally { fs.rmSync(scratch,{recursive:true,force:true}); }
