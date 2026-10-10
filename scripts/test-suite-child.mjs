import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {processIdentity} from './reviewer-slots.mjs';
import {spawnDetached} from './detached-launch.mjs';

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
const disposeUnconfirmed=child=>{
  const errors=[];
  for(const stream of [child.stdin,child.stdout,child.stderr])try {stream?.destroy();} catch(error) {errors.push(error.message);}
  try {child.unref();} catch(error) {errors.push(error.message);}
  return errors;
};

// Exit ownership and test success are separate. This validator proves only the
// recorded supervisor lifecycle; callers still verify complete test evidence.
export function readTreeProof(expected,{identify=processIdentity,close}={}) {
  if(!identity(expected.launcher))throw new Error('Recorded launcher identity is missing or invalid');
  if(expected.platform==='linux'&&!same(expected.launcher,expected.helper))throw new Error('Linux launcher/helper identity differs');
  const current=pid=>{
    const value=identify(pid);
    if(value!==null&&!identity(value))throw new Error('Process identity inspection is unknown');
    return value;
  };
  const directory=fs.realpathSync.native(expected.directory);
  if(directory!==expected.directory)throw new Error('Recorded attempt directory changed');
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
  if(same(expected.launcher,current(expected.launcher.pid)))throw new Error('Supervisor launcher still running; await actual exit');
  if(close) {
    if(close.signal)throw new Error('Launcher was terminated; final outcome unavailable');
    const expectedExit=proof.status==='timed-out'?124:proof.status==='interrupted'?125:proof.status==='not-run'?75:proof.exit===0?0:1;
    if(close.exit!==expectedExit)throw new Error('Launcher exit contradicts its final proof');
  }
  return proof;
}

const digest=value=>createHash('sha256').update(value).digest('hex');
const environmentDigest=env=>digest(JSON.stringify(Object.entries(env).sort(([a],[b])=>a.localeCompare(b))));
const fileBinding=file=>{
  ordinary(file);
  return {file:fs.realpathSync.native(file),sha256:digest(fs.readFileSync(file))};
};
const validateBindings=bindings=>{
  for(const binding of bindings) {
    const current=fileBinding(binding.file);
    if(current.file!==binding.file||current.sha256!==binding.sha256)throw new Error('Prepared supervisor artifact changed');
  }
};
const validateAssembly=(assembly,directory)=>{
  ordinary(assembly);
  const descriptor=fs.openSync(assembly,'r'),signature=Buffer.alloc(2);
  try {fs.readSync(descriptor,signature,0,2,0);} finally {fs.closeSync(descriptor);}
  if(signature.toString('ascii')!=='MZ'||fs.statSync(assembly).size<256
    ||path.dirname(fs.realpathSync.native(assembly))!==directory)throw new Error('Fresh supervisor assembly is invalid');
};
export function validatePreparedChild(prepared,{env=process.env,consumed=false}={}) {
  if(prepared.version!==1||prepared.status!=='prepared'||!uuid(prepared.attemptId)||!uuid(prepared.launchNonce)
    ||!path.isAbsolute(prepared.directory)||environmentDigest(env)!==prepared.environmentDigest)throw new Error('Prepared supervisor binding is invalid');
  const directory=fs.realpathSync.native(prepared.directory),manifest=path.join(directory,'prepared.json');
  if(directory!==prepared.directory)throw new Error('Prepared attempt directory changed');
  ordinary(manifest);
  if(path.dirname(fs.realpathSync.native(manifest))!==directory
    ||JSON.stringify(JSON.parse(fs.readFileSync(manifest,'utf8')))!==JSON.stringify(prepared))throw new Error('Prepared supervisor descriptor changed');
  validateBindings(prepared.bindings);
  validatePreparedRuntime(prepared.runtime,{env});
  if(prepared.executable!==prepared.runtime.executable||prepared.platform!==prepared.runtime.platform
    ||JSON.stringify(prepared.bindings)!==JSON.stringify(prepared.runtime.bindings))throw new Error('Attempt runtime binding changed');
  if(!consumed&&fs.existsSync(path.join(directory,'child-request.json')))throw new Error('Prepared attempt was already consumed');
  return prepared;
}

// This completes before acquiring a machine test reservation. Uncertain
// compilation/capability processes remain preparation evidence, not test owners.
export async function prepareOwnedRuntime({directory,cwd=directory,env=process.env,
  invocationId=randomUUID(),platform=process.platform,startupMs=60000,cleanupMs=10000,
  identify=processIdentity,helperScript,onPreparation=()=>{}}) {
  if(!['win32','linux'].includes(platform))throw new Error('Owned test children require Windows or Linux');
  if(!Number.isSafeInteger(startupMs)||startupMs<100||startupMs>60000
    ||!Number.isSafeInteger(cleanupMs)||cleanupMs<100||cleanupMs>10000)throw new Error('Invalid supervisor startup/cleanup bounds');
  if(!uuid(invocationId)||!path.isAbsolute(directory)||!path.isAbsolute(cwd))throw new Error('Invalid owned-runtime preparation');
  directory=fs.realpathSync.native(directory);
  const helper=helperScript??path.join(here,platform==='win32'?'test-suite-child-windows.ps1':'test-suite-child-linux.py');
  const assembly=path.join(directory,'test-suite-child-windows.exe'),bindings=[fileBinding(helper),fileBinding(path.join(here,'detached-launch.mjs'))];
  if(platform==='win32') {
    const source=path.join(path.dirname(helper),'test-suite-child-windows.cs');
    if(fs.existsSync(source))bindings.push(fileBinding(source));
  }
  const prepared={version:1,status:'prepared',directory,invocationId,platform,
    startupMs,cleanupMs,environmentDigest:environmentDigest(env),
    executable:platform==='win32'?assembly:'python3',helper,bindings};
  const preparationFile=path.join(directory,'preparation-request.json');
  if(fs.existsSync(path.join(directory,'runtime.json'))||fs.existsSync(assembly))throw new Error('Invocation already contains preparation artifacts; never reuse it');
  fs.writeFileSync(preparationFile,JSON.stringify(prepared),{flag:'wx'});
  const executable=platform==='win32'?'powershell.exe':'python3';
  const linuxProbeNonce=randomUUID();
  const launchArgs=platform==='win32'?['-NoProfile','-NonInteractive','-File',helper,preparationFile]:[helper,'--check',linuxProbeNonce,String(startupMs)];
  const child=spawn(executable,launchArgs,{cwd,env,windowsHide:true,stdio:[platform==='win32'?'ignore':'pipe','pipe','pipe']});
  let diagnostics='',output='',launchError,preparationProcess=null;
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    output+=chunk;
    if(platform==='linux'&&output.includes('\n')) {
      try {
        const row=JSON.parse(output.trim()),actual=identity(row.helper)?identify(row.helper.pid):null;
        if(row.event!=='capable'||row.probeNonce!==linuxProbeNonce||row.helper.pid!==child.pid||!same(row.helper,actual))throw new Error('Linux capability probe identity mismatch');
        preparationProcess=actual;synchronous(onPreparation,{...prepared,preparationProcess});
        child.stdin.end(linuxProbeNonce+'\n');
      } catch(error) {launchError=error.message;child.stdin.end();}
    }
  });
  child.stdin?.on('error',error=>{launchError??=error.message;});
  child.stderr.on('data',chunk=>{diagnostics+=chunk;});
  child.stdout.on('error',error=>{diagnostics+=error.message;});
  child.stderr.on('error',error=>{diagnostics+=error.message;});
  child.on('error',error=>{launchError=error.message;});
  const actualClose=new Promise(resolve=>child.once('close',(exit,signal)=>resolve({exit,signal})));
  try {
    preparationProcess=child.pid?identify(child.pid):null;
    if(platform==='win32'&&child.pid&&!identity(preparationProcess))throw new Error('Preparation process identity unavailable');
    if(platform==='win32')synchronous(onPreparation,{...prepared,preparationProcess});
  } catch(error) {
    launchError=error.message;
    try {child.kill();} catch(killError) {diagnostics+=killError.message;}
  }
  let closed=await bounded(actualClose,startupMs);
  const preparationTimedOut=closed===boundary;
  if(closed===boundary) {
    try {child.kill();} catch(error) {launchError??=error.message;}
    closed=await bounded(actualClose,cleanupMs);
  }
  const evidence={preparationProcess,preparationClose:closed===boundary?null:closed,
    preparationTimedOut,launchError,diagnostics,output};
  // Disposition precedes publication. A write failure cannot leave live pipes
  // referenced or turn an unobserved close into confirmed process/tree exit.
  if(closed===boundary)evidence.preparationDisposalErrors=disposeUnconfirmed(child);
  try {fs.writeFileSync(path.join(directory,'preparation-result.json'),JSON.stringify(evidence),{flag:'wx'});}
  catch(error) {evidence.preparationPublicationError=error.message;}
  if(closed===boundary||closed.exit!==0||closed.signal||launchError||evidence.preparationPublicationError) {
    const unknown=platform==='win32'||closed===boundary;
    return {...prepared,...evidence,status:unknown?'unknown':'not-run',exit:null,signal:null,
      exitConfirmed:!unknown,launchAuthorized:false,compilerTreeConfirmed:platform==='win32'?false:undefined};
  }
  try {
    validateBindings(bindings);
    if(platform==='win32') {
      validateAssembly(assembly,directory);
      bindings.push(fileBinding(assembly));
      const probeFile=path.join(directory,'capability-request.json');
      const probeNonce=randomUUID();
      fs.writeFileSync(probeFile,JSON.stringify({capabilityOnly:true,attemptId:invocationId,launchNonce:probeNonce,startupMs,
        logFile:path.join(directory,'capability-output.log')}),{flag:'wx'});
      const probe=spawn(assembly,[probeFile],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
      let probeOutput='',probeDiagnostics='',probeError,probeIdentity=null;
      probe.stdout.setEncoding('utf8');probe.stderr.setEncoding('utf8');
      probe.stdout.on('data',chunk=>{
        probeOutput+=chunk;
        if(probeOutput.includes('\n')&&!probeIdentity) {
          try {
            const row=JSON.parse(probeOutput.trim());
            const actual=identity(row.helper)?identify(row.helper.pid):null;
            if(row.event!=='capable'||row.attemptId!==invocationId||row.launchNonce!==probeNonce
              ||row.helper.pid!==probe.pid||!same(row.helper,actual))throw new Error('Capability probe identity mismatch');
            probeIdentity=actual;probe.stdin.end(probeNonce+'\n');
          } catch(error) {probeError=error.message;probe.stdin.end();}
        }
      });probe.stderr.on('data',chunk=>{probeDiagnostics+=chunk;});
      probe.stdin.on('error',error=>{probeError??=error.message;});
      probe.stdout.on('error',error=>{probeError??=error.message;});probe.stderr.on('error',error=>{probeError??=error.message;});
      probe.on('error',error=>{probeError=error.message;});
      const probeCompletion=new Promise(resolve=>probe.once('close',(exit,signal)=>resolve({exit,signal})));
      let probeClose=await bounded(probeCompletion,startupMs);
      const probeTimedOut=probeClose===boundary;
      if(probeTimedOut) {try {probe.kill();} catch(error) {probeError??=error.message;} probeClose=await bounded(probeCompletion,cleanupMs);}
      const probeEvidence={probeIdentity,probeClose:probeClose===boundary?null:probeClose,probeTimedOut,probeError,probeOutput,probeDiagnostics};
      if(probeClose===boundary)probeEvidence.probeDisposalErrors=disposeUnconfirmed(probe);
      try {fs.writeFileSync(path.join(directory,'capability-result.json'),JSON.stringify(probeEvidence),{flag:'wx'});}
      catch(error) {probeEvidence.capabilityPublicationError=error.message;}
      if(!identity(probeIdentity)||probeClose===boundary||probeClose.exit!==0||probeClose.signal||probeError||probeEvidence.capabilityPublicationError)
        return {...prepared,...evidence,...probeEvidence,status:'unknown',exit:null,signal:null,exitConfirmed:false,launchAuthorized:false};
      const rows=probeOutput.trim().split('\n').map(row=>JSON.parse(row));
      if(rows.length!==1||rows[0].event!=='capable'||rows[0].mechanism!=='windows-job'
        ||rows[0].attemptId!==invocationId||rows[0].launchNonce!==probeNonce||!same(rows[0].helper,probeIdentity))throw new Error('Windows Job/attribute capability was not confirmed');
      validateBindings(bindings);
    } else {
      const rows=output.trim().split('\n').map(row=>JSON.parse(row));
      if(rows.length!==1||rows[0].event!=='capable'||rows[0].mechanism!=='linux-subreaper'||rows[0].probeNonce!==linuxProbeNonce
        ||!same(rows[0].helper,preparationProcess))throw new Error('Linux Python 3.9+/pidfd/subreaper capability was not confirmed');
    }
    fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify(prepared),{flag:'wx'});
    return {...prepared};
  } catch(error) {
    return {...prepared,...evidence,status:'not-run',exit:null,signal:null,exitConfirmed:true,
      launchAuthorized:false,launchError:error.message};
  }
}

export function validatePreparedRuntime(runtime,{env=process.env}={}) {
  if(runtime?.version!==1||runtime.status!=='prepared'||!uuid(runtime.invocationId)
    ||!path.isAbsolute(runtime.directory)||environmentDigest(env)!==runtime.environmentDigest)throw new Error('Prepared runtime binding is invalid');
  const directory=fs.realpathSync.native(runtime.directory),manifest=path.join(directory,'runtime.json');
  ordinary(manifest);
  if(directory!==runtime.directory||path.dirname(fs.realpathSync.native(manifest))!==directory
    ||JSON.stringify(JSON.parse(fs.readFileSync(manifest,'utf8')))!==JSON.stringify(runtime))throw new Error('Prepared runtime descriptor changed');
  validateBindings(runtime.bindings);
  if(runtime.platform==='win32')validateAssembly(runtime.executable,directory);
  return runtime;
}

// One invocation prepares immutable bytes before acquiring. Reserved discovery
// and later files each create fresh one-use state without compiling again.
export async function prepareOwnedChild({directory,command,args=[],cwd,env=process.env,timeoutMs,
  attemptId=randomUUID(),runtime,...options}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>7200000)throw new Error('Invalid bounded file timeout');
  if(!uuid(attemptId)||!path.isAbsolute(directory)||!path.isAbsolute(command)||!path.isAbsolute(cwd)
    ||!Array.isArray(args)||!args.every(arg=>typeof arg==='string'&&!arg.includes('\0')))throw new Error('Invalid owned-child preparation');
  runtime??=await prepareOwnedRuntime({directory,cwd,env,...options});
  if(runtime.status!=='prepared')return runtime;
  validatePreparedRuntime(runtime,{env});
  directory=fs.realpathSync.native(directory);
  const prepared={version:1,status:'prepared',directory,attemptId,launchNonce:randomUUID(),
    command,args:[...args],cwd,timeoutMs,platform:runtime.platform,startupMs:runtime.startupMs,cleanupMs:runtime.cleanupMs,
    executable:runtime.executable,helper:runtime.helper,bindings:runtime.bindings,environmentDigest:runtime.environmentDigest,runtime};
  fs.writeFileSync(path.join(directory,'prepared.json'),JSON.stringify(prepared),{flag:'wx'});
  return prepared;
}

export async function runOwnedChild({prepared,reservationToken,env=process.env,identify=processIdentity,
  onPreparing=()=>{},onReady=()=>{},onAuthorize=()=>{},onStarted=()=>{},onEvent=()=>{}}) {
  validatePreparedChild(prepared,{env});
  if(!uuid(reservationToken))throw new Error('A real reservation token is required after preparation');
  const {directory,command,args,cwd,timeoutMs,attemptId,platform,startupMs,cleanupMs,executable,helper}=prepared;
  const expected={version:1,directory,attemptId,reservationToken,launchNonce:prepared.launchNonce,platform,
    proofFile:path.join(directory,'tree-proof.json'),logFile:path.join(directory,'output.log')};
  const requestFile=path.join(directory,'child-request.json');
  fs.writeFileSync(requestFile,JSON.stringify({...expected,command,args,cwd,timeoutMs,startupMs}),{flag:'wx'});
  const requestBinding=fileBinding(requestFile);
  synchronous(onPreparing,expected);
  const launchArgs=platform==='win32'?[requestFile]:[helper,requestFile],remainingStartup=startupMs;
  // libuv's ordinary Windows child Job kills the supervisor when Node dies,
  // preventing its EOF cleanup/proof. The central detached launcher keeps
  // a hidden Node wrapper alive until the managed helper exits. Its own Job
  // owns tests; keep all pipes and both identities through actual close.
  // Linux also needs its own session: an outer coordinator-group cancellation
  // must leave the subreaper alive to own EOF cleanup and final proof.
  const child=spawnDetached(executable,launchArgs,{cwd,env,stdio:['pipe','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  let launchError,coordinationError,protocolError,buffer='',diagnostics='',authorized=false,authorizationAttempted=false,readyResolve;
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
  try {
    expected.launcher=child.pid?identify(child.pid):null;
    if(!identity(expected.launcher))throw new Error('Supervisor launcher identity unavailable');
    synchronous(onPreparing,expected);
  } catch(error) {coordinationError=error.message;disconnect();}
  let readyRow=await bounded(ready,remainingStartup);
  if(readyRow===boundary) {
    protocolError='Supervisor startup deadline expired before launch authorization';
    disconnect();
    // Before authorization, the helper cannot start a test. Require actual close.
    try { child.kill(); } catch(error) { coordinationError??=error.message; }
  } else if(readyRow) {
    try {
      if(protocolError||coordinationError)throw new Error(protocolError??coordinationError);
      expected.helper=identity(readyRow.helper)?identify(readyRow.helper.pid):null;
      if(!same(readyRow.helper,expected.helper))throw new Error('Supervisor OS identity unavailable or mismatched');
      synchronous(onReady,expected);
      validatePreparedChild(prepared,{env,consumed:true});
      validateBindings([requestBinding]);
      authorizationAttempted=true; // a failed callback may already have persisted may-launch
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
  if(!authorized) {
    if(authorizationAttempted) {
      try {
        const proof=readTreeProof(expected,{identify,close});
        if(proof.root!==null||proof.status!=='not-run')throw new Error('Refused authorization lacks fresh no-launch proof');
        return {...expected,...proof,exitConfirmed:true,launchAuthorized:false,launcherClose:close,
          helperExitEvidence:{identity:expected.helper,observation:'original-identity-absent'},coordinationError,protocolError,diagnostics};
      } catch(error) {
        return {...expected,status:'unknown',exit:null,signal:null,exitConfirmed:false,launchAuthorized:false,
          launcherClose:close,helperExitEvidence:null,coordinationError,protocolError:error.message,diagnostics};
      }
    }
    const helper=expected.helper??(platform==='linux'?expected.launcher:null);
    let confirmed=false;
    try {
      const helperNow=identity(helper)?identify(helper.pid):undefined;
      const launcherNow=identity(expected.launcher)?identify(expected.launcher.pid):undefined;
      confirmed=helperNow===null&&launcherNow===null;
    } catch(error) {protocolError??=error.message;}
    return {...expected,status:confirmed?'not-run':'unknown',exit:null,signal:null,exitConfirmed:confirmed,
      launchAuthorized:false,launcherClose:close,helperExitEvidence:confirmed?{identity:helper,observation:'original-identity-absent'}:null,
      launchError,coordinationError,protocolError,diagnostics};
  }
  try {
    const proof=readTreeProof(expected,{identify,close});
    return {...expected,...proof,exitConfirmed:true,launchAuthorized:true,launcherClose:close,
      helperExitEvidence:{identity:expected.helper,observation:'original-identity-absent'},
      launchError:proof.launchError??launchError,coordinationError,protocolError,diagnostics};
  } catch(error) {
    return {...expected,status:'unknown',exit:null,signal:null,exitConfirmed:false,
      launchAuthorized:true,launcherClose:close,helperExitEvidence:null,coordinationError,protocolError:protocolError??error.message,diagnostics};
  }
}
