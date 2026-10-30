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
