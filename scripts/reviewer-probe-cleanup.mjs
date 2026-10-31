import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {withProbeCleanupGuard,machineRoot} from './test-suite-process.mjs';
import {processIdentity} from './reviewer-slots.mjs';

const sleeper=new Int32Array(new SharedArrayBuffer(4));
const retryable=new Set(['EPERM','EBUSY','ENOTEMPTY']);
function removal(action,delays) {
  for(let attempt=0;;attempt++){
    try{return action();}
    catch(error){if(!retryable.has(error.code)||attempt>=delays.length)throw error;Atomics.wait(sleeper,0,0,delays[attempt]);}
  }
}

export const snapshotReviewerDirectory=(directory)=>new Set(fs.readdirSync(directory));

const fold=(value)=>process.platform==='win32'?value.toLowerCase():value;
const isInside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};
const overlaps=(a,b)=>{const x=fold(path.resolve(a)),y=fold(path.resolve(b));return x===y||isInside(x,y)||isInside(y,x);};

function physicalPath(value) {
  const absolute=path.resolve(value);
  try{return fs.realpathSync.native(absolute);}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    let present=false;
    try{fs.lstatSync(absolute);present=true;}catch(missing){if(missing.code!=='ENOENT')throw missing;}
    if(present)throw new Error(`${absolute} exists but does not resolve (${error.code})`);
    if(path.dirname(absolute)===absolute)throw error;
    return path.join(physicalPath(path.dirname(absolute)),path.basename(absolute));
  }
}

function removeEntry(target,counts,failures,delays) {
  try{
    const stat=fs.lstatSync(target);
    if(stat.isSymbolicLink()){
      removal(()=>{try{fs.unlinkSync(target);}catch(error){if(process.platform!=='win32'||!['EPERM','EISDIR','EACCES'].includes(error.code))throw error;fs.rmdirSync(target);}},delays);
      counts.links++;
      return;
    }
    if(stat.isDirectory()){
      const before=failures.length;
      for(const name of fs.readdirSync(target))removeEntry(path.join(target,name),counts,failures,delays);
      if(failures.length===before)removal(()=>fs.rmdirSync(target),delays);
      return;
    }
    removal(()=>fs.unlinkSync(target),delays);
    counts.files++;
  }catch(error){
    let residual=[];
    try{
      const stat=fs.lstatSync(target);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw Object.assign(new Error('not a real directory'),{code:'ENOTDIR'});
      const directory=fs.opendirSync(target);
      try{for(let entry;(entry=directory.readSync())&&residual.length<25;)residual.push(entry.name);}
      finally{directory.closeSync();}
    }catch(inventory){if(!['ENOTDIR','ENOENT'].includes(inventory.code))residual=[`inventory unavailable: ${inventory.code??inventory.message}`];}
    failures.push({target,error,residual});
  }
}

function reservedPaths(file) {
  let record;
  try{record=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw new Error(`Reservation entry at ${file} could not be read (${error.message}); preserve reviewer scratch`);}
  const found=[];
  const collect=(value)=>{
    if(typeof value==='string'){if(path.isAbsolute(value))found.push(value);}
    else if(value&&typeof value==='object')for(const item of Object.values(value))collect(item);
  };
  collect(record);
  if(typeof record?.run==='string'&&path.isAbsolute(record.run)){
    try{collect(JSON.parse(fs.readFileSync(path.join(record.run,'run.json'),'utf8')));}
    catch(error){if(error.code!=='ENOENT')throw new Error(`Run journal of the reservation at ${file} could not be read (${error.message}); preserve reviewer scratch`);}
  }
  return found;
}

function reservationNaming(file,directory,root) {
  for(const value of reservedPaths(file)){
    if(overlaps(value,directory)||overlaps(value,root))return value;
    let physical;
    try{physical=physicalPath(value);}
    catch(error){throw new Error(`Reservation entry at ${file} names ${value}, which could not be resolved (${error.message}); preserve reviewer scratch`);}
    if(overlaps(physical,root))return `${value} (${physical})`;
  }
  return undefined;
}

export function removeProbeCheckouts(directory,{preserve=new Set(),keep=[],reservationRoot,retryDelays=[250,1000,3000]}={}) {
  const began=Date.now();
  if(!fs.lstatSync(directory).isDirectory())throw new Error(`Reviewer directory ${directory} is not a directory`);
  const root=fs.realpathSync.native(directory);
  const kept=new Set();
  for(const file of keep){
    const stat=fs.lstatSync(file),target=fs.realpathSync.native(file);
    if(!isInside(root,target))continue;
    if(!stat.isFile())throw new Error(`Kept file ${file} is not a regular file; nothing was removed`);
    kept.add(target);
  }
  const targets=[],walked=[];
  const scratch=(target,name,top)=>{
    if(name==='node_modules'||top&&name.startsWith('.probe-cleanup-'))return true;
    const names=new Set(fs.readdirSync(target).map(entry=>entry.toLowerCase()));
    return names.has('.git')||names.has('head')&&names.has('objects')&&names.has('refs');
  };
  const unreadable=[];
  const visit=(current,top)=>{
    let names;
    try{names=fs.readdirSync(current);}catch(error){unreadable.push(`${current} (${error.code??error.message})`);return;}
    for(const name of names){
      const target=path.join(current,name);
      if(top&&preserve.has(name)||kept.has(target))continue;
      try{
        const stat=fs.lstatSync(target);
        if(stat.isSymbolicLink()){targets.push(target);continue;}
        if(!stat.isDirectory())continue;
        if(!scratch(target,name,top)||[...kept].some(file=>isInside(target,file))){walked.push(target);visit(target,false);continue;}
        targets.push(target);
      }catch(error){unreadable.push(`${target} (${error.code??error.message})`);}
    }
  };
  visit(root,true);
  const pruneEmpty=()=>{for(const dir of walked.reverse()){try{fs.rmdirSync(dir);}catch(error){if(!['ENOTEMPTY','EEXIST','ENOENT'].includes(error.code))throw error;}}};
  const counts={files:0,links:0};
  const stuck=unreadable.map(entry=>`unreadable ${entry}`);
  if(!targets.length){
    if(stuck.length)throw new Error(`Probe cleanup removed nothing and could not read ${stuck.join(', ')}`);
    return {...counts,elapsedMs:Date.now()-began};
  }
  const trash=path.join(root,`.probe-cleanup-${randomUUID()}`);
  let moved;
  try{moved=withProbeCleanupGuard((files)=>{
    for(const file of files){
      let named;
      try{named=reservationNaming(file,directory,root);}
      catch(error){return {skipped:true,reason:error.message};}
      if(named)return {skipped:true,reason:`Reservation entry at ${file} names ${named}, which overlaps this reviewer directory; preserve reviewer scratch`};
    }
    fs.mkdirSync(trash);
    targets.forEach((target,index)=>{
      try{fs.renameSync(target,path.join(trash,String(index)));}
      catch(error){stuck.push(`${target} (${error.code??error.message})`);}
    });
    return {skipped:false};
  },{root:reservationRoot});}
  catch(error){
    if(error.guardHeld){
      const guard=path.join(reservationRoot??machineRoot,'guard.json');
      let owner;
      try{owner=JSON.parse(fs.readFileSync(guard,'utf8')).owner;}
      catch(readError){throw new Error(`${error.message}; guard owner unavailable (${readError.message}); nothing was removed`);}
      throw new Error(`${error.message}; recorded guard owner PID ${owner?.pid??'unknown'}, start ${owner?.start??'unknown'}; nothing was removed`);
    }
    throw error;
  }
  if(moved.skipped)return {...counts,skipped:true,reason:moved.reason,elapsedMs:Date.now()-began};
  const failures=[];
  removeEntry(trash,counts,failures,retryDelays);
  try{pruneEmpty();}catch(error){stuck.push(`an emptied directory (${error.code??error.message})`);}
  if(failures.length)for(const {target,error,residual} of failures)stuck.push(`${target} (${error.code??error.message}); residual entries ${JSON.stringify(residual)}`);
  if(stuck.length)throw new Error(`Probe cleanup removed ${counts.files} files and ${counts.links} links but could not remove ${stuck.join(', ')}`);
  return {...counts,elapsedMs:Date.now()-began};
}

export function cleanupFromJournal(journal,{reservationRoot,identifyProcess=processIdentity}={}) {
  if(!path.isAbsolute(journal))throw new Error('Name the launch journal by its absolute path');
  const rows=fs.readFileSync(journal,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const directories=new Map();
  rows.forEach((row,at)=>{
    if(row.event!=='launching'||row.role!=='review')return;
    if(typeof row.reviewerDirectory!=='string'||!Array.isArray(row.reviewerHad))throw new Error(`Launch ${row.index} of ${journal} recorded no reviewer directory snapshot, so what the reviewer created cannot be told; nothing was removed`);
    const later=rows.slice(at+1).filter(later=>later.index===row.index);
    const exited=later.find(item=>item.event==='exited');
    const service=later.find(item=>item.event==='execution-service');
    if(service&&(!exited||!exited.executionDrained&&!later.slice(later.indexOf(exited)+1).some(item=>item.event==='execution-drained')))throw new Error(`Launch ${row.index} has no confirmed execution drain; nothing was removed`);
    if(!exited){
      const absent=later.find(item=>item.event==='confirmed-absent'&&item.settledBy==='settle-launch');
      const coordinator=rows.find(item=>item.event==='coordinator')?.processIdentity;
      const child=later.find(item=>item.event==='identified')?.childIdentity;
      const running=later.find(item=>item.event==='running');
      const valid=value=>value&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.start==='string'&&value.start.length>0;
      const same=(a,b)=>valid(a)&&valid(b)&&a.pid===b.pid&&a.start===b.start;
      if(!absent||!valid(coordinator)||!valid(child)||child.pid!==running?.pid||!same(absent.childIdentity,child)||!same(absent.coordinatorIdentity,coordinator)||!Number.isFinite(Date.parse(absent.verifiedAt)))throw new Error(`The reviewer of launch ${row.index} has no exited row or verified settled identities in ${journal}; nothing was removed`);
      if(same(child,identifyProcess(child.pid))||same(coordinator,identifyProcess(coordinator.pid)))throw new Error(`Launch ${row.index} still has a running recorded identity; nothing was removed`);
    }
    const flag=Array.isArray(row.args)?row.args.findIndex(arg=>['--output-last-message','-o'].includes(arg)):-1;
    const report=row.report??(flag>=0?row.args[flag+1]:undefined);
    const key=fold(path.resolve(row.reviewerDirectory));
    const entry=directories.get(key)??{directory:row.reviewerDirectory,indexes:[],preserve:new Set(row.reviewerHad),keep:[]};
    entry.indexes.push(row.index);
    if(report)entry.keep.push(report);
    directories.set(key,entry);
  });
  if(!directories.size)throw new Error(`${journal} records no review launch with a reviewer directory; nothing was removed`);
  return [...directories.values()].map(({directory,indexes,preserve,keep})=>({indexes,directory,
    ...removeProbeCheckouts(directory,{preserve,keep:keep.filter(file=>fs.existsSync(file)),reservationRoot})}));
}

if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node scripts/reviewer-probe-cleanup.mjs <absolute-journal>');
    for(const result of cleanupFromJournal(process.argv[2]))console.log(JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
