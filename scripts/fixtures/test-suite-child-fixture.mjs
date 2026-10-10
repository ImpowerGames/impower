import fs from 'node:fs';
import {spawnDetached} from '../detached-launch.mjs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {processIdentity} from '../reviewer-slots.mjs';
const [mode, inventory] = process.argv.slice(2);
if(mode==='coordinator-death'||mode==='coordinator-held') {
  const {runOwnedChild,prepareOwnedChild}=await import('../test-suite-child.mjs');
  const directory=path.dirname(inventory);
  const persist=value=>fs.writeFileSync(path.join(directory,'expected.json'),JSON.stringify(value));
  const request={directory,command:process.execPath,args:[import.meta.filename,'detach',inventory],
    cwd:directory,timeoutMs:15000,reservationToken:randomUUID(),onReady:persist,onStarted(value) {
      persist(value);
      const watch=setInterval(()=>{
        if(mode==='coordinator-death'&&fs.existsSync(inventory)&&fs.readFileSync(inventory,'utf8').trim().split('\n').length===3)process.exit(29);
      },10);
      watch.unref();
    }};
  const prepared=await prepareOwnedChild(request);
  const result=prepared.status==='prepared'?await runOwnedChild({...request,prepared}):prepared;
  throw new Error('Coordinator fixture did not die after its actual grandchild marker: '+JSON.stringify(result));
}
fs.appendFileSync(inventory, JSON.stringify({pid:process.pid,mode,start:process.platform==='linux'?processIdentity(process.pid).start:undefined})+'\n');
if(mode==='console-grandchild') {
  if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Visible console control is restricted to hosted Windows CI');
  const [executable,windows]=process.argv.slice(4);
  // Caller is the explicitly CI-only visibility control; false is deliberate.
  const options={stdio:'ignore',windowsHide:false};
  const child=/* windows-hide: caller */ spawn(executable,['record',windows],options);
  child.unref();
  await new Promise(resolve=>setTimeout(resolve,15000));
}
else if(mode==='loop')for(;;) {}
else if(mode==='exit0')process.exitCode=0;
else if(mode==='exit7')process.exitCode=7;
else if(mode==='leak') {
  const child=spawnDetached(process.execPath,[import.meta.filename,'sleep',inventory],{stdio:'ignore'});
  child.unref();
  await new Promise(resolve=>setTimeout(resolve,100));
} else if(mode==='detach') {
  const child=spawnDetached(process.execPath,[import.meta.filename,'leak',inventory],{stdio:'ignore'});
  child.unref();
  await new Promise(resolve=>setTimeout(resolve,100));
} else if(mode==='detach-held'||mode==='leak-held') {
  const child=spawnDetached(process.execPath,[import.meta.filename,mode==='detach-held'?'leak-held':'sleep',inventory],
    {stdio:'ignore'});
  child.unref();
  await new Promise(resolve=>setTimeout(resolve,15000));
} else if(mode==='sleep')await new Promise(resolve=>setTimeout(resolve,15000));
else if(mode==='sentinel')await new Promise(resolve=>setTimeout(resolve,60000));
else throw new Error('Unknown fixture mode');
