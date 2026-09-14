import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { runHandoff,verifyNativeReviewResult } from './agent-handoff.mjs';
import { createReviewJob,advanceReviewJob,cancelReviewJob,claimReviewJob as actualClaim,jobStatus,launchReviewWorker,runReviewWorker,validateReviewPlan,runReviewMonitor,resumeReviewJob,recoverMonitor,releaseStoppedJob } from './review-supervisor.mjs';
import { appendEvent,withJob,readJson,readEvents,worktreePaths,assertJobFreeze,retryBusy,recoverJobLock } from './review-job-store.mjs';
import { processIdentity } from './reviewer-slots.mjs';
import { codexContinuationHost,verifyOriginConfiguration,verifyHostCatalog } from './continuation-host.mjs';
const claimReviewJob=(dir,id,options)=>actualClaim(dir,id,{verifyConfiguration:()=>({turnId:'fixture-turn'}),...options});

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
    assert.equal(f.sends,1,point);
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
    const f=await fixture();f.complete();
    await advanceReviewJob(f.jobDir,f.host,{identify,failpoint:point=>{if(point==='before-submit'){const lock=path.join(f.jobDir,'mutation.lock');fs.writeFileSync(lock,'busy');setTimeout(()=>fs.unlinkSync(lock),25);}}});
    assert.equal(f.sends,1,'temporary send admission contention does not strand unsent intent');
    assert.throws(()=>claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify,verifyConfiguration:()=>{throw new Error('configuration changed');}}),/configuration changed/);
    withJob(f.jobDir,()=>appendEvent(f.jobDir,'blocked',{reason:'fixture'}));
    assert.equal(jobStatus(f.jobDir).state,'blocked');assert.throws(()=>claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify}),/identity/);
  }
  {
    const f=await fixture();
    for(const changes of [{completedReviewRound:1,round:2},{completedReviewRound:3,round:3,reviewedHead:head},{extendedReviewAuthorization:'invalid'}])await assert.rejects(createReviewJob({...f.input,...changes,jobDir:path.join(scratch,'bad-recovery')},f.host),/reviewedHead|finalCorrections|extendedReviewAuthorization/);
    assert.equal(fs.existsSync(path.join(scratch,'bad-recovery')),false);
    for(const flag of ['--fallback-model','--settings','--agents','--append-system-prompt'])assert.throws(()=>validateReviewPlan({...f.input,reviews:[{...f.input.reviews[0],args:[...f.input.reviews[0].args,flag,'override']}]}),/Unsupported automatic/);
  }
  {
    const f=await fixture();f.complete();f.disconnect();
    let time=0;const clock={identify,now:()=>time,wait:async ms=>{time+=ms;},pendingMs:1};
    assert.equal((await runReviewMonitor(f.jobDir,f.host,clock)).state,'monitor-suspended');assert.equal(f.sends,0);
    f.host.inspect=async()=>({state:'idle'});await resumeReviewJob(f.jobDir);
    assert.equal((await runReviewMonitor(f.jobDir,f.host,clock)).state,'continuation-accepted');assert.equal(f.sends,1,'same-job reconnect does not repeat review');
    claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify});assert.equal((await runReviewMonitor(f.jobDir,f.host,clock)).state,'claimed');
    const pending=await fixture();pending.complete();pending.host.submit=async()=>({queued:true});time=0;
    assert.equal((await runReviewMonitor(pending.jobDir,pending.host,clock)).state,'monitor-suspended');
    pending.host.submit=async()=>assert.fail('uncertain send retried');await resumeReviewJob(pending.jobDir);time=0;await runReviewMonitor(pending.jobDir,pending.host,clock);
    const unregistered=await fixture();withJob(unregistered.jobDir,()=>appendEvent(unregistered.jobDir,'worker-launch-intent'));
    assert.equal((await runReviewMonitor(unregistered.jobDir,unregistered.host,{...clock,registrationMs:0})).state,'monitor-suspended');
    await cancelReviewJob(unregistered.jobDir,unregistered.host);assert.throws(()=>releaseStoppedJob(unregistered.jobDir,{identify}),/uncertain/);
  }
  {
    const f=await fixture();f.complete();
    const unknown=()=>{throw new Error('Process start identity unavailable');};
    assert.equal((await runReviewMonitor(f.jobDir,f.host,{identify:unknown})).state,'monitor-suspended');
    await cancelReviewJob(f.jobDir,f.host);assert.throws(()=>releaseStoppedJob(f.jobDir,{identify:unknown}),/unavailable/);
    assert.equal(releaseStoppedJob(f.jobDir,{identify}).released,true);
    const durable=await fixture();durable.complete();durable.disconnect();await advanceReviewJob(durable.jobDir,durable.host,{identify});
    assert.ok(readEvents(durable.jobDir).some(row=>row.event==='worker-exit-observed'));
    await cancelReviewJob(durable.jobDir,durable.host);assert.equal(releaseStoppedJob(durable.jobDir,{identify:unknown}).released,true,'durable independently observed exit survives later unreadable PID reuse');
    const lock=path.join(durable.jobDir,'mutation.lock');fs.writeFileSync(lock,JSON.stringify({token:'live',identity:processIdentity(process.pid)}));assert.throws(()=>recoverJobLock(durable.jobDir),/still running/);fs.unlinkSync(lock);
    const owned=childProcess.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    const closed=new Promise((resolve,reject)=>{owned.once('error',reject);owned.once('close',resolve);});let stoppedIdentity;
    try{stoppedIdentity=processIdentity(owned.pid);assert.ok(stoppedIdentity?.start);}finally{owned.kill();await closed;}
    fs.writeFileSync(lock,JSON.stringify({token:'observed-dead',identity:stoppedIdentity}));recoverJobLock(durable.jobDir);
    assert.equal(fs.existsSync(lock),false,'actual exited owner permits mutation-lock recovery');assert.equal(fs.existsSync(path.join(durable.jobDir,'mutation.recovery')),false);
    fs.writeFileSync(path.join(durable.jobDir,'monitor.lock'),JSON.stringify({token:'live',identity:processIdentity(process.pid)}));await assert.rejects(recoverMonitor(durable.jobDir),/still running/);await recoverMonitor(durable.jobDir,{identify});
    let time=0,attempts=0;await assert.rejects(retryBusy(()=>{attempts++;throw Object.assign(new Error('busy'),{code:'EEXIST'});},{timeoutMs:100,now:()=>time,wait:async ms=>{time+=ms;}}),/busy/);assert.equal(attempts,2);
  }
  {
    const f=await fixture();f.complete();
    f.host.reconcile=async()=>{await cancelReviewJob(f.jobDir,f.host);return{status:'accepted',turnId:'received-before-cancel'};};
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(jobStatus(f.jobDir).state,'workflow-cancelled');assert.ok(readEvents(f.jobDir).some(row=>row.event==='continuation-accepted'));assert.throws(()=>claimReviewJob(f.jobDir,f.p.continuationId,{threadId:'origin',identify}),/identity/);
  }
  {
    const f=await fixture();f.complete();f.disconnect();await advanceReviewJob(f.jobDir,f.host,{identify});
    let entered,finish;const enteredPromise=new Promise(resolve=>{entered=resolve;});
    f.host.inspect=()=>{entered();return new Promise(resolve=>{finish=resolve;});};
    const first=runReviewMonitor(f.jobDir,f.host,{pendingMs:0});await enteredPromise;
    const second=JSON.parse(execFileSync(process.execPath,[path.resolve('scripts/review-supervisor.mjs'),'run',f.jobDir],{encoding:'utf8',windowsHide:true}));
    assert.equal(second.state,'monitor-running','a real second process cannot create another active monitor');
    finish({state:'disconnected'});await first;assert.equal(fs.existsSync(path.join(f.jobDir,'monitor.lock')),false);
    const cursor=readEvents(f.jobDir).at(-2).sequence;
    const watcher=childProcess.spawn(process.execPath,[path.resolve('scripts/review-supervisor.mjs'),'watch',f.jobDir,String(cursor)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const closed=new Promise(resolve=>watcher.once('close',resolve));
    try{const row=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('watch deadline')),5000);watcher.stdout.once('data',data=>{clearTimeout(timer);resolve(JSON.parse(data.toString().trim().split('\n')[0]));});});assert.equal(row.sequence,cursor+1);assert.equal(row.eventId,readEvents(f.jobDir).at(-1).eventId);}finally{watcher.kill();await closed;}
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
    for(const status of ['failed','interrupted']) {
      const receiver=codexContinuationHost({platform:'win32',env:{CODEX_THREAD_ID:'origin',CODEX_APP_TOOLS_PIPE_PATH:'fixture'},request:async()=>({success:true,contentItems:[{type:'inputText',text:JSON.stringify({thread:{id:'origin',hostId:'local',cwd:repo},page:{order:'newest_first',hasMore:false},turns:[{id:'received-turn',status,error:{message:'after receipt'},items:[{type:'functionCallOutput',name:'send_message_to_thread',namespace:'codex_app',output:{truncated:false,text:`<source_thread_id>origin</source_thread_id><input>Review continuation ${f.p.continuationId}:`}}]}]})}]})});
      assert.equal((await receiver.reconcile({destination,continuationId:f.p.continuationId})).status,'accepted','receipt remains a receipt when receiving turn later fails');
    }
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
    verifyHostCatalog(catalog);assert.throws(()=>verifyHostCatalog({tools:[]}),/capability/);catalog.tools[0].inputSchema.required.push('model');assert.throws(()=>verifyHostCatalog(catalog),/capability/);catalog.tools[0].inputSchema.required.pop();
    const f=await fixture();const native=codexContinuationHost({platform:'win32',env:{CODEX_THREAD_ID:'origin',CODEX_APP_TOOLS_PIPE_PATH:'fixture'},request:async()=>({tools:[]})});
    const jobDir=path.join(scratch,'unsupported-job');await assert.rejects(createReviewJob({...f.input,jobDir},native),/capability/);assert.equal(fs.existsSync(jobDir),false);
    const permissions={approvalPolicy:'never',sandboxPolicy:{type:'danger-full-access'}},destination={...f.input.destination,rollout:path.join(scratch,'rollout.jsonl')};
    const calls=[],success=codexContinuationHost({platform:'win32',env:{CODEX_THREAD_ID:'origin',CODEX_APP_TOOLS_PIPE_PATH:'fixture'},request:async(_endpoint,method,params)=>{
      if(method==='tools/list')return catalog;calls.push(params);
      return{success:true,contentItems:[{type:'inputText',text:JSON.stringify(params.tool==='send_message_to_thread'?{queued:true}:{thread:{id:'origin',hostId:'local',cwd:repo,status:{type:'active'}},turns:[{id:'old-turn'}]})}]};
    }});
    const supported={...f.input,destination,permissions,continuationId:'unique-marker',jobDir:path.join(scratch,'preflight-supported')};
    assert.equal((await success.preflight(destination,supported)).supported,true);assert.equal((await success.inspect(destination,supported)).state,'active');await success.submit({destination:{threadId:'origin',turnId:'old-turn',cwd:repo},continuationId:'unique-marker'});
    const sent=calls.find(call=>call.tool==='send_message_to_thread');assert.deepEqual(Object.keys(sent.arguments).sort(),['prompt','threadId']);assert.equal(sent.threadId,'origin');assert.equal(sent.turnId,'old-turn');
    fs.appendFileSync(destination.rollout,JSON.stringify({type:'turn_context',payload:{turn_id:'new-turn',cwd:repo,model:'wrong',effort:'medium',approval_policy:'never',sandbox_policy:{type:'danger-full-access'}}})+'\n');
    f.complete();await advanceReviewJob(f.jobDir,f.host,{identify});const stored=readJson(path.join(f.jobDir,'plan.json'));stored.destination=destination;stored.permissions=permissions;fs.writeFileSync(path.join(f.jobDir,'plan.json'),JSON.stringify(stored));
    assert.throws(()=>actualClaim(f.jobDir,f.p.continuationId,{threadId:'origin',identify}),/mismatch/,'claim verifies the latest native configuration, not the old dispatch turn');
  }
  {
    const f=await fixture();
    fs.writeFileSync(child,`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head:'${head}',next:null,commentIds:[101],summary:'fixture review'}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,stop_reason:'end_turn'}));console.error('late shutdown diagnostic');`);
    withJob(f.jobDir,()=>appendEvent(f.jobDir,'worker-launch-intent'));
    const original=childProcess.execFileSync;
    childProcess.execFileSync=(exe,args,options)=>exe==='gh'?JSON.stringify({issue_url:'https://api.github.com/repos/ImpowerGames/impower/issues/547',body:`Fixture report for ${head}`}):original(exe,args,options);
    syncBuiltinESMExports();
    try{await runReviewWorker(f.jobDir+path.sep+'.',{slotRoot:path.join(scratch,'slots')});}finally{childProcess.execFileSync=original;syncBuiltinESMExports();}
    assert.equal(readEvents(f.jobDir).at(-1).event,'worker-finished');
    const launch=fs.readFileSync(path.join(f.jobDir,'handoff.jsonl'),'utf8').trim().split('\n').map(JSON.parse).find(row=>row.event==='launching');assert.match(fs.readFileSync(launch.diagnostics,'utf8'),/late shutdown/);assert.doesNotMatch(fs.readFileSync(launch.output,'utf8'),/late shutdown/);
    await advanceReviewJob(f.jobDir,f.host);assert.equal(f.sends,0,'worker completion alone is not process exit');
    await advanceReviewJob(f.jobDir,f.host,{identify});assert.equal(f.sends,1);
    const lost=await fixture();let captured,closed=false;
    const originalSpawn=childProcess.spawn;
    childProcess.spawn=(...args)=>{captured=originalSpawn(...args);captured.once('close',()=>{closed=true;});fs.unlinkSync(path.join(lost.jobDir,'mutation.lock'));return captured;};syncBuiltinESMExports();
    try{
      await assert.rejects(runHandoff(path.join(lost.jobDir,'handoff.json'),{slotRoot:path.join(scratch,'lost-slot'),automaticJob:{jobId:lost.p.jobId,jobDir:lost.jobDir}}),/ENOENT/);
      assert.equal(closed,true,'post-spawn admission cleanup failure must retain and await the actual child handle');
      assert.equal(fs.existsSync(worktreePaths(repo).lock),false,'worktree release follows confirmed close');
    }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();if(captured&&!closed){const ended=new Promise(resolve=>captured.once('close',resolve));captured.kill();await ended;}}
    const interrupted=await fixture();
    fs.writeFileSync(child,fs.readFileSync(child,'utf8').replace("stop_reason:'end_turn'","stop_reason:'interrupt'"));
    withJob(interrupted.jobDir,()=>appendEvent(interrupted.jobDir,'worker-launch-intent'));
    await assert.rejects(runReviewWorker(interrupted.jobDir,{slotRoot:path.join(scratch,'slots')}),/interrupted/);
    assert.equal(readEvents(interrupted.jobDir).at(-1).ok,false);
    assert.equal(fs.readFileSync(path.join(interrupted.jobDir,'handoff.jsonl'),'utf8').includes('"event":"completed"'),false,'native interruption rejects before report validation or another reviewer');
  }
  for(const boundary of ['between-reviewers','admission']) {
    const f=await fixture(),config=readJson(path.join(f.jobDir,'handoff.json'));
    config.maxSteps=2;config.steps.second={...config.steps.correctness,next:[null]};config.steps.correctness.next=['second'];fs.writeFileSync(path.join(f.jobDir,'handoff.json'),JSON.stringify(config));
    fs.writeFileSync(child,`import fs from 'node:fs';let text='';for await(const c of process.stdin)text+=c;fs.writeFileSync(/Write (.*?) with the editor tool/.exec(text)[1],JSON.stringify({head:'${head}',next:text.includes('Allowed next steps: ["second"]')?'second':null,commentIds:[101],summary:'fixture review'}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,stop_reason:'end_turn'}));`);
    const originalExec=childProcess.execFileSync,originalOpen=fs.openSync;let cancelled=false;
    const cancel=()=>{if(!cancelled){cancelled=true;withJob(f.jobDir,()=>appendEvent(f.jobDir,'workflow-cancelled'));}};
    childProcess.execFileSync=(exe,args,options)=>{if(exe!=='gh')return originalExec(exe,args,options);if(boundary==='between-reviewers')cancel();return JSON.stringify({issue_url:'https://api.github.com/repos/ImpowerGames/impower/issues/547',body:head});};
    fs.openSync=(file,...args)=>{if(boundary==='admission'&&String(file).includes('handoff-1-review-')&&path.basename(String(file))==='process.log')cancel();return originalOpen(file,...args);};syncBuiltinESMExports();
    try{await assert.rejects(runHandoff(path.join(f.jobDir,'handoff.json'),{slotRoot:path.join(scratch,'cancel-slots'),automaticJob:{jobId:f.p.jobId,jobDir:f.jobDir}}),/cancelled/);}finally{childProcess.execFileSync=originalExec;fs.openSync=originalOpen;syncBuiltinESMExports();}
    const rows=fs.readFileSync(path.join(f.jobDir,'handoff.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.filter(row=>row.event==='running').length,1,`${boundary} prevents second reviewer spawn`);
  }
  {
    const huge=path.join(scratch,'oversize-result');const fd=fs.openSync(huge,'wx');fs.ftruncateSync(fd,16*1024*1024+1);fs.closeSync(fd);assert.throws(()=>verifyNativeReviewResult(huge),/bounded inspection/);
    const rollout=path.join(scratch,'oversize-rollout');const log=fs.openSync(rollout,'wx');fs.ftruncateSync(log,128*1024*1024+1);fs.closeSync(log);assert.throws(()=>verifyOriginConfiguration({rollout},{}),/bounded inspection/);
  }
  console.log('PASS: durable lifecycle, frozen claim, unknown delivery, crash boundaries, cancellation admission, report coverage, native identity, same-turn reconciliation and guarded real child execution');
} finally { fs.rmSync(scratch,{recursive:true,force:true}); }
