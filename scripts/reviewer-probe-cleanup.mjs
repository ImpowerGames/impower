// A Codex reviewer clones and installs the reviewed head and base into its
// private directory (about 2.5 GB each), and a container's disk is shared by
// every concurrent round (#1451). Once the launcher has confirmed the exit and
// validated the report, those probe checkouts are dead weight: this removes
// everything in the directory except the files named to keep.
import fs from 'node:fs';
import path from 'node:path';

const contains=(parent,child)=>{const relative=path.relative(parent,child);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);};

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

// Returns the counts of removed files and links, and the kept paths. Throws
// when the directory is not an existing real directory, so a plan pointing
// the reviewer at a link never makes this walk somewhere else.
export function removeProbeCheckouts(directory,keep=[]) {
  const root=fs.realpathSync.native(directory);
  if(!fs.lstatSync(directory).isDirectory())throw new Error(`Reviewer directory ${directory} is not a directory`);
  // A kept file elsewhere (a prompt kept in the job directory) needs no protection here.
  const kept=new Set(keep.map(file=>path.join(fs.realpathSync.native(path.dirname(file)),path.basename(file))).filter(file=>contains(root,file)));
  const counts={files:0,links:0};
  const visit=(current)=>{
    for(const name of fs.readdirSync(current)){
      const target=path.join(current,name);
      if(kept.has(target))continue;
      // A directory holding a kept file is walked, not removed.
      if([...kept].some(file=>contains(target,file))&&fs.lstatSync(target).isDirectory()){visit(target);continue;}
      removeEntry(target,counts);
    }
  };
  visit(root);
  return {...counts,kept:[...kept]};
}
