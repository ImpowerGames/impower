import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {processIdentity} from './reviewer-slots.mjs';
import {spawnDetached} from './detached-launch.mjs';
import {readTreeProof,runOwnedChild,prepareOwnedChild,prepareOwnedRuntime,assertAttemptBinding} from './test-suite-child.mjs';
import {reservationState} from './test-suite-process.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,'fixtures','test-suite-child-fixture.mjs');
const supported=['win32','linux'].includes(process.platform);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const controlOwned=async request=>{
  const prepared=await prepareOwnedChild(request);
  return prepared.status==='prepared'?runOwnedChild({...request,prepared}):prepared;
};
// Preserve failed evidence; every test uses a private fresh attempt.
const scratch=()=>fs.mkdtempSync(path.join(os.tmpdir(),'test-suite-child-'));
test('Linux required children interface refuses before capability acknowledgement',{skip:process.platform!=='linux',timeout:40000},async()=>{
  const parent=scratch(),source=fs.readFileSync(path.join(here,'test-suite-child-linux.py'),'utf8');
  console.log('Linux children admission scratch: '+parent);
  const admission='    if child_pids():\n        raise RuntimeError("Fresh supervisor unexpectedly already owns children")';
  assert.ok(source.includes(admission),'Sensitivity removes only the reached children admission check');
  for(const kind of ['missing','unreadable','malformed','sensitivity']) {
    const directory=path.join(parent,kind);fs.mkdirSync(directory);
    const marker=path.join(directory,'interface-reached.json'),script=path.join(directory,'helper.py');
    const injection=kind==='unreadable'?'raise PermissionError(13, "Injected children interface unreadable", location)':
      kind==='malformed'?'return io.StringIO("invalid-pid")':'raise FileNotFoundError(2, "Injected children interface missing", location)';
    const prefix=`import builtins, io\n_original_open = builtins.open\ndef _interface_open(location, *args, **kwargs):\n    if location == f"/proc/{os.getpid()}/task/{os.getpid()}/children":\n        with _original_open(${JSON.stringify(marker)}, "w") as reached:\n            json.dump(dict(path=location, pid=os.getpid()), reached)\n        ${injection}\n    return _original_open(location, *args, **kwargs)\nbuiltins.open = _interface_open\n`;
    const body=kind==='sensitivity'?source.replace(admission,'    # Private no-fork sensitivity: omit only children admission.'):source;
    fs.writeFileSync(script,prefix+body);
    console.log(JSON.stringify({childrenSource:{kind,productionSha256:createHash('sha256').update(source).digest('hex'),
      helperSha256:createHash('sha256').update(prefix+body).digest('hex'),script}}));
    let acknowledged=false;
    const result=await prepareOwnedRuntime({directory,helperScript:script,startupMs:5000,cleanupMs:1000,
      onPreparation(){acknowledged=true;}});
    fs.writeFileSync(path.join(directory,'control-result.json'),JSON.stringify({kind,acknowledged,result},null,2));
    console.log(JSON.stringify({childrenAdmission:{kind,acknowledged,result}}));
    const disposition=JSON.parse(fs.readFileSync(path.join(directory,'preparation-result.json'),'utf8'));
    assert.ok(disposition.preparationClose,'Retain actual original capability-process close');
    assert.equal(disposition.preparationClose.signal,null);
    if(kind==='sensitivity') {
      // --check cannot fork even when the defective capability check succeeds.
      assert.equal(result.status,'prepared');assert.equal(acknowledged,true);
      assert.equal(disposition.preparationClose.exit,0);
      assert.equal(fs.existsSync(marker),false,'Original admission never reads the required interface');
      assert.throws(()=>assert.equal(result.status,'not-run'),/prepared/,'Same refusal assertion is RED without admission');
      console.log('RED sensitivity: missing children interface was admitted; no engine can launch in --check');
    } else {
      const reached=JSON.parse(fs.readFileSync(marker,'utf8'));
      assert.equal(reached.path,`/proc/${reached.pid}/task/${reached.pid}/children`);
      assert.equal(result.status,'not-run');assert.equal(result.exitConfirmed,true);
      assert.notEqual(disposition.preparationClose.exit,0);
      assert.equal(result.launchAuthorized,false);assert.equal(acknowledged,false);
      assert.match(result.diagnostics,kind==='malformed'?/Malformed required children interface/:/Injected children interface (?:missing|unreadable)/);
      assert.equal(processIdentity(reached.pid),null,'Original capability helper has actually exited');
      assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false,'No engine attempt authorized');
    }
  }
});
test('Windows proof publication fits an otherwise usable long attempt path',{skip:process.platform!=='win32',timeout:45000},async()=>{
  const parent=fs.realpathSync.native(scratch()),runtimeDirectory=path.join(parent,'runtime');fs.mkdirSync(runtimeDirectory);
  console.log('Windows proof path scratch: '+parent);
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,startupMs:10000,cleanupMs:1000});
  assert.equal(runtime.status,'prepared');
  for(const kind of ['short','long']) {
    const directory=path.join(parent,kind==='short'?'short':'x'.repeat(215-parent.length-1));fs.mkdirSync(directory);
    const prepared=await prepareOwnedChild({runtime,directory,command:process.execPath,
      args:['-e','console.log("finite-child-completed")'],cwd:parent,timeoutMs:3000,startupMs:5000,cleanupMs:1000});
    const result=await runOwnedChild({prepared,reservationToken:randomUUID()});
    console.log(JSON.stringify({proofPath:{kind,directory,requestLength:path.join(directory,'child-request.json').length,
      proofLength:path.join(directory,'tree-proof.json').length,result}}));
    assert.equal(fs.readFileSync(path.join(directory,'output.log'),'utf8').trim(),'finite-child-completed');
    assert.equal(result.exitConfirmed,true,'Completed native child needs authenticated proof at both usable paths');
    assert.equal(result.exit,0);assert.equal(readTreeProof(result,{close:result.launcherClose}).tree.empty,true);
  }
  const stale=path.join(parent,'stale');fs.mkdirSync(stale);
  const partial=path.join(stale,'tree-proof.tmp');fs.writeFileSync(partial,'retained partial proof',{flag:'wx'});
  const prepared=await prepareOwnedChild({runtime,directory:stale,command:process.execPath,
    args:['-e','console.log("finite-child-completed")'],cwd:parent,timeoutMs:3000,startupMs:5000,cleanupMs:1000});
  const refused=await runOwnedChild({prepared,reservationToken:randomUUID()});
  assert.equal(refused.status,'unknown');assert.equal(refused.exitConfirmed,false);
  assert.equal(fs.readFileSync(partial,'utf8'),'retained partial proof','Never overwrite an existing temporary proof');
  assert.equal(fs.existsSync(path.join(stale,'tree-proof.json')),false);
  assert.match(refused.diagnostics,/IOException/);
});
test('native output-log open refusal has authenticated no-launch proof',{skip:!supported,timeout:30000},async()=>{
  const runtimeDirectory=scratch(),directory=scratch(),marker=path.join(directory,'engine-marker');
  console.log('Native log refusal scratch: '+directory);
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,startupMs:10000,cleanupMs:1000});
  assert.equal(runtime.status,'prepared','Real preparation must reach the native log admission boundary');
  const prepared=await prepareOwnedChild({runtime,directory,attemptId:randomUUID(),command:process.execPath,
    args:['-e','require("node:fs").writeFileSync(process.argv[1],"started")',marker],cwd:directory,timeoutMs:2000});
  fs.mkdirSync(path.join(directory,'output.log'));
  let ready=false,authorized=false;
  const result=await runOwnedChild({prepared,reservationToken:randomUUID(),onReady:()=>{ready=true;},onAuthorize:()=>{authorized=true;}});
  console.log(JSON.stringify({nativeLogRefusal:{ready,authorized,result}}));
  assert.match(result.diagnostics,/Create output|(?:IsADirectoryError|FileExistsError):.*output\.log/,'Actual authored native log open failed');
  assert.equal(fs.existsSync(marker),false);
  assert.equal(result.exitConfirmed,true,'Native pre-root refusal must retain authenticated absence');
  const proof=readTreeProof(result,{close:result.launcherClose});
  assert.equal(proof.root,null);assert.equal(proof.status,'not-run');
  assert.equal(proof.tree.observation,'no-launch');assert.ok(proof.launchError);
  assert.equal(proof.interrupted,false,'Ordinary log refusal does not manufacture a disconnect');
  assert.equal(ready,true);assert.equal(authorized,true,'The already-bound helper owns the native setup refusal');
});
function records(file) {
  return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(row=>JSON.parse(row)):[];
}
async function until(predicate,ms=10000) {
  const end=Date.now()+ms;
  while(Date.now()<end) { if(predicate())return;await delay(25); }
  assert.fail('Fixture did not reach its bounded observable state');
}
function absence(file) {
  for(const row of records(file))assert.equal(processIdentity(row.pid),null,`Fixture PID ${row.pid} remained live`);
}
function expectedProof(directory=scratch()) {
  const requestedDirectory=directory;
  directory=fs.realpathSync.native(directory);
  if(directory!==requestedDirectory)console.log('Synthetic proof path alias: '+JSON.stringify({requestedDirectory,directory}));
  const expected={directory,proofFile:path.join(directory,'tree-proof.json'),platform:process.platform,
    attemptId:randomUUID(),reservationToken:randomUUID(),launchNonce:randomUUID(),
    helper:{pid:800001,start:'helper'},root:{pid:800002,start:'root'},
    launcher:process.platform==='linux'?{pid:800001,start:'helper'}:{pid:800003,start:'launcher'}};
  const proof={version:1,...expected,status:'exited',exit:0,signal:null,timedOut:false,interrupted:false,
    startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:01Z',
    tree:{mechanism:process.platform==='win32'?'windows-job':'linux-subreaper',empty:true,
      observation:process.platform==='win32'?'active-processes-zero':'ECHILD',activeProcesses:0,observedAt:'2026-01-01T00:00:01Z'}};
  return {expected,proof};
}

test('tree proof requires matching identities, terminal evidence, and actual helper exit',{skip:!supported},()=>{
  const {expected,proof}=expectedProof();
  const write=value=>fs.writeFileSync(expected.proofFile,JSON.stringify(value));
  write(proof);
  assert.equal(readTreeProof(expected,{identify:()=>null,close:{exit:0,signal:null}}).exit,0);
  assert.throws(()=>readTreeProof(expected,{identify:pid=>pid===expected.helper.pid?expected.helper:null}),/still running/);
  assert.throws(()=>readTreeProof({...expected,launcher:undefined},{identify:()=>null}),/launcher identity is missing/);
  assert.throws(()=>readTreeProof(expected,{identify:pid=>pid===expected.launcher.pid?expected.launcher:null}),/still running/);
  assert.throws(()=>readTreeProof(expected,{identify:pid=>pid===expected.launcher.pid?undefined:null}),/inspection is unknown/);
  assert.throws(()=>readTreeProof(expected,{identify:()=>undefined}),/inspection is unknown/);
  assert.throws(()=>readTreeProof(expected,{identify:()=>null,close:{exit:1,signal:null}}),/contradicts/);
  for(const replacement of [
    {...proof,reservationToken:randomUUID()},
    {...proof,tree:{...proof.tree,empty:false}},
    {...proof,exit:null},
    {...proof,root:null,status:'not-run',tree:{...proof.tree,observation:'no-launch'}},
  ]) { write(replacement);assert.throws(()=>readTreeProof(expected,{identify:()=>null})); }
});

test('enclosing attempt and reservation cannot borrow another valid proof',{skip:!supported},()=>{
  // Synthetic lifecycle unit control; actual native proof envelope controls
  // run separately through the installed public API fixtures.
  const run=fs.realpathSync.native(scratch()),id=randomUUID(),directory=path.join(run,id);
  fs.mkdirSync(directory);
  const {expected,proof}=expectedProof(directory);
  expected.attemptId=proof.attemptId=id;
  fs.writeFileSync(expected.proofFile,JSON.stringify(proof));
  const attempt={id:expected.attemptId,directory:expected.directory};
  assert.doesNotThrow(()=>assertAttemptBinding(expected,attempt));
  assert.throws(()=>assertAttemptBinding(expected,{...attempt,id:randomUUID()}),/enclosing attempt/);
  assert.throws(()=>assertAttemptBinding(expected,{...attempt,directory:path.join(expected.directory,'other')}),/enclosing attempt/);
  const record={version:2,run,owner:{pid:800004,start:'coordinator'},phase:'running',
    attempt:attempt.id,token:expected.reservationToken,supervision:expected};
  assert.equal(reservationState(record,()=>null),'interrupted');
  assert.equal(reservationState({...record,attempt:randomUUID()},()=>null),'unknown');
  assert.equal(reservationState({...record,run:path.join(run,'foreign-run')},()=>null),'unknown');
});

test('tree proof refuses a replaced physical attempt root',{skip:!supported},()=>{
  const repository=fs.realpathSync.native(scratch());
  console.log('Physical-root recovery scratch repository: '+repository);
  execFileSync('git',['init','--quiet',repository],{windowsHide:true});
  const directory=path.join(repository,'attempt'),copy=path.join(repository,'copied-attempt');
  fs.mkdirSync(directory);fs.mkdirSync(copy);
  const {expected,proof}=expectedProof(directory);
  fs.writeFileSync(expected.proofFile,JSON.stringify(proof));
  assert.equal(readTreeProof(expected,{identify:()=>null}).exit,0);
  fs.copyFileSync(expected.proofFile,path.join(copy,'tree-proof.json'));
  fs.renameSync(directory,path.join(repository,'original-attempt'));
  fs.symlinkSync(copy,directory,process.platform==='win32'?'junction':'dir');
  assert.equal(fs.realpathSync.native(directory),copy,'Exercise a real redirected attempt root');
  assert.throws(()=>readTreeProof(expected,{identify:()=>null}),/attempt directory changed/);
  // Preserve the complete scratch repository and junction. No link deletion.
});

test('native supervisor owns normal exits, timeouts, and fast detached descendants',{skip:!supported,timeout:120000},async()=>{
  const sentinelDirectory=scratch(),sentinelInventory=path.join(sentinelDirectory,'sentinel.jsonl');
  const sentinel=spawn(process.execPath,[fixture,'sentinel',sentinelInventory],{stdio:'ignore',windowsHide:true});
  await until(()=>records(sentinelInventory).length===1);
  const sentinelIdentity=processIdentity(sentinel.pid);
  try {
    for(const mode of ['exit0','exit7','loop','leak','detach']) {
      const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
      const result=await controlOwned({directory,command:process.execPath,args:[fixture,mode,inventory],
        cwd:directory,timeoutMs:1500,reservationToken:randomUUID()});
      assert.equal(result.exitConfirmed,true,JSON.stringify(result));
      assert.equal(result.status,['exit0','exit7'].includes(mode)?'exited':'timed-out',JSON.stringify(result));
      if(mode==='exit0'||mode==='exit7')assert.equal(result.exit,mode==='exit0'?0:7);
      if(mode==='leak'||mode==='detach')assert.equal(result.exit,0,'Root success survives descendant timeout');
      assert.equal(records(inventory).length,mode==='detach'?3:mode==='leak'?2:1);
      absence(inventory);
      assert.deepEqual(processIdentity(sentinel.pid),sentinelIdentity,'Unrelated exact PID/start sentinel survived');
    }
  } finally {
    const closed=new Promise(resolve=>sentinel.once('close',resolve));
    sentinel.kill();await closed;
  }
});

test('reached authorization refusal never starts an engine',{skip:!supported,timeout:30000},async()=>{
  // Late startup callbacks and definite prelaunch expiry have separate reached controls.
  const runtime=await prepareOwnedRuntime({directory:scratch(),startupMs:10000,cleanupMs:1000});
  assert.equal(runtime.status,'prepared',JSON.stringify(runtime));
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  let readyCalls=0,authorizationCalls=0,originals;
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
    cwd:directory,timeoutMs:1000,startupMs:60000,
    runtime,reservationToken:randomUUID(),
    onReady(value){readyCalls++;originals={launcher:value.launcher,helper:value.helper};},
    onAuthorize(){authorizationCalls++;throw new Error('Durable authorization refused');}});
  assert.equal(readyCalls,1,'Exercise validated helper readiness before the explicit refusal');
  assert.equal(authorizationCalls,1,'Exercise the explicit authorization refusal');
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.equal(result.launchAuthorized,false);
  assert.ok(result.launcherClose,'Original launcher actually closed');
  for(const name of ['launcher','helper']) {
    assert.ok(originals[name]?.start,'Capture original '+name+' identity');
    assert.deepEqual(result[name],originals[name]);
    assert.notDeepEqual(processIdentity(originals[name].pid),originals[name],'Original identity absent; PID reuse is allowed');
  }
  assert.equal(records(inventory).length,0);
});

test('compile failure/timeout retains partial output and never authorizes a helper',{skip:process.platform!=='win32',timeout:30000},async()=>{
  for(const timeout of [false,true]) {
    const directory=scratch(),inventory=path.join(directory,'pids.jsonl'),script=path.join(directory,'compile.ps1');
    fs.writeFileSync(script,[
      'param([string]$Configuration)',
      '[System.IO.File]::WriteAllText((Join-Path (Split-Path -Parent $Configuration) "test-suite-child-windows.exe"), "partial")',
      timeout?'Start-Sleep -Seconds 30':'exit 7',
    ].join('\n'));
    const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
      cwd:directory,timeoutMs:1500,startupMs:timeout?1500:60000,
      reservationToken:randomUUID(),helperScript:script});
    assert.equal(result.launchAuthorized,false);
    assert.equal(result.status,'unknown');
    assert.equal(result.exitConfirmed,false);
    assert.equal(result.compilerTreeConfirmed,false);
    assert.equal(fs.readFileSync(path.join(directory,'test-suite-child-windows.exe'),'utf8'),'partial');
    assert.equal(records(inventory).length,0);
    assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false,'No reservation-stage launch request after failed preparation');
  }
});

test('blocked preparation publication preserves live pipe-holder uncertainty',{skip:process.platform!=='win32',timeout:40000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl'),script=path.join(directory,'compile.ps1');
  fs.mkdirSync(path.join(directory,'preparation-result.json'));
  const literal=value=>"'"+value.replaceAll("'","''")+"'";
  fs.writeFileSync(script,[
    'param([string]$Configuration)',
    `$worker = Start-Process -FilePath ${literal(process.execPath)} -ArgumentList ${literal('"'+fixture+'"')}, 'sleep', ${literal('"'+inventory+'"')} -NoNewWindow -PassThru`,
    'Start-Sleep -Seconds 30',
  ].join('\n'));
  let owned;
  const running=prepareOwnedRuntime({directory,helperScript:script,startupMs:2000,cleanupMs:100});
  try {
    await until(()=>records(inventory).length===1,10000);owned=processIdentity(records(inventory)[0].pid);
    assert.ok(owned,'Pin the live bounded fixture identity');
    fs.writeFileSync(path.join(directory,'publication-fixture-identity.json'),JSON.stringify(owned),{flag:'wx'});
    const result=await running;
    fs.writeFileSync(path.join(directory,'publication-observation.json'),JSON.stringify({result,liveHolder:processIdentity(owned.pid)}),{flag:'wx'});
    assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.exitConfirmed,false);
    assert.equal(result.preparationClose,null,'Inherited pipe remains open beyond direct helper exit');
    assert.equal(processIdentity(result.preparationProcess.pid),null,'Original preparation process exited while its pipe holder remains live');
    assert.equal(typeof result.preparationPublicationError,'string');
    assert.deepEqual(processIdentity(owned.pid),owned,'Publication failure does not manufacture descendant exit');
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
  } finally {if(owned)await until(()=>processIdentity(owned.pid)===null,25000);}
});

test('blocked capability publication preserves live pipe-holder uncertainty',{skip:process.platform!=='win32',timeout:40000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl'),script=path.join(directory,'test-suite-child-windows.ps1');
  fs.mkdirSync(path.join(directory,'capability-result.json'));
  fs.copyFileSync(path.join(here,'test-suite-child-windows.ps1'),script);
  const source=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
  const marker='Event("{\\"event\\":\\"capable\\"}");';
  assert.ok(source.includes(marker));
  const child=`var fixtureChild=new Process();fixtureChild.StartInfo=new ProcessStartInfo(${JSON.stringify(process.execPath)});fixtureChild.StartInfo.UseShellExecute=false;fixtureChild.StartInfo.CreateNoWindow=true;fixtureChild.StartInfo.Arguments=Quote(${JSON.stringify(fixture)})+" sleep "+Quote(${JSON.stringify(inventory)});fixtureChild.Start();`;
  fs.writeFileSync(path.join(directory,'test-suite-child-windows.cs'),source.replace(marker,child+marker+'Thread.Sleep(30000);'));
  let owned;
  const running=prepareOwnedRuntime({directory,helperScript:script,startupMs:3000,cleanupMs:100});
  try {
    await until(()=>records(inventory).length===1,10000);owned=processIdentity(records(inventory)[0].pid);
    assert.ok(owned,'Pin the live bounded fixture identity');
    fs.writeFileSync(path.join(directory,'publication-fixture-identity.json'),JSON.stringify(owned),{flag:'wx'});
    const result=await running;
    fs.writeFileSync(path.join(directory,'publication-observation.json'),JSON.stringify({result,liveHolder:processIdentity(owned.pid)}),{flag:'wx'});
    assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.exitConfirmed,false);
    assert.equal(result.probeClose,null,'Inherited pipe remains open beyond direct helper exit');
    assert.equal(processIdentity(result.probeIdentity.pid),null,'Original capability process exited while its pipe holder remains live');
    assert.equal(typeof result.capabilityPublicationError,'string');
    assert.deepEqual(processIdentity(owned.pid),owned,'Publication failure does not manufacture descendant exit');
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
  } finally {if(owned)await until(()=>processIdentity(owned.pid)===null,25000);}
});

test('preparation deadline includes forced synchronous identity capture',{skip:process.platform!=='win32',timeout:15000},async()=>{
  const directory=scratch(),script=path.join(directory,'compile.ps1'),ack=path.join(directory,'compiler-observed.json');
  let identityCaptures=0,capturedOriginal;
  fs.writeFileSync(script,[
    'param([string]$Configuration)',
    '$acknowledgement = Join-Path (Split-Path -Parent $Configuration) "compiler-observed.json"',
    '$deadline = (Get-Date).AddSeconds(10)',
    'while (-not (Test-Path -LiteralPath $acknowledgement)) { if ((Get-Date) -gt $deadline) { exit 8 }; Start-Sleep -Milliseconds 20 }',
    'exit 0',
  ].join('\n'));
  const startupMs=5000;
  const result=await prepareOwnedRuntime({directory,helperScript:script,startupMs,cleanupMs:1000,
    identify(pid) {
      identityCaptures++;
      const original=capturedOriginal=processIdentity(pid);
      assert.ok(original?.start,'Capture the actual original compiler identity before delaying');
      // Deliberately exhaust the authored bound; the child waits on our ack.
      // This does not depend on compilation speed or ambient machine load.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,startupMs+100);
      return original;
    },onPreparation(value) {fs.writeFileSync(ack,JSON.stringify(value.preparationProcess));}});
  console.log('Forced identity deadline evidence: '+JSON.stringify({identityCaptures,result}));
  assert.equal(identityCaptures,1,'Exercise post-launch identity work rather than a prelaunch filesystem cutoff');
  assert.equal(result.status,'unknown');
  assert.equal(result.preparationTimedOut,true,'Elapsed startup must not restart after synchronous capture');
  assert.equal(result.compilerTreeConfirmed,false);
  assert.ok(result.preparationClose,'Await the original preparation child close');
  assert.deepEqual(result.preparationProcess,capturedOriginal);
  assert.notDeepEqual(processIdentity(capturedOriginal.pid),capturedOriginal,'Original compiler identity is absent after actual close');
  assert.equal(result.launchAuthorized,false);
  assert.equal(fs.existsSync(path.join(directory,'capability-request.json')),false);
  assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
});

for(const phase of ['ready','authorize'])test('attempt startup refuses late '+phase+' persistence',{skip:!supported,timeout:30000},async()=>{
  const runtimeDirectory=scratch();
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,startupMs:10000,cleanupMs:1000});
  assert.equal(runtime.status,'prepared',JSON.stringify(runtime));
    const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
    const prepared=await prepareOwnedChild({directory,runtime,command:process.execPath,args:[fixture,'exit0',inventory],
      cwd:directory,timeoutMs:2000,startupMs:3000,cleanupMs:1000});
    let readyCalls=0,authorizeCalls=0,expected;
    const result=await runOwnedChild({prepared,reservationToken:randomUUID(),
      onReady(value) {
        expected=value;readyCalls++;
        if(phase==='ready')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,3500);
      },onAuthorize(value) {
        expected={...value,mayLaunchPersisted:true};authorizeCalls++;
        if(phase==='authorize')Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,3500);
      }});
    console.log('Attempt callback deadline evidence: '+JSON.stringify({phase,readyCalls,authorizeCalls,result}));
    assert.equal(readyCalls,1,'Exercise the callback boundary, not earlier startup refusal');
    assert.equal(result.status,'not-run',JSON.stringify(result));
    assert.equal(result.exitConfirmed,true,JSON.stringify(result));
    assert.ok(result.launcherClose,'Original launcher actually closed');
    for(const original of [result.launcher,result.helper]) {
      assert.ok(original?.start);
      assert.notDeepEqual(processIdentity(original.pid),original,'Original identity absent; PID reuse is allowed');
    }
    assert.equal(records(inventory).length,0,'Late callbacks cannot authorize the engine');
    if(phase==='ready')assert.equal(authorizeCalls,0,'No may-launch callback after startup expiry');
    else {
      assert.equal(authorizeCalls,1);
      const proof=readTreeProof(expected,{close:result.launcherClose});
      assert.equal(proof.root,null,'Persisted may-launch needs fresh helper-owned no-launch proof');
      assert.equal(proof.status,'not-run');
    }
    assert.equal(result.launchAuthorized,false,'No nonce sent after callback consumed the deadline');
});

test('native final admission refuses an already queued nonce after a bounded setup pause',{skip:!supported,timeout:30000},async()=>{
  const runtimeDirectory=scratch();
  let script;
  if(process.platform==='win32') {
    script=path.join(runtimeDirectory,'test-suite-child-windows.ps1');
    fs.copyFileSync(path.join(here,'test-suite-child-windows.ps1'),script);
    const source=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
    const needle='      if(!authorizationRead.WaitOne(remaining)';
    assert.equal(source.split(needle).length,2);
    fs.writeFileSync(path.join(runtimeDirectory,'test-suite-child-windows.cs'),source.replace(needle,
      '      Event('+JSON.stringify(JSON.stringify({event:'fixture-admission-pause'}))+');\n      Thread.Sleep(3500); // Fixture pauses after calculating remaining.\n'+needle));
  } else {
    script=path.join(runtimeDirectory,'test-suite-child-linux.py');
    const source=fs.readFileSync(path.join(here,'test-suite-child-linux.py'),'utf8');
    const needle='    os.set_blocking(0, True)';
    assert.equal(source.split(needle).length,2);
    fs.writeFileSync(script,source.replace(needle,needle+'\n    emit("fixture-admission-pause")\n    time.sleep(3.5)  # Fixture pauses after exact authorization was read.'));
  }
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,helperScript:script,startupMs:10000,cleanupMs:1000});
  assert.equal(runtime.status,'prepared',JSON.stringify(runtime));
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const prepared=await prepareOwnedChild({directory,runtime,command:process.execPath,args:[fixture,'exit0',inventory],
    cwd:directory,timeoutMs:2000,startupMs:3000,cleanupMs:1000});
  let pauseReached=false;
  const result=await runOwnedChild({prepared,reservationToken:randomUUID(),onEvent(row) {if(row.event==='fixture-admission-pause')pauseReached=true;}});
  console.log('Native paused admission evidence: '+JSON.stringify({pauseReached,result}));
  assert.equal(pauseReached,true,'Exercise native paused setup, not an earlier refusal');
  assert.equal(result.launchAuthorized,true,'Coordinator sent the nonce within its own admission budget');
  assert.equal(result.exitConfirmed,true,JSON.stringify(result));
  assert.ok(result.launcherClose);
  for(const original of [result.launcher,result.helper]) {
    assert.ok(original?.start);assert.notDeepEqual(processIdentity(original.pid),original);
  }
  assert.equal(result.status,'not-run','Native setup cannot consume the deadline and still start an engine');
  assert.equal(result.root,null);
  assert.equal(records(inventory).length,0);
  assert.equal(readTreeProof(result,{close:result.launcherClose}).tree.observation,'no-launch');
});

test('real C# compilation refusal never enters reservation-stage launch',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=scratch(),script=path.join(directory,'test-suite-child-windows.ps1');
  fs.copyFileSync(path.join(here,'test-suite-child-windows.ps1'),script);
  const source=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
  const changed=source.replace('public static int Main(string[] args)','public static invalid syntax Main(string[] args)');
  assert.notEqual(changed,source,'Real compiler refusal must mutate the C# syntax');
  fs.writeFileSync(path.join(directory,'test-suite-child-windows.cs'),changed);
  const result=await prepareOwnedRuntime({directory,helperScript:script,startupMs:5000,cleanupMs:1000});
  console.log('Real compiler admission evidence: '+JSON.stringify({result}));
  assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.launchAuthorized,false);
  assert.equal(result.compilerTreeConfirmed,false);assert.equal(result.preparationTimedOut,false);
  assert.ok(result.preparationProcess?.start,'Retain the real original compiler identity');
  assert.deepEqual(result.preparationClose,{exit:1,signal:null});
  assert.notDeepEqual(processIdentity(result.preparationProcess.pid),result.preparationProcess);
  assert.match(result.diagnostics,/Add-Type|Compiler|CS\d+/);
  assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
  assert.equal(fs.existsSync(path.join(directory,'runtime.json')),false);
  assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
});

test('reached preparation deadline before launch is a confirmed no-process refusal',{skip:!supported,timeout:15000},async()=>{
  const directory=scratch(),request=path.join(fs.realpathSync.native(directory),'preparation-request.json');
  const originalWrite=fs.writeFileSync;
  let writeReached=false,lifecycleCalls=0,preparationCalls=0,result;
  try {
    fs.writeFileSync=function(file,...args) {
      const returned=originalWrite.call(this,file,...args);
      if(file===request) {
        writeReached=true;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
      }
      return returned;
    };
    result=await prepareOwnedRuntime({directory,startupMs:100,cleanupMs:1000,
      onLifecycle(){lifecycleCalls++;},onPreparation(){preparationCalls++;}});
  } finally {fs.writeFileSync=originalWrite;}
  console.log('Reached prelaunch deadline evidence: '+JSON.stringify({writeReached,lifecycleCalls,preparationCalls,result}));
  assert.equal(writeReached,true);assert.equal(lifecycleCalls,0);assert.equal(preparationCalls,0);
  assert.equal(result.status,'not-run');assert.equal(result.exitConfirmed,true);
  assert.equal(result.launchAuthorized,false);assert.equal(result.preparationTimedOut,true);
  assert.equal(result.launchError,'Preparation deadline expired before process launch');
  assert.equal(Object.hasOwn(result,'preparationProcess'),false);
  assert.equal(Object.hasOwn(result,'preparationClose'),false);
  for(const file of ['preparation-result.json','capability-request.json','runtime.json','child-request.json','tree-proof.json'])
    assert.equal(fs.existsSync(path.join(directory,file)),false,file+' cannot exist before process launch');
});

test('compile success without a fresh executable is refused before helper launch',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=scratch(),script=path.join(directory,'compile.ps1'),observed=path.join(directory,'compiler-observed.json');
  fs.writeFileSync(script,[
    'param([string]$Configuration)',
    '$acknowledgement = Join-Path (Split-Path -Parent $Configuration) "compiler-observed.json"',
    '$deadline = (Get-Date).AddSeconds(10)',
    'while (-not (Test-Path -LiteralPath $acknowledgement)) { if ((Get-Date) -gt $deadline) { exit 8 }; Start-Sleep -Milliseconds 20 }',
    'exit 0',
  ].join('\n'));
  const result=await controlOwned({directory,command:process.execPath,args:[],cwd:directory,
    timeoutMs:1500,reservationToken:randomUUID(),helperScript:script,onPreparation(value) {
      assert.deepEqual(processIdentity(value.preparationProcess.pid),value.preparationProcess);
      fs.writeFileSync(observed,JSON.stringify(value.preparationProcess),{flag:'wx'});
    }});
  assert.equal(result.launchAuthorized,false);
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.match(result.launchError,/ENOENT/);
});

test('one invocation prepares once; fresh attempts share immutable bytes but never authorization state',{skip:!supported,timeout:30000},async()=>{
  const runtimeDirectory=scratch();let preparations=0;
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,startupMs:10000,cleanupMs:1000,onPreparation(){preparations++;}});
  assert.equal(runtime.status,'prepared',JSON.stringify(runtime));
  for(const bounds of [{startupMs:99},{startupMs:60001},{cleanupMs:99},{cleanupMs:10001}]) {
    const directory=scratch();
    await assert.rejects(prepareOwnedChild({runtime,directory,command:process.execPath,args:[],cwd:directory,timeoutMs:1500,...bounds}),/startup\/cleanup bounds/);
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
  }
  const attempts=[];
  for(let index=0;index<2;index++) {
    const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
    const prepared=await prepareOwnedChild({runtime,directory,command:process.execPath,args:[fixture,'exit0',inventory],cwd:directory,timeoutMs:1500});
    const result=await runOwnedChild({prepared,reservationToken:randomUUID()});
    assert.equal(result.status,'exited',JSON.stringify(result));assert.equal(result.exitConfirmed,true);
    assert.equal(result.exit,0);absence(inventory);attempts.push(prepared);
    assert.equal(fs.existsSync(path.join(directory,'preparation-request.json')),false,'No later compilation/probe during reserved attempt');
    await assert.rejects(runOwnedChild({prepared,reservationToken:randomUUID()}),/already consumed/);
  }
  assert.equal(preparations,1);assert.equal(attempts[0].executable,attempts[1].executable);
  assert.notEqual(attempts[0].attemptId,attempts[1].attemptId);assert.notEqual(attempts[0].launchNonce,attempts[1].launchNonce);
  const manifest=path.join(runtimeDirectory,'runtime.json');
  fs.writeFileSync(manifest,JSON.stringify({...runtime,invocationId:randomUUID()}));
  await assert.rejects(prepareOwnedChild({runtime,directory:scratch(),command:process.execPath,args:[],cwd:runtimeDirectory,timeoutMs:1500}),/runtime descriptor changed/);
});

test('Windows capability failure/timeout stays outside reservation and cannot launch an engine',{skip:process.platform!=='win32',timeout:30000},async()=>{
  for(const stalled of [false,true]) {
    const directory=scratch(),source=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
    fs.copyFileSync(path.join(here,'test-suite-child-windows.ps1'),path.join(directory,'test-suite-child-windows.ps1'));
    const changed=stalled?source.replace('if(request.capabilityOnly) {','if(request.capabilityOnly) { Thread.Sleep(30000);')
      :source.replace('new UIntPtr(0x2000d)','new UIntPtr(0x200ff)');
    assert.notEqual(changed,source,'The negative control must change its intended capability path');
    fs.writeFileSync(path.join(directory,'test-suite-child-windows.cs'),changed);
    const result=await prepareOwnedRuntime({directory,startupMs:stalled?3000:5000,cleanupMs:1000,helperScript:path.join(directory,'test-suite-child-windows.ps1')});
    assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.launchAuthorized,false);
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
    assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
    assert.equal(fs.existsSync(path.join(directory,'runtime.json')),false);
    assert.equal(result.probeTimedOut,stalled);assert.equal(result.probeClose.signal,stalled?'SIGTERM':null);
    if(!stalled)assert.equal(result.probeClose.exit,1);
  }
});

test('changed prepared descriptor/environment and one-use replay refuse before helper launch',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const prepared=await prepareOwnedChild({directory,command:process.execPath,args:[fixture,'exit0',inventory],
    cwd:directory,timeoutMs:1500});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
  assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
  await assert.rejects(runOwnedChild({prepared:{...prepared,attemptId:randomUUID()},reservationToken:randomUUID()}),/descriptor changed/);
  await assert.rejects(runOwnedChild({prepared,reservationToken:randomUUID(),env:{...process.env,IMPOWER_PREPARED_CHANGE:'changed'}}),/binding is invalid/);
  const result=await runOwnedChild({prepared,reservationToken:randomUUID()});
  assert.equal(result.status,'exited',JSON.stringify(result));
  await assert.rejects(runOwnedChild({prepared,reservationToken:randomUUID()}),/already consumed/);
  absence(inventory);
});

test('changed prepared assembly is refused before helper launch',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=scratch();
  const prepared=await prepareOwnedChild({directory,command:process.execPath,args:[],cwd:directory,timeoutMs:1500});
  assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
  fs.appendFileSync(prepared.executable,'changed');
  await assert.rejects(runOwnedChild({prepared,reservationToken:randomUUID()}),/artifact changed/);
  assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
});

test('prepared binding is checked again after ready and before authorization',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const prepared=await prepareOwnedChild({directory,command:process.execPath,args:[fixture,'loop',inventory],
    cwd:directory,timeoutMs:1500});
  let authorized=false;
  const result=await runOwnedChild({prepared,reservationToken:randomUUID(),onReady() {
    fs.writeFileSync(path.join(directory,'prepared.json'),JSON.stringify({...prepared,attemptId:randomUUID()}));
  },onAuthorize(){authorized=true;}});
  assert.equal(authorized,false);
  assert.equal(result.launchAuthorized,false);
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.match(result.coordinationError,/descriptor changed/);
  assert.equal(records(inventory).length,0);
});

test('helper independently refuses nonce after a stalled synchronous coordinator callback',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  let readyCalls=0;
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
    cwd:directory,timeoutMs:1500,startupMs:3000,reservationToken:randomUUID(),onReady() {
      readyCalls++;
      const until=Date.now()+4000;
      while(Date.now()<until) {} // Node timers cannot fire; helper must refuse itself.
    }});
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.equal(readyCalls,1,'The synchronous callback actually stalled');
  assert.equal(result.launchAuthorized,false,'Coordinator never sends the expired nonce');
  const proof=readTreeProof(result,{close:result.launcherClose});
  assert.equal(proof.root,null);
  assert.equal(proof.tree.observation,'no-launch');
  for(const original of [result.launcher,result.helper])assert.notDeepEqual(processIdentity(original.pid),original);
  assert.equal(records(inventory).length,0);
});

test('exec refusal is explicit not-run with actual terminal ancestry',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch();
  const result=await controlOwned({directory,command:path.join(directory,'absent-executable'),args:[],
    cwd:directory,timeoutMs:1500,reservationToken:randomUUID()});
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.equal(typeof result.launchError,'string');
});

test('actual coordinator death closes both pipes and leaves independently recoverable proof',{skip:!supported,timeout:40000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const coordinator=spawn(process.execPath,[fixture,'coordinator-death',inventory],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let diagnostics='';
  coordinator.stderr.setEncoding('utf8');
  coordinator.stderr.on('data',chunk=>{diagnostics+=chunk;});
  const exit=await new Promise(resolve=>coordinator.once('close',resolve));
  fs.writeFileSync(path.join(directory,'coordinator-stderr.log'),diagnostics);
  assert.equal(exit,29,diagnostics);
  const expected=JSON.parse(fs.readFileSync(path.join(directory,'expected.json'),'utf8'));
  await until(()=>processIdentity(expected.helper.pid)===null&&processIdentity(expected.launcher.pid)===null,15000);
  const proof=readTreeProof(expected);
  assert.equal(proof.status,'interrupted');
  assert.equal(proof.timedOut,false);
  assert.equal(records(inventory).length,3);
  absence(inventory);
});

test('Linux coordinator process-group death leaves the independently detached subreaper to prove exit',{skip:process.platform!=='linux',timeout:40000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const coordinator=spawnDetached(process.execPath,[fixture,'coordinator-held',inventory],{stdio:['ignore','ignore','pipe']});
  const close=new Promise(resolve=>coordinator.once('close',(exit,signal)=>resolve({exit,signal})));
  let diagnostics='';coordinator.stderr.setEncoding('utf8');coordinator.stderr.on('data',chunk=>{diagnostics+=chunk;});
  const coordinatorIdentity=processIdentity(coordinator.pid);
  let expected;
  try {
    await until(()=>records(inventory).length===3&&fs.existsSync(path.join(directory,'expected.json')),10000);
    expected=JSON.parse(fs.readFileSync(path.join(directory,'expected.json'),'utf8'));
    const stat=fs.readFileSync(`/proc/${expected.helper.pid}/stat`,'utf8');
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
    assert.equal(Number(fields[2]),expected.helper.pid,'Supervisor owns a separate process group');
    assert.notEqual(expected.helper.pid,coordinator.pid);
    assert.deepEqual(processIdentity(coordinator.pid),coordinatorIdentity,'Kill only the still-owned fixture group');
    process.kill(-coordinator.pid,'SIGKILL');
    assert.deepEqual(await close,{exit:null,signal:'SIGKILL'});
    await until(()=>processIdentity(expected.helper.pid)===null&&processIdentity(expected.launcher.pid)===null,15000);
    assert.equal(readTreeProof(expected).status,'interrupted');absence(inventory);
  } finally {
    if(coordinator.exitCode===null&&coordinator.signalCode===null)coordinator.kill('SIGKILL');
    await close;
    if(expected)await until(()=>processIdentity(expected.helper.pid)===null,15000);
    fs.writeFileSync(path.join(directory,'coordinator-stderr.log'),diagnostics);
  }
});

test('partially persisted authorization requires fresh proof even when no nonce was sent',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],cwd:directory,
    timeoutMs:1500,reservationToken:randomUUID(),onAuthorize(expected) {
      fs.writeFileSync(path.join(directory,'may-launch.json'),JSON.stringify(expected),{flag:'wx'});
      assert.deepEqual(processIdentity(expected.helper.pid),expected.helper);
      process.kill(expected.helper.pid,'SIGKILL');
      throw new Error('Persistence failed after may-launch was written');
    }});
  assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.exitConfirmed,false);
  assert.equal(result.launchAuthorized,false);assert.equal(records(inventory).length,0);
  assert.equal(fs.existsSync(path.join(directory,'may-launch.json')),true);
  assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
  assert.equal(processIdentity(result.helper.pid),null);assert.equal(processIdentity(result.launcher.pid),null);
});

test('async persistence callback refusal observes rejection and never authorizes launch',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
    cwd:directory,timeoutMs:1500,reservationToken:randomUUID(),
    onAuthorize(){return Promise.reject(new Error('Asynchronous journal failure'));}});
  assert.equal(result.launchAuthorized,false);
  assert.equal(result.exitConfirmed,true);
  assert.match(result.coordinationError,/synchronously/);
  assert.equal(records(inventory).length,0);
});

test('helper death after authorization never substitutes for a final proof',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  let helper;
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'detach',inventory],
    cwd:directory,timeoutMs:15000,reservationToken:randomUUID(),onReady(value){helper=value.helper;},
    onStarted() {
      const watch=setInterval(()=>{
        if(records(inventory).length===3) {
          clearInterval(watch);
          process.kill(helper.pid,'SIGKILL');
        }
      },10);
    }});
  assert.equal(result.status,'unknown',JSON.stringify(result));
  assert.equal(result.exitConfirmed,false);
  assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
  await until(()=>records(inventory).every(row=>processIdentity(row.pid)===null));
  absence(inventory);
});

test('Linux helper loss is unknown; fixture cleanup uses pre-pinned exact identities',{skip:process.platform!=='linux',timeout:40000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  let helper,control,controlClose,controlError='',trigger;
  const began=new Promise(resolve=>{trigger=resolve;});
  const run=controlOwned({directory,command:process.execPath,args:[fixture,'detach-held',inventory],
    cwd:directory,timeoutMs:20000,reservationToken:randomUUID(),onReady(value){helper=value.helper;},onStarted(){trigger();}});
  await began;
  await until(()=>records(inventory).length===3);
  // This fixture-only sibling pins known stable processes before helper loss.
  // It is not a process-tree containment implementation or recovery proof.
  const code=[
    'import json,os,select,signal,sys,time',
    'rows=json.loads(sys.argv[1]); handles=[]',
    'def start(pid):',
    '    stat=open(f"/proc/{pid}/stat").read(); fields=stat[stat.rfind(")")+2:].split()',
    '    return open("/proc/sys/kernel/random/boot_id").read().strip()+":"+fields[19]',
    'def pin(row):',
    '    fd=os.pidfd_open(row["pid"])',
    '    try:',
    '        assert start(row["pid"])==row["start"], "fixture identity changed"',
    '        info=open(f"/proc/self/fdinfo/{fd}").read()',
    '        assert int(next(line for line in info.splitlines() if line.startswith("Pid:")).split()[1])==row["pid"], "pinned identity already exited"',
    '        signal.pidfd_send_signal(fd,0)',
    '        return fd',
    '    except BaseException:',
    '        os.close(fd); raise',
    'try:',
    '    for row in rows[:-1]: handles.append(pin(row))',
    '    helper=pin(rows[-1])',
    '    try: signal.pidfd_send_signal(helper,signal.SIGKILL)',
    '    finally: os.close(helper)',
    '    print("helper-killed",flush=True)',
    '    sys.stdin.readline()',
    'finally:',
    '    for fd in handles:',
    '        try: signal.pidfd_send_signal(fd,signal.SIGKILL)',
    '        except ProcessLookupError: pass',
    '    deadline=time.monotonic()+10',
    '    for fd in handles:',
    '        assert select.select([fd],[],[],max(0,deadline-time.monotonic()))[0], "fixture exit unconfirmed"',
    '        os.close(fd)',
  ].join('\n');
  try {
    control=spawn('python3',['-c',code,JSON.stringify([...records(inventory),helper])],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    control.stderr.setEncoding('utf8');control.stderr.on('data',chunk=>{controlError+=chunk;});
    controlClose=new Promise(resolve=>control.once('close',resolve));
    const result=await run;
    assert.equal(result.status,'unknown',JSON.stringify(result));
    assert.equal(result.exitConfirmed,false);
    assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
  } finally {
    if(control){control.stdin.end('cleanup\n');assert.equal(await controlClose,0,controlError);}
  }
  absence(inventory);
});

function compileVisibilityFixture() {
  const probeDirectory=scratch(),executable=path.join(probeDirectory,'visibility.exe');
  const source=[
    'using System; using System.IO; using System.Text; using System.Diagnostics; using System.Threading; using System.Runtime.InteropServices; using System.Web.Script.Serialization;',
    'public static class VisibilityFixture {',
    '[DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();',
    'delegate bool Visitor(IntPtr window,IntPtr argument);',
    '[DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor,IntPtr argument);',
    '[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);',
    '[DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);',
    '[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int cb; public string reserved,desktop,title; public int x,y,width,height,charsX,charsY,fill,flags; public short show,reservedSize; public IntPtr reservedBytes,input,output,error; }',
    '[StructLayout(LayoutKind.Sequential)] struct Child { public IntPtr process,thread; public int pid,tid; }',
    '[DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,int flags,IntPtr environment,string cwd,ref Startup startup,out Child child);',
    '[DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);',
    '[DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);',
    '[DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);',
    '[DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long creation,out long exit,out long kernel,out long user);',
    '[DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);',
    'public class Observation { public bool observed,exists,visible; }',
    'static Observation Observe(long wanted) { bool observed=false; EnumWindows((window,argument)=>{if(window.ToInt64()==wanted)observed=true;return true;},IntPtr.Zero); return new Observation {observed=observed,exists=IsWindow(new IntPtr(wanted)),visible=IsWindowVisible(new IntPtr(wanted))}; }',
    'public static int Main(string[] args) {',
    'var json=new JavaScriptSerializer();',
    'if(args[0]=="record") { var process=Process.GetCurrentProcess(); var temporary=args[1]+".tmp"; File.WriteAllText(temporary,json.Serialize(new {pid=process.Id,start=process.StartTime.ToUniversalTime().Ticks.ToString(),handle=GetConsoleWindow().ToInt64()})); File.Move(temporary,args[1]); Thread.Sleep(15000); return 0; }',
    'if(args[0]=="calibrate") {',
    'var startup=new Startup {cb=Marshal.SizeOf(typeof(Startup)),flags=1,show=5}; Child child;',
    'var executable=Process.GetCurrentProcess().MainModule.FileName; var quote=((char)34).ToString();',
    'var command=new StringBuilder(quote+executable+quote+" record "+quote+args[1]+quote);',
    'if(!CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,false,16,IntPtr.Zero,null,ref startup,out child))throw new Exception("Visible control create failed: "+Marshal.GetLastWin32Error());',
    'object marker=null; Observation observation=null; uint exitCode=259;',
    'try {',
    'var deadline=Stopwatch.StartNew(); while(!File.Exists(args[1])&&deadline.ElapsedMilliseconds<5000)Thread.Sleep(25);',
    'if(!File.Exists(args[1]))throw new Exception("Visible control marker missing");',
    'var row=json.DeserializeObject(File.ReadAllText(args[1])) as System.Collections.Generic.Dictionary<string,object>;',
    'long creation,exited,kernel,user;',
    'if(Convert.ToInt32(row["pid"])!=child.pid||!GetProcessTimes(child.process,out creation,out exited,out kernel,out user)||DateTime.FromFileTimeUtc(creation).Ticks.ToString()!=Convert.ToString(row["start"])||WaitForSingleObject(child.process,0)!=258)throw new Exception("Visible control identity/execution changed");',
    'marker=row; var settle=Stopwatch.StartNew();',
    'do {',
    'if(WaitForSingleObject(child.process,0)!=258)throw new Exception("Visible control exited before observation");',
    'observation=Observe(Convert.ToInt64(row["handle"])); if(observation.exists&&observation.observed&&observation.visible)break;',
    'Thread.Sleep(25);',
    '} while(settle.ElapsedMilliseconds<2000);',
    '} finally {',
    'try {',
    'if(WaitForSingleObject(child.process,0)==258&&!TerminateProcess(child.process,0))throw new Exception("Visible control termination refused");',
    'if(WaitForSingleObject(child.process,5000)!=0||!GetExitCodeProcess(child.process,out exitCode)||exitCode==259)throw new Exception("Visible control actual exit unconfirmed");',
    '} finally {CloseHandle(child.thread);CloseHandle(child.process);}',
    '}',
    'Console.WriteLine(json.Serialize(new {marker,observation,childExitConfirmed=true,exitCode})); return 0;',
    '}',
    'Console.WriteLine(json.Serialize(Observe(long.Parse(args[1])))); return 0;',
    '} }',
  ].join('\n');
  fs.writeFileSync(path.join(probeDirectory,'visibility.cs'),source);
  const build=path.join(probeDirectory,'build.ps1');
  fs.writeFileSync(build,[
    "$ErrorActionPreference='Stop'",
    'Add-Type -Path (Join-Path $PSScriptRoot "visibility.cs") -ReferencedAssemblies "System.Web.Extensions.dll" -OutputAssembly (Join-Path $PSScriptRoot "visibility.exe") -OutputType ConsoleApplication',
  ].join('\n'));
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',build],{windowsHide:true,timeout:60000});
  return {probeDirectory,executable};
}

test('Windows visibility fixture compiles without launching a console control',{skip:process.platform!=='win32',timeout:70000},()=>{
  const {executable}=compileVisibilityFixture();
  assert.equal(fs.readFileSync(executable).subarray(0,2).toString('ascii'),'MZ');
});

test('Windows CI visibility observer calibrates with a retained native visible-child handle',
  {skip:process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true',timeout:80000},async t=>{
  const {probeDirectory,executable}=compileVisibilityFixture();
  const markerFile=path.join(probeDirectory,'calibration-marker.json');
  const result=JSON.parse(execFileSync(executable,['calibrate',markerFile],{windowsHide:true,encoding:'utf8',timeout:20000}));
  fs.writeFileSync(path.join(probeDirectory,'calibration-observation.json'),JSON.stringify(result));
  console.log('Independent CI visible observer calibration: '+JSON.stringify(result));
  assert.equal(result.childExitConfirmed,true,'Retained native child handle must reach actual exit');
  const original={pid:result.marker.pid,start:result.marker.start},current=processIdentity(original.pid);
  assert.ok(current===null||current&&Number.isSafeInteger(current.pid)&&typeof current.start==='string','Inspect original calibration identity independently');
  assert.notDeepEqual(current,original,'The original calibration child has exited; numeric PID reuse is allowed');
  if(!result.observation.exists||!result.observation.observed||!result.observation.visible) {
    t.skip('Hosted desktop cannot observe the explicit visible control; visibility remains unverified');return;
  }
  assert.ok(result.marker.handle!==0);
  assert.deepEqual(result.observation,{observed:true,exists:true,visible:true});
});

test('Windows inherited hidden console survives an ordinary console grandchild; same old flags reproduce visible control',
  {skip:process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true',timeout:90000},async t=>{
  const {executable}=compileVisibilityFixture();
  const observations=[];
  for(const control of [true,false]) {
    const directory=scratch(),inventory=path.join(directory,'pids.jsonl'),windows=path.join(directory,'window.json');
    let helperScript;
    if(control) {
      helperScript=path.join(directory,'test-suite-child-windows.ps1');
      fs.writeFileSync(helperScript,fs.readFileSync(path.join(here,'test-suite-child-windows.ps1'),'utf8'));
      const helperSource=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
      const current='true,0x00080000,IntPtr.Zero,cwd';
      assert.ok(helperSource.includes(current),'Visibility control must replace the actual process flags');
      fs.writeFileSync(path.join(directory,'test-suite-child-windows.cs'),helperSource.replace(current,'true,0x08080000,IntPtr.Zero,cwd'));
    }
    const prepared=await prepareOwnedChild({directory,command:process.execPath,
      args:[fixture,'console-grandchild',inventory,executable,windows],cwd:directory,timeoutMs:6000,helperScript});
    assert.equal(prepared.status,'prepared',JSON.stringify(prepared));
    const running=runOwnedChild({prepared,reservationToken:randomUUID()});
    let observed;
    try {
      await until(()=>fs.existsSync(windows),5000);
      const marker=JSON.parse(fs.readFileSync(windows,'utf8'));
      assert.deepEqual(processIdentity(marker.pid),{pid:marker.pid,start:marker.start},'Observe the actual still-live grandchild');
      const visibility=JSON.parse(execFileSync(executable,['inspect',String(marker.handle)],
        {windowsHide:true,encoding:'utf8',timeout:10000}));
      observed={control,marker,...visibility};
      observations.push(observed);
      fs.writeFileSync(path.join(directory,'visibility-observation.json'),JSON.stringify(observed));
    } finally {
      const result=await running;
      assert.equal(result.status,'timed-out',JSON.stringify(result));
      assert.equal(result.exitConfirmed,true);
      absence(inventory);
    }
  }
  console.log('Windows console visibility observations: '+JSON.stringify(observations));
  const [before,after]=observations;
  if(!before.exists||!before.observed||!before.visible) {
    console.log('SKIP: hosted Windows desktop could not observe the deliberately visible old-flags console control');
    t.skip('Visibility remains unverified because the positive control was not observable');return;
  }
  const hidden=value=>assert.equal(value.visible,false,'Ordinary console grandchild must inherit a hidden console');
  assert.throws(()=>hidden(before),/inherit a hidden console/,'Same hidden-console assertion is red with old flags');
  assert.ok(after.exists&&after.observed,'New hidden console must still be an observable actual window');
  hidden(after);
});
