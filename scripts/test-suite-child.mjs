import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {processIdentity} from './reviewer-slots.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const identity=value=>value&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.start==='string'&&value.start.length>0;
const same=(a,b)=>identity(a)&&identity(b)&&a.pid===b.pid&&a.start===b.start;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const boundary=Symbol('deadline');
const bounded=(promise,ms)=>{
  let timer;
  return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(boundary),ms);})]).finally(()=>clearTimeout(timer));
};
const ordinary=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error(`Expected an ordinary proof file: ${file}`);
};
const synchronous=(callback,value)=>{
  const returned=callback(value);
  if(returned&&typeof returned.then==='function') {
    Promise.resolve(returned).catch(()=>{});
    throw new Error('Supervisor persistence callbacks must complete synchronously');
  }
};

// Exit ownership and test success are separate. This validator proves only the
// recorded supervisor lifecycle; callers still verify complete test evidence.
export function readTreeProof(expected,{identify=processIdentity,close}={}) {
  const current=pid=>{
    const value=identify(pid);
    if(value!==null&&!identity(value))throw new Error('Process identity inspection is unknown');
    return value;
  };
  const directory=fs.realpathSync.native(expected.directory);
  if(path.resolve(expected.proofFile)!==path.join(path.resolve(expected.directory),'tree-proof.json'))throw new Error('Unexpected tree-proof path');
  ordinary(expected.proofFile);
  if(path.dirname(fs.realpathSync.native(expected.proofFile))!==directory)throw new Error('Tree proof redirected outside its attempt');
  const proof=JSON.parse(fs.readFileSync(expected.proofFile,'utf8'));
  if(proof.version!==1||!uuid(expected.attemptId)||!uuid(expected.reservationToken)||!uuid(expected.launchNonce)
    ||['attemptId','reservationToken','launchNonce'].some(key=>proof[key]!==expected[key])
    ||!same(proof.helper,expected.helper))throw new Error('Tree proof does not match the recorded attempt/token/helper identity');
  if(!['exited','timed-out','interrupted','not-run'].includes(proof.status)||!stamp(proof.finishedAt)
    ||typeof proof.timedOut!=='boolean'||typeof proof.interrupted!=='boolean'
    ||proof.status==='interrupted'&&!proof.interrupted
    ||proof.status==='exited'&&proof.interrupted
    ||proof.timedOut!==(proof.status==='timed-out'))throw new Error('Invalid terminal tree-proof outcome');
  const mechanism=expected.platform==='win32'?'windows-job':expected.platform==='linux'?'linux-subreaper':null;
  if(!mechanism||proof.tree?.mechanism!==mechanism||proof.tree.empty!==true)throw new Error('Missing terminal empty-tree observation');
  if(proof.root===null) {
    if(expected.root||proof.status!=='not-run'||proof.tree.observation!=='no-launch'||proof.exit!==null||proof.signal!==null||proof.timedOut)throw new Error('Invalid no-launch proof');
  } else {
    if(!identity(proof.root)||proof.root.pid===proof.helper.pid||!stamp(proof.startedAt)
      ||Date.parse(proof.finishedAt)<Date.parse(proof.startedAt)
      ||expected.root&&!same(proof.root,expected.root))throw new Error('Invalid or mismatched root identity/timestamps');
    if(!(Number.isInteger(proof.exit)&&proof.exit>=0&&proof.signal===null)
      &&!(proof.exit===null&&typeof proof.signal==='string'&&/^SIG[A-Z0-9]+$/.test(proof.signal)))throw new Error('Missing actual root outcome');
    if(proof.tree.observation!==(mechanism==='windows-job'?'active-processes-zero':'ECHILD')
      ||!stamp(proof.tree.observedAt)||Date.parse(proof.tree.observedAt)<Date.parse(proof.startedAt)
      ||mechanism==='windows-job'&&proof.tree.activeProcesses!==0)throw new Error('Missing OS terminal ancestry evidence');
    if(proof.status==='not-run'&&typeof proof.launchError!=='string')throw new Error('A started-root not-run requires exec refusal evidence');
    if(same(proof.root,current(proof.root.pid)))throw new Error('Proof contradicts a live root identity');
  }
  if(same(proof.helper,current(proof.helper.pid)))throw new Error('Supervisor still running; await actual exit');
  if(close) {
    if(close.signal)throw new Error('Supervisor was terminated; final outcome unavailable');
    const expectedExit=proof.status==='timed-out'?124:proof.status==='interrupted'?125:proof.status==='not-run'?75:proof.exit===0?0:1;
    if(close.exit!==expectedExit)throw new Error('Supervisor exit contradicts its final proof');
  }
  return proof;
}

export async function runOwnedChild({directory,command,args=[],cwd,env=process.env,timeoutMs,
  attemptId=randomUUID(),reservationToken,platform=process.platform,startupMs=60000,cleanupMs=10000,
  identify=processIdentity,onPreparing=()=>{},onReady=()=>{},onAuthorize=()=>{},onStarted=()=>{},
  onEvent=()=>{},helperScript,helperExecutable}) {
  if(!['win32','linux'].includes(platform))throw new Error('Owned test children require Windows or Linux');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>7200000)throw new Error('Invalid bounded file timeout');
  if(!Number.isSafeInteger(startupMs)||startupMs<100||startupMs>60000
    ||!Number.isSafeInteger(cleanupMs)||cleanupMs<100||cleanupMs>10000)throw new Error('Invalid supervisor startup/cleanup bounds');
  if(!uuid(attemptId)||!uuid(reservationToken)||!path.isAbsolute(directory)||!path.isAbsolute(command)
    ||!Array.isArray(args)||!args.every(arg=>typeof arg==='string'&&!arg.includes('\0')))throw new Error('Invalid owned-child request');
  directory=fs.realpathSync.native(directory);
  const expected={version:1,directory,attemptId,reservationToken,launchNonce:randomUUID(),platform,
    proofFile:path.join(directory,'tree-proof.json'),logFile:path.join(directory,'output.log')};
  const requestFile=path.join(directory,'child-request.json');
  fs.writeFileSync(requestFile,JSON.stringify({...expected,command,args,cwd,timeoutMs,startupMs}),{flag:'wx'});
  synchronous(onPreparing,expected);
  const helper=helperScript??path.join(here,platform==='win32'?'test-suite-child-windows.ps1':'test-suite-child-linux.py');
  let executable=helperExecutable??'python3';
  let launchArgs=[helper,requestFile],remainingStartup=startupMs;
  if(platform==='win32'&&!helperExecutable) {
    const assembly=path.join(directory,'test-suite-child-windows.exe');
    if(fs.existsSync(assembly))throw new Error('Attempt already contains a supervisor assembly; never reuse it');
    const admission=Date.now();
    const compiler=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,requestFile],
      {cwd,env,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let diagnostics='',launchError;
    compiler.stderr.setEncoding('utf8');compiler.stderr.on('data',chunk=>{diagnostics+=chunk;});
    compiler.on('error',error=>{launchError=error.message;});
    const compilerClose=new Promise(resolve=>compiler.once('close',(exit,signal)=>resolve({exit,signal})));
    try {
      expected.compiler=compiler.pid?identify(compiler.pid):null;
      synchronous(onPreparing,expected);
    } catch(error) {
      launchError=error.message;
      try { compiler.kill(); } catch(killError) { diagnostics+=killError.message; }
    }
    compiler.stderr.on('error',error=>{diagnostics+=error.message;});
    let closed=await bounded(compilerClose,startupMs);
    const compilerTimedOut=closed===boundary;
    if(closed===boundary) {
      try { compiler.kill(); } catch(error) { launchError??=error.message; }
      closed=await bounded(compilerClose,cleanupMs);
    }
    if(closed===boundary||closed.exit!==0||closed.signal||launchError) {
      if(closed===boundary){compiler.stderr.destroy();compiler.unref();}
      // We have no compiler-tree supervisor yet. A forced/failed compilation
      // cannot prove any compiler descendants exited merely from PS close.
      return {...expected,status:'unknown',exit:null,signal:null,
        exitConfirmed:false,launchAuthorized:false,launchError,diagnostics,compilerTimedOut,
        compilerTreeConfirmed:false,
        compilerClose:closed===boundary?null:closed};
    }
    try {
      ordinary(assembly);
      const descriptor=fs.openSync(assembly,'r'),signature=Buffer.alloc(2);
      try {fs.readSync(descriptor,signature,0,2,0);} finally {fs.closeSync(descriptor);}
      if(signature.toString('ascii')!=='MZ'||fs.statSync(assembly).size<256
        ||path.dirname(fs.realpathSync.native(assembly))!==directory)throw new Error('Fresh supervisor assembly is invalid');
    } catch(error) {
      return {...expected,status:'not-run',exit:null,signal:null,exitConfirmed:true,
        launchAuthorized:false,launchError:error.message,compilerClose:closed};
    }
    remainingStartup=Math.max(1,startupMs-(Date.now()-admission));
    executable=assembly;
    launchArgs=[requestFile];
  } else if(platform==='win32')launchArgs=['-NoProfile','-NonInteractive','-File',helper,requestFile];
  // libuv's ordinary Windows child Job kills the supervisor when Node dies,
  // preventing its EOF cleanup/proof. Detach only this helper; keep its pipes
  // and process handle referenced until actual close. Its own Job owns tests.
  const child=spawn(executable,launchArgs,{cwd,env,windowsHide:true,detached:platform==='win32',stdio:['pipe','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  let launchError,coordinationError,protocolError,buffer='',diagnostics='',authorized=false,readyResolve;
  let startedMetadata=null;
  const completion=new Promise(resolve=>{
    child.once('error',error=>{launchError=error.message;});
    child.once('close',(exit,signal)=>resolve({exit,signal}));
  });
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  completion.then(()=>readyResolve(null));
  const disconnect=()=>{if(!child.stdin.destroyed)child.stdin.end();};
  child.stdin.on('error',error=>{protocolError??=error.message;});
  child.stdout.on('error',error=>{protocolError??=error.message;disconnect();});
  child.stderr.on('error',error=>{protocolError??=error.message;disconnect();});
  child.stderr.on('data',chunk=>{diagnostics+=chunk;});
  child.stdout.on('data',chunk=>{
    buffer+=chunk;
    try {
      if(buffer.length>65536)throw new Error('Oversized supervisor protocol');
      for(;;) {
        const newline=buffer.indexOf('\n');if(newline<0)break;
        const row=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);
        if(row.attemptId!==expected.attemptId||row.launchNonce!==expected.launchNonce)throw new Error('Supervisor protocol binding changed');
        if(row.event==='ready')readyResolve(row);
        else if(row.event==='started') {
          if(!authorized||startedMetadata||!identity(row.root)||!stamp(row.startedAt))throw new Error('Unexpected root launch metadata');
          startedMetadata=row;expected.root=row.root;
          try { synchronous(onStarted,{...expected,startedAt:row.startedAt}); }
          catch(error) { coordinationError??=error.message;disconnect(); }
        }
        onEvent(row);
      }
    } catch(error) { protocolError??=error.message;disconnect(); }
  });
  let readyRow=await bounded(ready,remainingStartup);
  if(readyRow===boundary) {
    protocolError='Supervisor startup deadline expired before launch authorization';
    disconnect();
    // Before authorization, the helper cannot start a test. Require actual close.
    try { child.kill(); } catch(error) { coordinationError??=error.message; }
  } else if(readyRow) {
    try {
      if(protocolError)throw new Error(protocolError);
      expected.helper=child.pid?identify(child.pid):null;
      if(!same(readyRow.helper,expected.helper))throw new Error('Supervisor OS identity unavailable or mismatched');
      synchronous(onReady,expected);
      synchronous(onAuthorize,expected); // persist may-launch before sending the nonce
      authorized=true;
      child.stdin.write(expected.launchNonce+'\n');
    } catch(error) { coordinationError??=error.message;disconnect(); }
  }
  let close=await bounded(completion,authorized?timeoutMs+cleanupMs+2000:cleanupMs);
  if(close===boundary) {
    protocolError??='Supervisor exit unavailable; preserve the owned-tree reservation';
    disconnect();
    // Never terminate an authorized Linux subreaper as a cleanup substitute.
    // Its eventual proof may enable safe recovery; absence alone may not.
    child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();child.unref();
    return {...expected,status:'unknown',exit:null,signal:null,exitConfirmed:false,
      launchAuthorized:authorized,launchError,coordinationError,protocolError,diagnostics};
  }
  if(!authorized)return {...expected,status:'not-run',exit:null,signal:null,exitConfirmed:true,
    launchAuthorized:false,helperClose:close,launchError,coordinationError,protocolError,diagnostics};
  try {
    const proof=readTreeProof(expected,{identify,close});
    return {...expected,...proof,exitConfirmed:true,launchAuthorized:true,helperClose:close,
      launchError:proof.launchError??launchError,coordinationError,protocolError,diagnostics};
  } catch(error) {
    return {...expected,status:'unknown',exit:null,signal:null,exitConfirmed:false,
      launchAuthorized:true,helperClose:close,coordinationError,protocolError:protocolError??error.message,diagnostics};
  }
}
