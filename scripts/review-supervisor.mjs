import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runHandoff,checkReviewRound,verifyNativeReviewResult } from './agent-handoff.mjs';
import { processIdentity } from './reviewer-slots.mjs';
import { readJson,writeExclusive,git,readEvents,appendEvent,withJob,retryBusy,recoverJobLock,alive,assertFrozen,reserveFreeze,assertJobFreeze,worktreePaths } from './review-job-store.mjs';

const here=fileURLToPath(import.meta.url);
const last=(rows,event)=>rows.findLast(row=>row.event===event);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function jobStatus(dir) {
  const events=readEvents(dir);
  return {jobId:events[0].jobId,sequence:events.at(-1).sequence,state:last(events,'workflow-cancelled')?'workflow-cancelled':last(events,'claimed')?'claimed':last(events,'continuation-accepted')?'continuation-accepted':last(events,'blocked')?'blocked':last(events,'submission-intent')?'delivery-uncertain':last(events,'continuation-pending')?'continuation-pending':last(events,'worker-launch-intent')?'review-running':'accepted',events};
}
export function validateReviewPlan(input) {
  const plan=structuredClone(input);
  if(!path.isAbsolute(plan.worktree)||!path.isAbsolute(plan.jobDir))throw new Error('Absolute worktree and private jobDir required');
  plan.worktree=fs.realpathSync(plan.worktree);plan.jobDir=path.resolve(plan.jobDir);
  plan.commonGit=git(plan.worktree,['rev-parse','--path-format=absolute','--git-common-dir']);
  if(!/^[a-f0-9]{40}$/.test(plan.head??'')||!/^[a-f0-9]{40}$/.test(plan.base??''))throw new Error('Full frozen head and base required');
  if(!Number.isSafeInteger(plan.pr)||plan.pr<1||!plan.writer||!plan.reviewer||plan.writer===plan.reviewer)throw new Error('PR and distinct explicit model routes required');
  if(!plan.destination||!plan.destination.threadId||!plan.destination.turnId||!plan.destination.cwd)throw new Error('Originating destination identity required');
  if(!plan.writerEffort||!plan.permissions||!Array.isArray(plan.reviews)||plan.reviews.length<1||plan.reviews.length>4)throw new Error('Exact routing, permissions and bounded coverage required');
  const limit=plan.reviewRoundLimit??3;
  if(!Number.isInteger(limit)||limit<1||limit>10||(limit>3&&typeof plan.extendedReviewAuthorization!=='string'))throw new Error('Invalid review limit/authorization');
  checkReviewRound(plan.round,plan.completedReviewRound,plan.finalCorrections??false,limit);
  if(!Number.isInteger(plan.completedReviewRound)||plan.completedReviewRound<0)throw new Error('Recorded review round required');
  const ids=new Set();
  for(const review of plan.reviews) {
    if(!/^[a-z][a-z0-9-]{0,63}$/.test(review.id??'')||ids.has(review.id)||!path.isAbsolute(review.executable??'')||!path.isAbsolute(review.prompt??'')||!review.effort||!Array.isArray(review.args)||!review.args.every(a=>typeof a==='string'))throw new Error('Explicit independent reviewer coverage and launch required');
    ids.add(review.id);
    const at=review.args.findIndex(a=>a==='--model'||a==='-m');
    if(at<0||review.args[at+1]!==plan.reviewer)throw new Error('Reviewer model argument mismatch');
    for(const [flag,value] of [['--effort',review.effort],['--permission-mode',review.permissions]])if(typeof value!=='string'||!value||review.args.filter(a=>a===flag).length!==1||review.args[review.args.indexOf(flag)+1]!==value)throw new Error('Explicit native reviewer effort and permissions required');
    if(review.args.filter(a=>a==='--model'||a==='-m').length!==1)throw new Error('Ambiguous reviewer model arguments');
    if(review.transport!=='native-claude-json'||review.args.filter(a=>a==='--output-format').length!==1||review.args[review.args.indexOf('--output-format')+1]!=='json')throw new Error('Automatic review requires native Claude JSON result transport');
    if(review.args.some(a=>/^(?:--model|--effort|--permission-mode|--output-format)=|^-m./.test(a)||['--dangerously-skip-permissions','--allow-dangerously-skip-permissions'].includes(a)))throw new Error('Ambiguous native reviewer configuration');
    if(!fs.statSync(review.prompt).isFile())throw new Error('Reviewer prompt missing');
  }
  assertFrozen(plan);
  return plan;
}
export async function createReviewJob(input,host) {
  const plan=validateReviewPlan(input);plan.jobId=randomUUID();plan.continuationId=randomUUID();
  // The adapter validates private storage containment and exact host identity.
  const capability=await host.preflight(plan.destination,plan);
  if(capability?.supported!==true)throw new Error('Automatic continuation unsupported; use awaited mode');
  fs.mkdirSync(plan.jobDir);
  writeExclusive(path.join(plan.jobDir,'plan.json'),plan);
  writeExclusive(path.join(plan.jobDir,'events.jsonl'),{version:1,sequence:1,eventId:randomUUID(),jobId:plan.jobId,time:new Date().toISOString(),event:'accepted',capability});
  try {reserveFreeze(plan,plan.jobDir);}catch(error){withJob(plan.jobDir,()=>appendEvent(plan.jobDir,'blocked',{reason:error.message}));throw error;}
  const steps=Object.fromEntries(plan.reviews.map((review,index)=>[review.id,{role:'review',round:plan.round,model:plan.reviewer,nativeResult:'claude-json',executable:review.executable,args:review.args,prompt:review.prompt,next:[plan.reviews[index+1]?.id??null]}]));
  writeExclusive(path.join(plan.jobDir,'handoff.json'),{worktree:plan.worktree,journal:path.join(plan.jobDir,'handoff.jsonl'),pr:plan.pr,writer:plan.writer,reviewer:plan.reviewer,completedReviewRound:plan.completedReviewRound,reviewedHead:plan.reviewedHead,finalCorrections:plan.finalCorrections,reviewRoundLimit:plan.reviewRoundLimit,extendedReviewAuthorization:plan.extendedReviewAuthorization,maxSteps:plan.reviews.length,first:plan.reviews[0].id,steps});
  return jobStatus(plan.jobDir);
}
export function launchReviewWorker(dir) {
  const plan=readJson(path.join(dir,'plan.json'));
  withJob(dir,rows=>{if(last(rows,'worker-launch-intent')||last(rows,'workflow-cancelled')||last(rows,'blocked'))throw new Error('Worker already launched or job stopped; reconcile instead');assertJobFreeze(plan,dir);assertFrozen(plan);appendEvent(dir,'worker-launch-intent');});
  const log=fs.openSync(path.join(dir,'worker.log'),'wx');
  try {
    const env={...process.env};for(const key of Object.keys(env))if(key.toUpperCase().startsWith('GIT_'))delete env[key];
    const child=spawn(process.execPath,[here,'worker',dir],{cwd:plan.worktree,env,detached:true,windowsHide:true,stdio:['ignore',log,log]});
    child.on('error',()=>{});child.unref();
    // Worker records its own identity before launching any reviewer. No blind
    // retry if either process dies in this registration interval.
    return {pid:child.pid};
  }finally{fs.closeSync(log);}
}
export function launchSupervisor(dir) {
  const log=fs.openSync(path.join(dir,'supervisor.log'),'a');
  try{const child=spawn(process.execPath,[here,'run',dir],{detached:true,windowsHide:true,stdio:['ignore',log,log]});child.on('error',()=>{});child.unref();return{pid:child.pid};}finally{fs.closeSync(log);}
}
async function transaction(dir,run) {
  return retryBusy(()=>withJob(dir,run));
}
export async function runReviewWorker(dir,{slotRoot}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  await transaction(dir,rows=>{if(!last(rows,'worker-launch-intent')||last(rows,'worker-started')||last(rows,'workflow-cancelled'))throw new Error('Invalid or cancelled worker claim');assertJobFreeze(plan,dir);appendEvent(dir,'worker-started',{identity:processIdentity(process.pid)});});
  try {
    await runHandoff(path.join(dir,'handoff.json'),{slotRoot,automaticJob:{jobId:plan.jobId,jobDir:dir}});
    await transaction(dir,()=>appendEvent(dir,'worker-finished',{ok:true}));
  } catch(error) {await transaction(dir,()=>appendEvent(dir,'worker-finished',{ok:false,reason:error.message}));throw error;}
}
function validatedEnvelope(dir,plan,rows,identify) {
  const worker=last(rows,'worker-started'),finished=last(rows,'worker-finished');
  if(!worker)return null;
  if(alive(worker.identity,identify))return null;
  if(!finished?.ok)throw new Error(finished?.reason??'Worker exited without durable completion; preserve review evidence');
  const lines=fs.readFileSync(path.join(dir,'handoff.jsonl'),'utf8');
  if(!lines.endsWith('\n'))throw new Error('Truncated reviewer journal');
  const journal=lines.trim().split('\n').map(JSON.parse);
  if(journal.at(-1).event!=='finished')throw new Error('Reviewer chain did not finish');
  const reports=[];
  for(const review of plan.reviews) {
    const launch=journal.find(row=>row.event==='launching'&&row.step===review.id),done=journal.find(row=>row.event==='completed'&&row.step===review.id),exit=journal.find(row=>row.event==='exited'&&row.step===review.id);
    if(!launch||!done||exit?.code!==0||journal.indexOf(exit)>journal.indexOf(done)||done.head!==plan.head||done.completedRound!==plan.round||!done.commentIds?.length)throw new Error('Incomplete validated reviewer coverage');
    verifyNativeReviewResult(launch.output);
    reports.push({coverage:review.id,commentIds:done.commentIds,completion:launch.completion,output:launch.output});
  }
  if(fs.existsSync(worktreePaths(plan.worktree).lock))throw new Error('Reviewer lock remains; exit/ownership uncertain');
  assertJobFreeze(plan,dir);assertFrozen(plan);
  const destination={threadId:plan.destination.threadId,turnId:plan.destination.turnId,cwd:plan.destination.cwd};
  return {version:1,jobId:plan.jobId,continuationId:plan.continuationId,destination,head:plan.head,base:plan.base,round:plan.round,coverage:plan.reviews.map(r=>r.id),reports,authorizedAction:'adjudicate',jobDir:dir,claimCommand:[process.execPath,here,'claim',dir,plan.continuationId]};
}
export async function advanceReviewJob(dir,host,{identify=processIdentity,failpoint=()=>{}}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  let envelope;
  withJob(dir,rows=>{
    if(last(rows,'workflow-cancelled')||last(rows,'continuation-accepted')||last(rows,'blocked'))return;
    envelope=last(rows,'continuation-pending')?.envelope;
    if(!envelope){envelope=validatedEnvelope(dir,plan,rows,identify);if(envelope)appendEvent(dir,'continuation-pending',{envelope});}
  });
  if(!envelope)return jobStatus(dir);
  await failpoint('after-validation');
  let rows=readEvents(dir);
  if(!last(rows,'submission-intent')) {
    const state=await host.inspect(plan.destination,plan);
    if(state.state==='disconnected'||state.state==='unknown')return jobStatus(dir);
    if(!['idle','active'].includes(state.state))throw new Error('Originating destination unavailable');
    let dispatch=false;
    withJob(dir,current=>{if(last(current,'workflow-cancelled')||last(current,'submission-intent'))return;assertJobFreeze(plan,dir);assertFrozen(plan);appendEvent(dir,'submission-intent',{envelope});dispatch=true;});
    if(dispatch) {
      await failpoint('before-submit');
      try {
        // Invoke submission while holding the cancellation admission lock. A
        // cancel before this point suppresses it; later cancellation cannot
        // promise host retraction. Never hold the lock awaiting the response.
        let request;
        withJob(dir,current=>{if(!last(current,'workflow-cancelled'))request=host.submit(envelope);});
        if(!request)return jobStatus(dir);
        const receipt=await request;await failpoint('after-submit');await transaction(dir,()=>appendEvent(dir,'submission-response',{receipt}));}
      catch(error){withJob(dir,()=>appendEvent(dir,'delivery-uncertain',{reason:error.message}));}
    }
  }
  rows=readEvents(dir);
  if(last(rows,'submission-intent')&&!last(rows,'continuation-accepted')) {
    let accepted;try{accepted=await host.reconcile(envelope,plan);}catch{return jobStatus(dir);}
    if(accepted.status==='accepted'&&typeof accepted.turnId==='string'&&accepted.turnId)withJob(dir,current=>{if(!last(current,'continuation-accepted'))appendEvent(dir,'continuation-accepted',{turnId:accepted.turnId});});
  }
  return jobStatus(dir);
}
export function releaseStoppedJob(dir,{identify=processIdentity}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  return withJob(dir,rows=>{
    if(!last(rows,'workflow-cancelled')&&!last(rows,'blocked'))throw new Error('Only stopped jobs can release their worktree');
    const worker=last(rows,'worker-started');
    if(last(rows,'worker-launch-intent')&&!worker)throw new Error('Worker launch identity uncertain; preserve ownership');
    if(worker&&alive(worker.identity,identify))throw new Error('Reviewer worker still active');
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
export function claimReviewJob(dir,continuationId,{threadId=process.env.CODEX_THREAD_ID,identify=processIdentity}={}) {
  const plan=readJson(path.join(dir,'plan.json'));
  return withJob(dir,rows=>{
    if(continuationId!==plan.continuationId||threadId!==plan.destination.threadId||last(rows,'workflow-cancelled')||!last(rows,'submission-intent'))throw new Error('Continuation claim identity/state mismatch');
    if(last(rows,'claimed')){const freeze=worktreePaths(plan.worktree).freeze;if(fs.existsSync(freeze)){assertJobFreeze(plan,dir);fs.unlinkSync(freeze);}return{alreadyClaimed:true};}
    if(!validatedEnvelope(dir,plan,rows,identify))throw new Error('Reviewer execution still active');
    appendEvent(dir,'claimed',{continuationId,threadId});fs.unlinkSync(worktreePaths(plan.worktree).freeze);return{claimed:true};
  });
}
async function main() {
  const [command,target,arg]=process.argv.slice(2);
  if(!target||!path.isAbsolute(target))throw new Error('Use review-supervisor <submit|run|worker|status|events|recover|cancel|claim> <absolute plan/job path>');
  if(command==='worker')return runReviewWorker(target);
  if(command==='status')return jobStatus(target);
  if(command==='events')return readEvents(target).filter(row=>row.sequence>Number(arg??0));
  if(command==='watch'){let cursor=Number(arg??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error('Invalid event cursor');for(;;){for(const row of readEvents(target))if(row.sequence>cursor){process.stdout.write(JSON.stringify(row)+'\n');cursor=row.sequence;}await sleep(500);}}
  if(command==='claim')return retryBusy(()=>claimReviewJob(target,arg));
  if(command==='release')return releaseStoppedJob(target);
  const {codexContinuationHost}=await import('./continuation-host.mjs');
  const host=codexContinuationHost();
  if(command==='submit'){const result=await createReviewJob(readJson(target),host);const dir=readJson(target).jobDir;launchReviewWorker(dir);launchSupervisor(dir);return result;}
  if(command==='recover')recoverJobLock(target);
  if(command==='cancel')return cancelReviewJob(target,host);
  if(!['run','recover'].includes(command))throw new Error('Unknown supervisor command');
  let sequence=0;
  for(;;){
    try{await advanceReviewJob(target,host);}catch(error){if(error.code!=='EEXIST')withJob(target,()=>appendEvent(target,'blocked',{reason:error.message}));}
    const status=jobStatus(target);
    for(const row of status.events)if(row.sequence>sequence){process.stdout.write(JSON.stringify(row)+'\n');sequence=row.sequence;}
    if(last(status.events,'continuation-accepted')||['workflow-cancelled','blocked'].includes(status.state))return{state:status.state};
    await sleep(2000);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===here)main().then(result=>{if(result)console.log(JSON.stringify(result));}).catch(error=>{console.error(error.message);process.exitCode=1;});
