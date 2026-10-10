import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {processIdentity} from './reviewer-slots.mjs';
import {spawnDetached} from './detached-launch.mjs';
import {readTreeProof,runOwnedChild,prepareOwnedChild,prepareOwnedRuntime} from './test-suite-child.mjs';

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
function expectedProof() {
  const directory=scratch();
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

test('authorization refusal and startup timeout never start an engine',{skip:!supported,timeout:30000},async()=>{
  for(const startupTimeout of [false,true]) {
    const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
    const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
      cwd:directory,timeoutMs:1000,startupMs:startupTimeout?100:60000,
      reservationToken:randomUUID(),onAuthorize(){throw new Error('Durable authorization refused');}});
    const compileTimedOut=startupTimeout&&process.platform==='win32';
    assert.equal(result.status,compileTimedOut?'unknown':'not-run',JSON.stringify(result));
    assert.equal(result.exitConfirmed,!compileTimedOut);
    assert.equal(result.launchAuthorized,false);
    assert.equal(records(inventory).length,0);
  }
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

test('real C# compilation refusal and preparation deadline never enter reservation-stage launch',{skip:process.platform!=='win32',timeout:30000},async()=>{
  for(const deadline of [false,true]) {
    const directory=scratch(),script=path.join(directory,'test-suite-child-windows.ps1');
    fs.copyFileSync(path.join(here,'test-suite-child-windows.ps1'),script);
    const source=fs.readFileSync(path.join(here,'test-suite-child-windows.cs'),'utf8');
    const changed=deadline?source:source.replace('public static int Main(string[] args)','public static invalid syntax Main(string[] args)');
    if(!deadline)assert.notEqual(changed,source,'Real compiler refusal must mutate the C# syntax');
    fs.writeFileSync(path.join(directory,'test-suite-child-windows.cs'),changed);
    const result=await prepareOwnedRuntime({directory,helperScript:script,startupMs:deadline?100:60000});
    assert.equal(result.status,'unknown',JSON.stringify(result));assert.equal(result.launchAuthorized,false);
    assert.equal(result.compilerTreeConfirmed,false);assert.equal(result.preparationTimedOut,deadline);
    if(!deadline)assert.match(result.diagnostics,/Add-Type|Compiler|CS\d+/);
    assert.equal(fs.existsSync(path.join(directory,'child-request.json')),false);
    assert.equal(fs.existsSync(path.join(directory,'runtime.json')),false);
    assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
  }
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
  const runtime=await prepareOwnedRuntime({directory:runtimeDirectory,onPreparation(){preparations++;}});
  assert.equal(runtime.status,'prepared',JSON.stringify(runtime));
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
    const result=await prepareOwnedRuntime({directory,startupMs:stalled?3000:60000,helperScript:path.join(directory,'test-suite-child-windows.ps1')});
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
  const result=await controlOwned({directory,command:process.execPath,args:[fixture,'loop',inventory],
    cwd:directory,timeoutMs:1500,startupMs:3000,reservationToken:randomUUID(),onReady() {
      const until=Date.now()+4000;
      while(Date.now()<until) {} // Node timers cannot fire; helper must refuse itself.
    }});
  assert.equal(result.status,'not-run',JSON.stringify(result));
  assert.equal(result.exitConfirmed,true);
  assert.equal(result.root,null);
  assert.equal(result.tree.observation,'no-launch');
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

test('Windows inherited hidden console survives an ordinary console grandchild; same old flags reproduce visible control',
  {skip:process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true',timeout:90000},async t=>{
  const probeDirectory=scratch(),executable=path.join(probeDirectory,'visibility.exe');
  const source=[
    'using System; using System.IO; using System.Diagnostics; using System.Threading; using System.Runtime.InteropServices; using System.Web.Script.Serialization;',
    'public static class VisibilityFixture {',
    '[DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();',
    'delegate bool Visitor(IntPtr window,IntPtr argument);',
    '[DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor,IntPtr argument);',
    '[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);',
    '[DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);',
    'public static int Main(string[] args) {',
    'var json=new JavaScriptSerializer();',
    'if(args[0]=="record") { var process=Process.GetCurrentProcess(); File.WriteAllText(args[1],json.Serialize(new {pid=process.Id,start=process.StartTime.ToUniversalTime().Ticks.ToString(),handle=GetConsoleWindow().ToInt64()})); Thread.Sleep(15000); return 0; }',
    'long wanted=long.Parse(args[1]); bool observed=false;',
    'EnumWindows((window,argument)=>{if(window.ToInt64()==wanted)observed=true;return true;},IntPtr.Zero);',
    'Console.WriteLine(json.Serialize(new {observed,exists=IsWindow(new IntPtr(wanted)),visible=IsWindowVisible(new IntPtr(wanted))})); return 0;',
    '} }',
  ].join('\n');
  fs.writeFileSync(path.join(probeDirectory,'visibility.cs'),source);
  const build=path.join(probeDirectory,'build.ps1');
  fs.writeFileSync(build,[
    "$ErrorActionPreference='Stop'",
    'Add-Type -Path (Join-Path $PSScriptRoot "visibility.cs") -ReferencedAssemblies "System.Web.Extensions.dll" -OutputAssembly (Join-Path $PSScriptRoot "visibility.exe") -OutputType ConsoleApplication',
  ].join('\n'));
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',build],{windowsHide:true,timeout:60000});
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
