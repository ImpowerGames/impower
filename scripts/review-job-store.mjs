import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { processIdentity } from './reviewer-slots.mjs';

export const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function git(cwd,args) {
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
  return execFileSync('git',args,{cwd,env,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
}
export function writeExclusive(file,value) {
  const fd=fs.openSync(file,'wx');try{fs.writeSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export const sameIdentity=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.start===b.start;
export function alive(identity,identify=processIdentity) {
  if(!identity||!Number.isSafeInteger(identity.pid)||typeof identity.start!=='string')throw new Error('Process identity uncertain; preserve ownership');
  return sameIdentity(identity,identify(identity.pid));
}
export function readEvents(dir) {
  const text=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8');
  if(!text.endsWith('\n'))throw new Error('Truncated job journal; preserve evidence');
  const rows=text.trim().split('\n').map(JSON.parse),ids=new Set();
  for(const [index,row] of rows.entries()) {
    if(row.version!==1||row.sequence!==index+1||typeof row.eventId!=='string'||ids.has(row.eventId)||row.jobId!==rows[0].jobId)throw new Error('Invalid job event identity or ordering');
    ids.add(row.eventId);
  }
  return rows;
}
export function appendEvent(dir,event,details={}) {
  const rows=readEvents(dir),row={...details,version:1,jobId:rows[0].jobId,sequence:rows.length+1,eventId:randomUUID(),time:new Date().toISOString(),event};
  const fd=fs.openSync(path.join(dir,'events.jsonl'),'a');try{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return row;
}
// No host calls inside this synchronous transaction. Recovery never guesses that
// an unreadable process/lock record means an absent owner.
export function withJob(dir,run) {
  const lock=path.join(dir,'mutation.lock'),owner={token:randomUUID(),identity:processIdentity(process.pid)};
  writeExclusive(lock,owner);
  try{if(fs.existsSync(path.join(dir,'mutation.recovery')))throw new Error('Job recovery in progress');return run(readEvents(dir));}finally{if(readJson(lock).token!==owner.token)throw new Error('Job lock generation changed');fs.unlinkSync(lock);}
}
export async function retryBusy(run) {
  for(let attempt=0;;attempt++){try{return run();}catch(error){if(error.code!=='EEXIST'||attempt>=100)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
}
export function recoverJobLock(dir) {
  const marker=path.join(dir,'mutation.recovery');writeExclusive(marker,{identity:processIdentity(process.pid)});
  try {
    const lock=path.join(dir,'mutation.lock');if(!fs.existsSync(lock))return;
    const owner=readJson(lock);if(alive(owner.identity))throw new Error('Job mutation owner still running');
    if(readJson(lock).token!==owner.token)throw new Error('Job lock changed during recovery');fs.unlinkSync(lock);
  } finally {fs.unlinkSync(marker);}
}
export function worktreePaths(worktree) {
  const admin=git(worktree,['rev-parse','--path-format=absolute','--git-dir']);
  return {lock:path.join(admin,'agent-handoff.lock'),freeze:path.join(admin,'agent-review-job.json')};
}
export function assertFrozen(plan) {
  if(fs.realpathSync(plan.worktree)!==plan.worktree||git(plan.worktree,['rev-parse','--path-format=absolute','--git-common-dir'])!==plan.commonGit||git(plan.worktree,['rev-parse','HEAD'])!==plan.head||git(plan.worktree,['status','--porcelain']))throw new Error('Reviewed repository/head/worktree changed');
  try{if(git(plan.worktree,['rev-parse','--verify',`${plan.base}^{commit}`])!==plan.base)throw new Error('mismatch');}catch{throw new Error('Reviewed base must resolve to an existing commit');}
}
export function reserveFreeze(plan,dir) {
  const paths=worktreePaths(plan.worktree),identity=processIdentity(process.pid);
  writeExclusive(paths.lock,{processIdentity:identity,journal:path.join(dir,'events.jsonl')});
  try{assertFrozen(plan);writeExclusive(paths.freeze,{jobId:plan.jobId,jobDir:dir});}finally{fs.unlinkSync(paths.lock);}
}
export function assertJobFreeze(plan,dir) {
  const marker=readJson(worktreePaths(plan.worktree).freeze);
  if(marker.jobId!==plan.jobId||marker.jobDir!==dir)throw new Error('Worktree belongs to another automatic job');
}
