// Scratch-folder cleanup for the standalone checks. On Windows a scanner or
// indexer can briefly hold a freshly written file, and fs.rmSync's own
// maxRetries never retries the EACCES that produces. Cleanup runs in a finally,
// where a throw would replace the check's own verdict, so an exhausted retry
// warns with the leftover path and returns false.
import fs from 'node:fs';

const TRANSIENT=['EACCES','EBUSY','ENOTEMPTY','EPERM'];

export function removeScratch(directory,{attempts=5,delay=100,rm=fs.rmSync,warn=console.warn}={}) {
  for(let attempt=1;;attempt++){
    try{rm(directory,{recursive:true,force:true});return true;}
    catch(error){
      if(!TRANSIENT.includes(error.code)||attempt>=attempts){warn(`WARN: scratch folder left behind (${error.code}): ${directory}`);return false;}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,delay);
    }
  }
}
