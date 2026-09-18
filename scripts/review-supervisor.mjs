import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runHandoff,checkReviewRound,verifyNativeReviewResult,validateReviewRecovery,validateNativeReviewArgs,configuredRoute } from './agent-handoff.mjs';
import { reviewerEnvironment } from './reviewer-security.mjs';
import { checkWriterEffort } from './reviewer-defaults.mjs';
import { verifyClaimConfiguration } from './continuation-host.mjs';
import { processIdentity } from './reviewer-slots.mjs';
import { nativeResultType,validateCodexReviewer,verifyReviewerExecutable } from './native-reviewer.mjs';
import { readJson,writeExclusive,git,readEvents,appendEvent,withJob,retryBusy,recoverJobLock,alive,sameIdentity,currentIdentity,assertFrozen,reserveFreeze,assertJobFreeze,worktreePaths,failureDetails } from './review-job-store.mjs';

const here=fileURLToPath(import.meta.url);
const last=(rows,event)=>rows.findLast(row=>row.event===event);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const blocked=rows=>(last(rows,'blocked')?.sequence??0)>(last(rows,'resume-requested')?.sequence??0);
const suspended=rows=>(last(rows,'monitor-suspended')?.sequence??0)>(last(rows,'monitor-started')?.sequence??0);
const exitObserved=(rows,worker)=>rows.some(row=>row.event==='worker-exit-observed'&&sameIdentity(row.identity,worker?.identity));
const submissionOutstanding=rows=>(last(rows,'submission-intent')?.sequence??0)>(last(rows,'dispatch-refused')?.sequence??0);
const terminalSubmissionOutstanding=rows=>(last(rows,'terminal-submission-intent')?.sequence??0)>(last(rows,'terminal-dispatch-refused')?.sequence??0);
export function jobStatus(dir,events=readEvents(dir)) {
  const diagnostic=path.join(dir,'monitor-failure.json');
  if(fs.existsSync(diagnostic)){
    const failure=readJson(diagnostic);
    const lock=path.join(dir,'monitor.lock'),token=fs.existsSync(lock)?readJson(lock).token:last(events,'monitor-started')?.token;
    if(failure.token===token&&!last(events,'claimed')&&!last(events,'workflow-cancelled')&&!last(events,'continuation-accepted')&&!blocked(events)&&last(events,'worker-finished')?.ok!==false&&!last(events,'worker-launch-failed'))return{jobId:events[0].jobId,sequence:events.at(-1).sequence,state:'monitor-suspended',failure,events};
  }
  return {jobId:events[0].jobId,sequence:events.at(-1).sequence,state:last(events,'workflow-cancelled')?'workflow-cancelled':blocked(events)?'blocked':last(events,'claimed')?'claimed':last(events,'continuation-accepted')?'continuation-accepted':last(events,'worker-finished')?.ok===false||last(events,'worker-launch-failed')?'review-failed':suspended(events)?'monitor-suspended':submissionOutstanding(events)?'delivery-uncertain':last(events,'continuation-pending')?'continuation-pending':last(events,'worker-started')?'review-running':last(events,'worker-launch-intent')?'registration-pending':'accepted',events};
}
export function validateReviewPlan(input,{validateArgs=validateNativeReviewArgs}={}) {
  const plan=structuredClone(input);
  if(!path.isAbsolute(plan.worktree)||!path.isAbsolute(plan.jobDir))throw new Error('Absolute worktree and private jobDir required');
  plan.worktree=fs.realpathSync.native(plan.worktree);plan.jobDir=path.resolve(plan.jobDir);
  plan.commonGit=git(plan.worktree,['rev-parse','--path-format=absolute','--git-common-dir']);
  if(!/^[a-f0-9]{40}$/.test(plan.head??'')||!/^[a-f0-9]{40}$/.test(plan.base??''))throw new Error('Full frozen head and base required');
  if(!Number.isSafeInteger(plan.pr)||plan.pr<1||!plan.writer||!plan.reviewer||configuredRoute(plan.writer)===configuredRoute(plan.reviewer))throw new Error('PR and distinct explicit model routes required');
  if(!plan.destination||!plan.destination.threadId||!plan.destination.turnId||!plan.destination.cwd)throw new Error('Originating destination identity required');
  if(!plan.writerEffort||!plan.permissions||!Array.isArray(plan.reviews)||plan.reviews.length<1||plan.reviews.length>4)throw new Error('Exact routing, permissions and bounded coverage required');
  checkWriterEffort(plan.writer,plan.writerEffort);
  const limit=plan.reviewRoundLimit??3;
  validateReviewRecovery(plan);
  if(!Number.isInteger(limit)||limit<1||limit>10||(limit>3&&typeof plan.extendedReviewAuthorization!=='string'))throw new Error('Invalid review limit/authorization');
  checkReviewRound(plan.round,plan.completedReviewRound,plan.finalCorrections??false,limit);
  if(!Number.isInteger(plan.completedReviewRound)||plan.completedReviewRound<0)throw new Error('Recorded review round required');
  const ids=new Set(),reviewerRoots=[];
  for(const review of plan.reviews) {
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(review.id??'')||ids.has(review.id)||!path.isAbsolute(review.executable??'')||!path.isAbsolute(review.prompt??'')||!review.effort||!Array.isArray(review.args)||!review.args.every(a=>typeof a==='string'))throw new Error('Explicit independent reviewer coverage and launch required');
    ids.add(review.id);
    const at=review.args.findIndex(a=>a==='--model'||a==='-m');
    if(at<0||review.args[at+1]!==plan.reviewer)throw new Error('Reviewer model argument mismatch');
    if(review.transport==='native-codex-jsonl') {
      validateCodexReviewer(review,plan);
      const root=fs.realpathSync.native(review.permissions.cwd);
      if(reviewerRoots.some(other=>{const rel=path.relative(other,root),back=path.relative(root,other);return !rel||(!rel.startsWith('..')&&!path.isAbsolute(rel))||(!back.startsWith('..')&&!path.isAbsolute(back));}))throw new Error('Independent reviewers require disjoint private working directories and reports');
      reviewerRoots.push(root);
    }
    else {
    for(const [flag,value] of [['--effort',review.effort],['--permission-mode',review.permissions]])if(typeof value!=='string'||!value||review.args.filter(a=>a===flag).length!==1||review.args[review.args.indexOf(flag)+1]!==value)throw new Error('Explicit native reviewer effort and permissions required');
    if(review.args.filter(a=>a==='--model'||a==='-m').length!==1)throw new Error('Ambiguous reviewer model arguments');
    if(review.transport!=='native-claude-json'||review.args.filter(a=>a==='--output-format').length!==1||review.args[review.args.indexOf('--output-format')+1]!=='json')throw new Error('Automatic review requires native Claude JSON result transport');
    validateArgs(review);
    if(review.args.some(a=>/^(?:--model|--effort|--permission-mode|--output-format)=|^-m./.test(a)||['--dangerously-skip-permissions','--allow-dangerously-skip-permissions'].includes(a)))throw new Error('Ambiguous native reviewer configuration');
    }
    if(!fs.statSync(review.prompt).isFile())throw new Error('Reviewer prompt missing');
    if(!fs.statSync(review.executable).isFile())throw new Error('Reviewer executable missing');
  }
  assertFrozen(plan);
  return plan;
}
export async function createReviewJob(input,host,{verifyExecutable=verifyReviewerExecutable,...validation}={}) {
  const plan=validateReviewPlan(input,validation);plan.jobId=randomUUID();plan.continuationId=randomUUID();
  for(const review of plan.reviews)verifyExecutable(review);
  // The adapter validates private storage containment and exact host identity.
  const capability=await host.preflight(plan.destination,plan);
  if(capability?.supported!==true)throw new Error('Automatic continuation unsupported; use awaited mode');
  fs.mkdirSync(plan.jobDir);
  writeExclusive(path.join(plan.jobDir,'plan.json'),plan);
  writeExclusive(path.join(plan.jobDir,'events.jsonl'),{version:1,sequence:1,eventId:randomUUID(),jobId:plan.jobId,time:new Date().toISOString(),event:'accepted',capability});
  try {reserveFreeze(plan,plan.jobDir);}catch(error){withJob(plan.jobDir,()=>appendEvent(plan.jobDir,'blocked',{reason:error.message}));throw error;}
  const steps=Object.fromEntries(plan.reviews.map((review,index)=>[review.id,{role:'review',round:plan.round,model:plan.reviewer,nativeResult:nativeResultType(review.transport),effort:review.effort,permissions:review.permissions,executable:review.executable,args:review.args,prompt:review.prompt,next:[plan.reviews[index+1]?.id??null]}]));
  writeExclusive(path.join(plan.jobDir,'handoff.json'),{worktree:plan.worktree,journal:path.join(plan.jobDir,'handoff.jsonl'),pr:plan.pr,writer:plan.writer,writerEffort:plan.writerEffort,reviewer:plan.reviewer,completedReviewRound:plan.completedReviewRound,reviewedHead:plan.reviewedHead,finalCorrections:plan.finalCorrections,reviewRoundLimit:plan.reviewRoundLimit,extendedReviewAuthorization:plan.extendedReviewAuthorization,maxSteps:plan.reviews.length,first:plan.reviews[0].id,steps});
  return jobStatus(plan.jobDir);
}
export async function launchReviewWorker(dir,{spawnWorker=spawn}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  withJob(dir,rows=>{if(last(rows,'worker-launch-intent')||last(rows,'workflow-cancelled')||last(rows,'blocked'))throw new Error('Worker already launched or job stopped; reconcile instead');assertJobFreeze(plan,dir);assertFrozen(plan);appendEvent(dir,'worker-launch-intent');});
  let log,child;
  try {
    const env=reviewerEnvironment();
    try {
      log=fs.openSync(path.join(dir,'worker.log'),'wx');
      child=spawnWorker(process.execPath,[here,'worker',dir],{cwd:plan.worktree,env,detached:true,windowsHide:true,stdio:['ignore',log,log]});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    }catch(error){await transaction(dir,()=>appendEvent(dir,child?.pid?'worker-launch-uncertain':'worker-launch-failed',failureDetails(error)));throw error;}
    child.unref();
    // Worker records its own identity before launching any reviewer. No blind
    // retry if either process dies in this registration interval.
    return {pid:child.pid};
  }finally{if(log!==undefined)fs.closeSync(log);}
}
export async function launchSupervisor(dir,{spawnMonitor=spawn,registrationMs=30000}={}) {
  const baseline=await transaction(dir,rows=>rows.at(-1).sequence);
  let log,child,spawned=false,outcome,registered;
  try {
    log=fs.openSync(path.join(dir,'supervisor.log'),'a');
    child=spawnMonitor(process.execPath,[here,'run',dir],{cwd:dir,detached:true,windowsHide:true,stdio:['ignore',log,log]});
    const closed=new Promise(resolve=>child.once('close',(code,signal)=>{outcome={code,signal};resolve();}));
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    spawned=true;const deadline=Date.now()+registrationMs;
    for(;;){
      const snapshot=await transaction(dir,rows=>({rows,owner:fs.existsSync(path.join(dir,'monitor.lock'))?readJson(path.join(dir,'monitor.lock')):undefined}));
      registered=snapshot.rows.find(row=>row.sequence>baseline&&row.event==='monitor-started'&&row.identity?.pid===child.pid);
      if(registered&&(!outcome||outcome.code===0)){child.unref();return{pid:child.pid};}
      if(outcome){
        // A second run may exit successfully after finding an already running
        // monitor. Reuse only its recorded generation and actual OS identity.
        const owner=snapshot.owner;
        if(outcome.code===0&&owner&&snapshot.rows.some(row=>row.event==='monitor-started'&&row.token===owner.token&&sameIdentity(row.identity,owner.identity))&&alive(owner.identity))return{pid:owner.identity.pid,existing:true};
        throw Object.assign(new Error(`Monitor exited ${registered?'during startup':'before registration'} (code ${outcome.code}, signal ${outcome.signal??'none'})`),{status:outcome.code,signal:outcome.signal});
      }
      if(Date.now()>=deadline)throw new Error('Monitor registration deadline reached; process ownership remains uncertain');
      await Promise.race([closed,sleep(50)]);
    }
  }catch(error){await transaction(dir,()=>appendEvent(dir,'monitor-suspended',{...failureDetails(error),resumable:true,launchOutcome:outcome?'exited-during-startup':child?.pid?'uncertain':'not-started'}));if(spawned)child.unref();throw error;}
  finally{if(log!==undefined)fs.closeSync(log);}
}
async function transaction(dir,run) {
  return retryBusy(()=>withJob(dir,run));
}
async function observation(dir,reason) {
  return transaction(dir,rows=>{if(last(rows,'observation-pending')?.reason!==reason)appendEvent(dir,'observation-pending',{reason});});
}
function terminalEnvelope(dir,plan,rows) {
  const state=jobStatus(dir,rows).state;
  if(!['blocked','review-failed'].includes(state))return null;
  const failure=state==='blocked'?last(rows,'blocked'):(last(rows,'worker-finished')?.ok===false?last(rows,'worker-finished'):last(rows,'worker-launch-failed'));
  const reason=failure?.reason??failure?.message??`Review launcher reached ${state}`;
  const journal=path.join(dir,'handoff.jsonl');
  return {version:1,jobId:plan.jobId,continuationId:plan.continuationId,destination:{threadId:plan.destination.threadId,turnId:plan.destination.turnId,cwd:plan.destination.cwd},head:plan.head,base:plan.base,round:plan.round,authorizedAction:'inspect-blocked-review',state,reason,journal,jobDir:dir,nextRequiredAction:`Inspect ${journal} and the job logs, preserve recorded process identities, and recover or resume from durable state without launching a duplicate reviewer.`};
}
async function advanceTerminalNotification(dir,host) {
  const plan=readJson(path.join(dir,'plan.json'));let rows=await transaction(dir,current=>current);
  if(last(rows,'terminal-notification-accepted'))return true;
  let envelope=last(rows,'terminal-notification-pending')?.envelope;
  if(!envelope){envelope=terminalEnvelope(dir,plan,rows);if(!envelope)return false;await transaction(dir,current=>{if(!last(current,'terminal-notification-pending'))appendEvent(dir,'terminal-notification-pending',{envelope});});}
  rows=await transaction(dir,current=>current);
  if(!terminalSubmissionOutstanding(rows)) {
    const state=await host.inspect(plan.destination,plan);
    if(state.state==='disconnected'||state.state==='unknown'){await observation(dir,state.reason??`Originating lifecycle ${state.state}`);return false;}
    if(!['idle','active'].includes(state.state))throw new Error('Originating destination unavailable');
    let request,admissionError;
    try {
      await transaction(dir,current=>{
        if(request||last(current,'terminal-notification-accepted')||terminalSubmissionOutstanding(current)||!['blocked','review-failed'].includes(jobStatus(dir,current).state))return;
        assertJobFreeze(plan,dir);assertFrozen(plan);
        appendEvent(dir,'terminal-submission-intent',{envelope});
        try{request=Promise.resolve(host.submit(envelope));}catch(error){request=Promise.reject(error);}request.catch(()=>{});
      });
    }catch(error){admissionError=error;}
    if(request){try{const receipt=await request;await transaction(dir,()=>appendEvent(dir,receipt?.status==='not-sent'?'terminal-dispatch-refused':'terminal-submission-response',{receipt}));}catch(error){await transaction(dir,()=>appendEvent(dir,'terminal-delivery-uncertain',{reason:error.message}));}}
    if(admissionError)throw admissionError;
  }
  rows=await transaction(dir,current=>current);
  if(terminalSubmissionOutstanding(rows)&&!last(rows,'terminal-notification-accepted')) {
    let accepted;try{accepted=await host.reconcile(envelope,plan);}catch(error){if(error.permanentObservationFailure)throw error;await observation(dir,error.message);return false;}
    if(accepted.status==='accepted'&&typeof accepted.turnId==='string'&&accepted.turnId)await transaction(dir,current=>{if(!last(current,'terminal-notification-accepted'))appendEvent(dir,'terminal-notification-accepted',{turnId:accepted.turnId});});
  }
  return Boolean(last(await transaction(dir,current=>current),'terminal-notification-accepted'));
}
export async function runReviewWorker(dir,{slotRoot}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  await transaction(dir,rows=>{if(!last(rows,'worker-launch-intent')||last(rows,'worker-started')||last(rows,'workflow-cancelled'))throw new Error('Invalid or cancelled worker claim');assertJobFreeze(plan,dir);appendEvent(dir,'worker-started',{identity:processIdentity(process.pid)});});
  try {
    await runHandoff(path.join(dir,'handoff.json'),{slotRoot,automaticJob:{jobId:plan.jobId,jobDir:dir}});
    await transaction(dir,()=>appendEvent(dir,'worker-finished',{ok:true}));
  } catch(error) {await transaction(dir,()=>appendEvent(dir,'worker-finished',{ok:false,...failureDetails(error)}));throw error;}
}
function validatedEnvelope(dir,plan,rows,identify) {
  const worker=last(rows,'worker-started'),finished=last(rows,'worker-finished');
  if(!worker)return null;
  if(!exitObserved(rows,worker)&&alive(worker.identity,identify))return null;
  if(!finished?.ok)throw new Error(finished?.reason??'Worker exited without durable completion; preserve review evidence');
  const lines=fs.readFileSync(path.join(dir,'handoff.jsonl'),'utf8');
  if(!lines.endsWith('\n'))throw new Error('Truncated reviewer journal');
  const journal=lines.trim().split('\n').map(JSON.parse);
  if(journal.at(-1).event!=='finished')throw new Error('Reviewer chain did not finish');
  const reports=[],commentIds=new Set();
  for(const review of plan.reviews) {
    const launch=journal.find(row=>row.event==='launching'&&row.step===review.id),done=journal.find(row=>row.event==='completed'&&row.step===review.id),exit=journal.find(row=>row.event==='exited'&&row.step===review.id);
    if(!launch||!done||exit?.code!==0||journal.indexOf(exit)>journal.indexOf(done)||done.head!==plan.head||done.completedRound!==plan.round||!done.commentIds?.length)throw new Error('Incomplete validated reviewer coverage');
    for(const id of done.commentIds){if(!Number.isSafeInteger(id)||commentIds.has(id))throw new Error('Each reviewer coverage requires distinct report IDs');commentIds.add(id);}
    verifyNativeReviewResult(launch.output,nativeResultType(review.transport));
    reports.push({coverage:review.id,commentIds:done.commentIds,completion:launch.completion,output:launch.output});
  }
  if(fs.existsSync(worktreePaths(plan.worktree).lock))throw new Error('Reviewer lock remains; exit/ownership uncertain');
  assertJobFreeze(plan,dir);assertFrozen(plan);
  const destination={threadId:plan.destination.threadId,turnId:plan.destination.turnId,cwd:plan.destination.cwd};
  return {version:1,jobId:plan.jobId,continuationId:plan.continuationId,destination,head:plan.head,base:plan.base,round:plan.round,coverage:plan.reviews.map(r=>r.id),reports,authorizedAction:'adjudicate',jobDir:dir,claimCommand:[process.execPath,here,'claim',dir,plan.continuationId]};
}
export async function advanceReviewJob(dir,host,{identify=processIdentity,failpoint=()=>{},observeWorker=true}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  let rows=await transaction(dir,current=>current);
  const terminal=current=>last(current,'workflow-cancelled')||last(current,'claimed')||last(current,'continuation-accepted')||blocked(current);
  if(terminal(rows))return jobStatus(dir);
  const worker=last(rows,'worker-started');
  if(worker&&!exitObserved(rows,worker)) {
    if(!observeWorker&&!last(rows,'worker-finished'))return jobStatus(dir);
    // Slow OS identity inspection is outside the mutation lock. Only actual
    // absence/reuse is persisted; a completion row never substitutes for exit.
    let running;try{running=alive(worker.identity,identify);}catch(error){error.observationUnavailable=true;throw error;}
    if(running)return jobStatus(dir);
    await transaction(dir,current=>{if(!exitObserved(current,worker))appendEvent(dir,'worker-exit-observed',{identity:worker.identity});});
    rows=await transaction(dir,current=>current);
  }
  let envelope=last(rows,'continuation-pending')?.envelope;
  if(!envelope) {
    envelope=validatedEnvelope(dir,plan,rows,identify);
    if(envelope)await transaction(dir,current=>{if(!terminal(current)&&!last(current,'continuation-pending'))appendEvent(dir,'continuation-pending',{envelope});});
  }
  if(!envelope)return jobStatus(dir);
  await failpoint('after-validation');
  rows=await transaction(dir,current=>current);
  if(!submissionOutstanding(rows)) {
    const state=await host.inspect(plan.destination,plan);
    if(state.state==='disconnected'||state.state==='unknown'){await observation(dir,state.reason??`Originating lifecycle ${state.state}`);return jobStatus(dir);}
    if(!['idle','active'].includes(state.state))throw new Error('Originating destination unavailable');
    await failpoint('before-submit');
    let request,admissionError;
    try {
      await transaction(dir,current=>{
        if(request||terminal(current)||submissionOutstanding(current))return;
        assertJobFreeze(plan,dir);assertFrozen(plan);
        appendEvent(dir,'submission-intent',{envelope});
        // One admission lock covers durable intent and invocation. Keep the
        // promise locally even if the lock's finally subsequently fails.
        try{request=Promise.resolve(host.submit(envelope));}catch(error){request=Promise.reject(error);}
        request.catch(()=>{});
      });
    }catch(error){admissionError=error;}
    if(request) {
      try{const receipt=await request;await failpoint('after-submit');await transaction(dir,()=>appendEvent(dir,receipt?.status==='not-sent'?'dispatch-refused':'submission-response',{receipt}));}
      catch(error){await transaction(dir,()=>appendEvent(dir,'delivery-uncertain',{reason:error.message}));}
    }
    if(admissionError)throw admissionError;
  }
  rows=await transaction(dir,current=>current);
  if(submissionOutstanding(rows)&&!last(rows,'continuation-accepted')) {
    let accepted;try{accepted=await host.reconcile(envelope,plan);}catch(error){if(error.permanentObservationFailure)throw error;await observation(dir,error.message);return jobStatus(dir);}
    if(accepted.status==='accepted'&&typeof accepted.turnId==='string'&&accepted.turnId)await transaction(dir,current=>{if(!last(current,'continuation-accepted'))appendEvent(dir,'continuation-accepted',{turnId:accepted.turnId});});
  }
  return jobStatus(dir);
}
export function releaseStoppedJob(dir,{identify=processIdentity}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  return withJob(dir,rows=>{
    if(!last(rows,'workflow-cancelled')&&!blocked(rows)&&!last(rows,'worker-launch-failed'))throw new Error('Only stopped jobs can release their worktree');
    const worker=last(rows,'worker-started');
    if(last(rows,'worker-launch-intent')&&!worker&&!last(rows,'worker-launch-failed'))throw new Error('Worker launch identity uncertain; preserve ownership');
    if(worker&&!exitObserved(rows,worker)&&alive(worker.identity,identify))throw new Error('Reviewer worker still active');
    if(fs.existsSync(worktreePaths(plan.worktree).lock))throw new Error('Reviewer lock remains; preserve ownership');
    const freeze=worktreePaths(plan.worktree).freeze;
    if(fs.existsSync(freeze)){assertJobFreeze(plan,dir);fs.unlinkSync(freeze);}
    appendEvent(dir,'freeze-released');return{released:true};
  });
}
export async function cancelReviewJob(dir,host) {
  const plan=readJson(path.join(dir,'plan.json'));let envelope;
  await transaction(dir,rows=>{if(last(rows,'claimed'))throw new Error('Writer already claimed; cancel its active turn through its host');if(!last(rows,'workflow-cancelled'))appendEvent(dir,'workflow-cancelled');envelope=last(rows,'continuation-pending')?.envelope;});
  const bounded=async call=>{let timer;try{return await Promise.race([call(),new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout'}),3000);})]);}catch(error){return{status:'failed',reason:error.message};}finally{clearTimeout(timer);}};
  const clear=envelope&&host.retract?await bounded(()=>host.retract(envelope)):{status:'unsupported'};
  const cancel=host.cancelTurn?await bounded(()=>host.cancelTurn(plan.destination)):{status:'unsupported'};
  await transaction(dir,()=>appendEvent(dir,'cancellation-attempted',{clear,cancel}));return{clear,cancel};
}
export function claimReviewJob(dir,continuationId,{threadId=process.env.CODEX_THREAD_ID,identify=processIdentity,verifyConfiguration=verifyClaimConfiguration}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  return withJob(dir,rows=>{
    if(continuationId!==plan.continuationId||threadId!==plan.destination.threadId||last(rows,'workflow-cancelled')||blocked(rows)||!submissionOutstanding(rows))throw new Error('Continuation claim identity/state mismatch');
    if(last(rows,'claimed')){const freeze=worktreePaths(plan.worktree).freeze;if(fs.existsSync(freeze)){assertJobFreeze(plan,dir);fs.unlinkSync(freeze);}return{alreadyClaimed:true};}
    if(!validatedEnvelope(dir,plan,rows,identify))throw new Error('Reviewer execution still active');
    const configuration=verifyConfiguration(plan.destination,plan);
    appendEvent(dir,'claimed',{continuationId,threadId,turnId:configuration?.turnId});fs.unlinkSync(worktreePaths(plan.worktree).freeze);return{claimed:true};
  });
}

export async function recoverMonitor(dir,{identify=processIdentity}={}) {
  return transaction(dir,()=>{
    const file=path.join(dir,'monitor.lock');
    if(!fs.existsSync(file))return;
    const owner=readJson(file);
    if(alive(owner.identity,identify))throw new Error('Monitor owner is still running');
    if(readJson(file).token!==owner.token)throw new Error('Monitor generation changed');
    fs.unlinkSync(file);
  });
}

export async function resumeReviewJob(dir) {
  return transaction(dir,rows=>{
    if(last(rows,'workflow-cancelled')||last(rows,'claimed'))throw new Error('Cancelled or claimed jobs cannot resume');
    appendEvent(dir,'resume-requested');
  });
}

export async function runReviewMonitor(dir,host,{identify=processIdentity,wait=sleep,now=Date.now,pendingMs=600000,registrationMs=60000,workerProbeMs=30000,lockTimeoutMs=10000,emit=()=>{}}={}) {
  const file=path.join(dir,'monitor.lock'),owner={token:randomUUID(),identity:currentIdentity()};
  const mutate=run=>retryBusy(()=>withJob(dir,run),{timeoutMs:lockTimeoutMs});
  const persistFailure=error=>{
    try{const diagnostic=path.join(dir,'monitor-failure.json'),temporary=diagnostic+'.'+owner.token;
      writeExclusive(temporary,{token:owner.token,identity:owner.identity,resumable:true,...failureDetails(error)});fs.renameSync(temporary,diagnostic);
    }catch(failure){error.message+=`; independent monitor diagnostic unavailable: ${failure.message}`;}
  };
  let existing;
  try{existing=await mutate(()=>{
    if(fs.existsSync(file))return readJson(file);
    writeExclusive(file,owner);appendEvent(dir,'monitor-started',{identity:owner.identity,token:owner.token});
  });}catch(error){if(fs.existsSync(file)&&readJson(file).token===owner.token)persistFailure(error);throw error;}
  if(existing){if(alive(existing.identity,identify))return{state:'monitor-running',identity:existing.identity};throw new Error('Previous monitor exited; use recover before monitoring');}
  let sequence=0,pendingSince,terminalPendingSince,nextWorkerProbe=0,primary;
  const flush=rows=>{for(const row of rows)if(row.sequence>sequence){emit(row);sequence=row.sequence;}};
  try {
    for(;;) {
      const before=await mutate(rows=>jobStatus(dir,rows));
      if(['claimed','continuation-accepted','workflow-cancelled'].includes(before.state))return{state:before.state};
      if(['blocked','review-failed'].includes(before.state)){
        // A prior completion admission may already have reached the task. Its
        // uncertain receipt must never be followed by a second terminal send.
        if(submissionOutstanding(before.events))return{state:before.state};
        const delivered=await advanceTerminalNotification(dir,host);
        if(delivered)return{state:before.state};
        terminalPendingSince??=now();
        if(now()-terminalPendingSince>=pendingMs){const reason='Terminal notification delivery deadline reached; inspect the durable terminal envelope and resume this same job without launching a duplicate reviewer';await mutate(()=>appendEvent(dir,'monitor-suspended',{reason,resumable:true,notificationPending:true}));flush(readEvents(dir));return{state:before.state,notificationPending:true,reason};}
        await wait(10000);continue;
      }
      let unavailable=false;
      const observeWorker=now()>=nextWorkerProbe;
      if(observeWorker)nextWorkerProbe=now()+workerProbeMs;
      try{await advanceReviewJob(dir,host,{identify,observeWorker});}
      catch(error){
        if(!error.observationUnavailable)throw error;
        unavailable=true;await observation(dir,error.message);
      }
      const status=await mutate(rows=>jobStatus(dir,rows));
      flush(status.events);
      if(['claimed','continuation-accepted','workflow-cancelled'].includes(status.state))return{state:status.state};
      if(['blocked','review-failed'].includes(status.state))continue;
      const registered=last(status.events,'worker-started');
      if(unavailable||!registered||['continuation-pending','delivery-uncertain'].includes(status.state))pendingSince??=now();else if(observeWorker)pendingSince=undefined;
      const limit=registered?pendingMs:registrationMs;
      if(pendingSince!==undefined&&now()-pendingSince>=limit){
        const reason=!registered?'Worker registration absent; inspect launch evidence before any action':!exitObserved(status.events,registered)?'Worker identity observation deadline reached; ownership remains uncertain':last(status.events,'submission-intent')?'Delivery receipt observation deadline reached; no retry was sent':'Destination availability observation deadline reached; continuation remains unsent';
        await mutate(()=>appendEvent(dir,'monitor-suspended',{reason,resumable:true}));flush(readEvents(dir));
        return{state:'monitor-suspended',reason};
      }
      await wait(['delivery-uncertain','continuation-pending'].includes(status.state)?10000:2000);
    }
  }catch(error){
    primary=error;
    // Independent token-owned diagnostics remain writable when a stale shared
    // mutation lock prevents safely appending to the canonical journal.
    persistFailure(error);
    try{await mutate(()=>appendEvent(dir,'monitor-suspended',{...failureDetails(error),resumable:true}));flush(readEvents(dir));}catch(recordError){if(recordError!==error)error.message+=`; journal suspension unavailable: ${recordError.message}`;}
    return{state:'monitor-suspended',...failureDetails(error)};
  }finally{
    try{await mutate(()=>{
      if(!fs.existsSync(file))return;
      if(readJson(file).token!==owner.token)throw new Error('Monitor ownership changed');
      appendEvent(dir,'monitor-stopped',{token:owner.token});fs.unlinkSync(file);
    });}catch(error){
      if(!primary)persistFailure(error);
      console.error(`Monitor cleanup requires recovery: ${error.message}`);
    }
  }
}
export function eventCursor(value) {
  const cursor=Number(value??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error('Invalid event cursor');return cursor;
}
async function main() {
  const [command,inputTarget,arg]=process.argv.slice(2);
  if(!inputTarget||!path.isAbsolute(inputTarget))throw new Error('Use review-supervisor <submit|start-worker|run|resume|worker|status|events|watch|recover|cancel|release|claim> <absolute plan/job path>');
  const target=path.resolve(inputTarget);
  if(command==='worker')return runReviewWorker(target);
  if(command==='status')return jobStatus(target);
  if(command==='events'){const cursor=eventCursor(arg);return readEvents(target).filter(row=>row.sequence>cursor);}
  if(command==='watch'){let cursor=eventCursor(arg);for(;;){for(const row of readEvents(target))if(row.sequence>cursor){process.stdout.write(JSON.stringify(row)+'\n');cursor=row.sequence;}await sleep(500);}}
  if(command==='claim') {
    const {continuationClaimIdentity}=await import('./continuation-host.mjs');
    const plan=readJson(path.join(target,'plan.json'));
    return retryBusy(()=>claimReviewJob(target,arg,{threadId:continuationClaimIdentity(plan)}));
  }
  if(command==='release')return releaseStoppedJob(target);
  const {continuationHost}=await import('./continuation-host.mjs');
  const plan=readJson(command==='submit'?target:path.join(target,'plan.json'));
  const host=continuationHost(plan);
  if(command==='submit'){const result=await createReviewJob(readJson(target),host);const dir=path.resolve(readJson(target).jobDir);await launchReviewWorker(dir);await launchSupervisor(dir);return result;}
  if(command==='start-worker'){await launchReviewWorker(target);await launchSupervisor(target);return jobStatus(target);}
  if(command==='recover'||command==='resume'){recoverJobLock(target);await recoverMonitor(target);}
  if(command==='resume')await resumeReviewJob(target);
  if(command==='cancel')return cancelReviewJob(target,host);
  if(!['run','recover','resume'].includes(command))throw new Error('Unknown supervisor command');
  return runReviewMonitor(target,host,{emit:row=>process.stdout.write(JSON.stringify(row)+'\n')});
}
if(process.argv[1]&&path.resolve(process.argv[1])===here)main().then(result=>{if(result)console.log(JSON.stringify(result));}).catch(error=>{console.error(error.message);process.exitCode=1;});
