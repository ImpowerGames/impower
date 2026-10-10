import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {processIdentity} from './reviewer-slots.mjs';
import {readTreeProof,runOwnedChild} from './test-suite-child.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,'fixtures','test-suite-child-fixture.mjs');
const supported=['win32','linux'].includes(process.platform);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
    helper:{pid:800001,start:'helper'},root:{pid:800002,start:'root'}};
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
      const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,mode,inventory],
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
    const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,'loop',inventory],
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
    const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,'loop',inventory],
      cwd:directory,timeoutMs:1500,startupMs:timeout?1500:60000,
      reservationToken:randomUUID(),helperScript:script});
    assert.equal(result.launchAuthorized,false);
    assert.equal(result.status,'unknown');
    assert.equal(result.exitConfirmed,false);
    assert.equal(result.compilerTreeConfirmed,false);
    assert.equal(fs.readFileSync(path.join(directory,'test-suite-child-windows.exe'),'utf8'),'partial');
    assert.equal(records(inventory).length,0);
    assert.equal(fs.existsSync(path.join(directory,'tree-proof.json')),false);
  }
});

test('compile success without a fresh executable is refused before helper launch',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const directory=scratch(),script=path.join(directory,'compile.ps1');
  fs.writeFileSync(script,'exit 0');
  const result=await runOwnedChild({directory,command:process.execPath,args:[],cwd:directory,
    timeoutMs:1500,reservationToken:randomUUID(),helperScript:script});
  assert.equal(result.launchAuthorized,false);
  assert.equal(result.status,'not-run');
  assert.equal(result.exitConfirmed,true);
  assert.match(result.launchError,/ENOENT/);
});

test('helper independently refuses nonce after a stalled synchronous coordinator callback',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,'loop',inventory],
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
  const result=await runOwnedChild({directory,command:path.join(directory,'absent-executable'),args:[],
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
  await until(()=>processIdentity(expected.helper.pid)===null,15000);
  const proof=readTreeProof(expected);
  assert.equal(proof.status,'interrupted');
  assert.equal(proof.timedOut,false);
  assert.equal(records(inventory).length,3);
  absence(inventory);
});

test('async persistence callback refusal observes rejection and never authorizes launch',{skip:!supported,timeout:30000},async()=>{
  const directory=scratch(),inventory=path.join(directory,'pids.jsonl');
  const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,'loop',inventory],
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
  const result=await runOwnedChild({directory,command:process.execPath,args:[fixture,'detach',inventory],
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
  const run=runOwnedChild({directory,command:process.execPath,args:[fixture,'detach-held',inventory],
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
    control=spawn('python3',['-c',code,JSON.stringify([...records(inventory),helper])],{stdio:['pipe','pipe','pipe']});
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
