// A Codex reviewer clones and installs the reviewed head and base into its
// private directory (about 2.5 GB each), and a container's disk is shared by
// every concurrent round (#1451). Once the launcher has confirmed the exit and
// validated the report, those probe checkouts are dead weight. The launcher
// snapshots the directory's top-level names before the reviewer starts, and
// this removes only the entries that appeared after, never what the plan or
// another round already had there, so a plan whose reviewer directory is
// shared with other files cannot lose them.
import fs from 'node:fs';
import path from 'node:path';

// The names the directory holds now; the launcher takes this before the spawn.
export const snapshotReviewerDirectory=(directory)=>new Set(fs.readdirSync(directory));

const isInside=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};

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

// `preserve` holds the top-level names that existed before the reviewer ran;
// `keep` the files to keep even though they are new (the final report). A kept
// file is matched by its canonical name, so another spelling of the same path
// (a different case on Windows) still protects it. Returns the counts of
// removed files and links. Throws when the directory is not an existing real
// directory, so a plan pointing the reviewer at a link never makes this walk
// somewhere else.
export function removeProbeCheckouts(directory,{preserve=new Set(),keep=[]}={}) {
  if(!fs.lstatSync(directory).isDirectory())throw new Error(`Reviewer directory ${directory} is not a directory`);
  const root=fs.realpathSync.native(directory);
  const canonical=(file)=>{try{return fs.realpathSync.native(file);}catch{return path.join(fs.realpathSync.native(path.dirname(file)),path.basename(file));}};
  const kept=new Set(keep.map(canonical).filter(file=>isInside(root,file)));
  const counts={files:0,links:0};
  const visit=(current,top)=>{
    for(const name of fs.readdirSync(current)){
      const target=path.join(current,name);
      if(top&&preserve.has(name)||kept.has(target))continue;
      // A directory holding a kept file is walked, not removed.
      if([...kept].some(file=>isInside(target,file))&&fs.lstatSync(target).isDirectory()){visit(target,false);continue;}
      removeEntry(target,counts);
    }
  };
  visit(root,true);
  return counts;
}
