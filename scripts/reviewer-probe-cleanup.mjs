// A Codex reviewer clones and installs the reviewed head and base into its
// private directory (about 2.5 GB each), and a container's disk is shared by
// every concurrent round (#1451). Once the reviewer has exited, those probe
// checkouts and temp directories are scratch. The launcher snapshots the
// directory's top-level names before the reviewer starts and records them in
// its `launching` row, and this removes only the directories and links that
// appeared after, never what the plan or another round already had there and
// never a regular file the reviewer wrote (its report, its first pass).
//
// The launcher calls removeProbeCheckouts on every path after the exit is
// confirmed. The adjudicating writer runs the same removal from the journal:
//   node scripts/reviewer-probe-cleanup.mjs <absolute-journal>
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {withProbeCleanupGuard} from './test-suite-process.mjs';

// The names the directory holds now; the launcher takes this before the spawn.
export const snapshotReviewerDirectory=(directory)=>new Set(fs.readdirSync(directory));

const fold=(value)=>process.platform==='win32'?value.toLowerCase():value;
const isInside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};
// Whether two absolute paths are the same or one holds the other.
const overlaps=(a,b)=>{const x=fold(path.resolve(a)),y=fold(path.resolve(b));return x===y||isInside(x,y)||isInside(y,x);};

// Removes one entry without following links. A symbolic link or Windows
// junction is unlinked itself, never entered; a directory is emptied first.
function removeEntry(target,counts) {
  const stat=fs.lstatSync(target);
  if(stat.isSymbolicLink()){
    // A Windows junction reports as a symbolic link and unlinks as a directory.
    try{fs.unlinkSync(target);}catch(error){if(process.platform!=='win32'||!['EPERM','EISDIR','EACCES'].includes(error.code))throw error;fs.rmdirSync(target);}
    counts.links++;
    return;
  }
  if(stat.isDirectory()){
    for(const name of fs.readdirSync(target))removeEntry(path.join(target,name),counts);
    fs.rmdirSync(target);
    return;
  }
  fs.rmSync(target,{force:true});
  counts.files++;
}

// Every absolute path a reservation entry names, and those its run journal
// names (a direct run's journal holds the package root it tests).
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

// `preserve` holds the top-level names that existed before the reviewer ran;
// `keep` the files to keep wherever they are (the final report). A kept file
// inside the directory must be a regular file, matched by its real path
// (another case or a Windows 8.3 short name still matches): a link would need
// every link component and target kept to stay readable, so one refuses the
// whole cleanup before anything is removed. A kept file elsewhere needs no
// protection here.
//
// The machine test reservation is read under its guard. An entry that names
// this directory, holds it, or lies inside it (a run testing a probe clone, or
// a run journal kept there) preserves the whole directory, since deleting it
// would remove that run's ownership evidence, and so does an entry or run
// journal that cannot be read; an entry naming anything else does not delay
// the cleanup. Still under the guard, every entry to remove is
// renamed into one `.probe-cleanup-<id>` directory, so no run can start in a
// probe clone after the check; the guard is then released and that directory
// is deleted, so test admission never waits on the deletion.
//
// Returns the removed file and link counts and the elapsed time, plus
// `skipped` and `reason` when a reservation preserved the directory. Throws
// when the directory is not an existing real directory, so a plan pointing the
// reviewer at a link never makes this walk somewhere else, and when an entry
// could not be moved aside or deleted, naming what remains.
export function removeProbeCheckouts(directory,{preserve=new Set(),keep=[],reservationRoot}={}) {
  const began=Date.now();
  if(!fs.lstatSync(directory).isDirectory())throw new Error(`Reviewer directory ${directory} is not a directory`);
  const root=fs.realpathSync.native(directory);
  const kept=new Set();
  for(const file of keep){
    // lstat of the path as given sees a link or a directory; the real path is the
    // name the directory lists (another case, or a Windows 8.3 short name, resolves to it).
    const stat=fs.lstatSync(file),target=fs.realpathSync.native(file);
    if(!isInside(root,target))continue;
    if(!stat.isFile())throw new Error(`Kept file ${file} is not a regular file; nothing was removed`);
    kept.add(target);
  }
  // Directories and links to remove; a directory holding a kept file is walked
  // instead, and regular files the walk meets stay.
  const targets=[];
  const visit=(current,top)=>{
    for(const name of fs.readdirSync(current)){
      const target=path.join(current,name);
      if(top&&preserve.has(name)||kept.has(target))continue;
      const stat=fs.lstatSync(target);
      if(!stat.isDirectory()&&!stat.isSymbolicLink())continue;
      if(stat.isDirectory()&&[...kept].some(file=>isInside(target,file))){visit(target,false);continue;}
      targets.push(target);
    }
  };
  visit(root,true);
  const counts={files:0,links:0};
  if(!targets.length)return {...counts,elapsedMs:Date.now()-began};
  const trash=path.join(root,`.probe-cleanup-${randomUUID()}`);
  const stuck=[];
  const moved=withProbeCleanupGuard((file)=>{
    let named;
    try{named=reservedPaths(file).find(value=>overlaps(value,root)||overlaps(value,directory));}
    catch(error){return {skipped:true,reason:error.message};}
    if(named)return {skipped:true,reason:`Reservation entry at ${file} names ${named}, which overlaps this reviewer directory; preserve reviewer scratch`};
    fs.mkdirSync(trash);
    targets.forEach((target,index)=>{
      try{fs.renameSync(target,path.join(trash,String(index)));}
      catch(error){stuck.push(`${target} (${error.code??error.message})`);}
    });
    return {skipped:false};
  },{root:reservationRoot});
  if(moved.skipped)return {...counts,skipped:true,reason:moved.reason,elapsedMs:Date.now()-began};
  try{removeEntry(trash,counts);}
  catch(error){stuck.push(`${trash} (${error.code??error.message})`);}
  if(stuck.length)throw new Error(`Probe cleanup removed ${counts.files} files and ${counts.links} links but could not remove ${stuck.join(', ')}`);
  return {...counts,elapsedMs:Date.now()-began};
}

// The removal the launcher performs, run again from its journal once the
// reviewer has exited: for each review launch that recorded its directory and
// snapshot, it requires the matching `exited` row and keeps the report the
// launch named. The journal, the plan and the launch directory lie outside the
// reviewer directory and are never touched; nothing is appended to the journal.
export function cleanupFromJournal(journal,{reservationRoot}={}) {
  if(!path.isAbsolute(journal))throw new Error('Name the launch journal by its absolute path');
  const rows=fs.readFileSync(journal,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const results=[];
  rows.forEach((row,at)=>{
    if(row.event!=='launching'||row.role!=='review')return;
    if(typeof row.reviewerDirectory!=='string'||!Array.isArray(row.reviewerHad))throw new Error(`Launch ${row.index} of ${journal} recorded no reviewer directory snapshot, so what the reviewer created cannot be told; nothing was removed`);
    const exited=rows.slice(at+1).find(later=>later.event==='exited'&&later.index===row.index);
    if(!exited)throw new Error(`The reviewer of launch ${row.index} has no exited row in ${journal}; wait for it to exit; nothing was removed`);
    const flag=Array.isArray(row.args)?row.args.findIndex(arg=>['--output-last-message','-o'].includes(arg)):-1;
    const report=row.report??(flag>=0?row.args[flag+1]:undefined);
    const keep=report&&fs.existsSync(report)?[report]:[];
    results.push({index:row.index,directory:row.reviewerDirectory,...removeProbeCheckouts(row.reviewerDirectory,{preserve:new Set(row.reviewerHad),keep,reservationRoot})});
  });
  if(!results.length)throw new Error(`${journal} records no review launch with a reviewer directory; nothing was removed`);
  return results;
}

if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node scripts/reviewer-probe-cleanup.mjs <absolute-journal>');
    for(const result of cleanupFromJournal(process.argv[2]))console.log(JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
