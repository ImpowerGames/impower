// SOURCE-ONLY proposal. Requires a separately audited hash and finite queue slot.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(process.argv[2], '--approved-qualification');
assert.equal(process.argv[3], hash(fileURLToPath(import.meta.url)), 'Exact harness approval required');
const guardPath = path.join(here, 'guard-prepared.mjs');
assert.equal(hash(guardPath), 'cb9bf014dbfeb15c14279ace84e99786c2135d95bf49387f8b18f7999a931857');
const helperPath = path.join(here, 'phase-helper.mjs');
assert.equal(hash(helperPath), 'b709d4ab966166acda9300b21d5e86deba3e9af3c658e842520d74078252502a');
assert.equal(hash(path.join(here, 'qualification-child.mjs')), '0f703fed373241cd529fda2a5d6446ad4942c9dbca5fe5cd94e39f9d8c1a8f52');
const output = path.join(here, 'qualification-attempt-1');
fs.mkdirSync(output);
const receipt = { started: new Date().toISOString(), guardSha256: hash(guardPath), helperSha256: hash(helperPath), harnessSha256: hash(fileURLToPath(import.meta.url)), fixtureSha256: hash(path.join(here, 'qualification-child.mjs')), cases: [], fixtureProcesses: [], releaseComplete: false };
const saveReceipt = () => fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
const source = fs.readFileSync(guardPath, 'utf8');
const start = source.indexOf('let cancelActiveStep;');
const end = source.indexOf('\nfunction audit(c, label)', start);
assert.ok(start >= 0 && end > start);
const extracted = source.slice(start, end);
fs.writeFileSync(path.join(output, 'exact-guard-fragment.js'), extracted);
receipt.extractedGuardSha256 = createHash('sha256').update(extracted).digest('hex');
const fixtureExits = [];
const recorderTimers = new Set();
const outer = setTimeout(() => { receipt.failure = '60-second qualification cap'; saveReceipt(); process.exit(1); }, 60000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const casePlans = [
  { name: 'normal', budget: 2000, lifetime: 30, success: true },
  { name: 'verified-timeout', budget: 50, lifetime: 400, signal: true },
  { name: 'withheld-close', budget: 300, lifetime: 30, hideClose: true },
  { name: 'unobserved-root', budget: 50, lifetime: 400, unobserved: true },
  { name: 'census-failure', budget: 2000, lifetime: 400, censusFailure: true },
  { name: 'late-recovery', budget: 50, lifetime: 400, lateRecovery: true },
  { name: 'cleanup-timeout', budget: 50, lifetime: 400, cleanup: true },
  { name: 'reused-pid', budget: 50, lifetime: 400, foreign: true },
];
try {
  for (const plan of casePlans) {
    const caseStart = Date.now();
    const report = { commands: [], failures: [] };
    const roots = new Map();
    const owned = new Map();
    const signals = [];
    const realProcesses = [];
    let currentIdentity;
    const identity = p => `${p.ProcessId}/${p.CreationDate}`;
    const save = () => fs.writeFileSync(path.join(output, plan.name + '.json'), JSON.stringify(report, null, 2));
    const wrappedSpawn = (...args) => {
      const real = spawn(...args);
      const child = new EventEmitter();
      child.pid = real.pid;
      child.unref = () => real.unref();
      const actual = { case: plan.name, pid: real.pid, started: new Date().toISOString() };
      receipt.fixtureProcesses.push(actual); realProcesses.push(actual);
      const exited = new Promise((resolve, reject) => {
        real.once('error', error => { actual.error = error.message; child.emit('error', error); reject(error); });
        real.once('exit', (code, signal) => { actual.exit = { code, signal, at: new Date().toISOString() }; child.emit('exit', code, signal); });
        real.once('close', (code, signal) => {
          actual.close = { code, signal, at: new Date().toISOString() };
          if (!plan.hideClose) child.emit('close', code, signal);
          resolve();
        });
      });
      fixtureExits.push(exited);
      exited.catch(() => {});
      currentIdentity = { ProcessId: real.pid, CreationDate: new Date().toISOString() };
      return child;
    };
    const scan = async label => {
      if (plan.censusFailure && label.startsWith('start-')) { await delay(30); throw new Error('Injected census failure'); }
      if (plan.lateRecovery && label.startsWith('cancel-')) await delay(250);
      if (!currentIdentity || plan.unobserved || realProcesses.at(-1)?.exit) return { remaining: [] };
      const root = roots.get(currentIdentity.ProcessId);
      root.identity = identity(currentIdentity); owned.set(root.identity, currentIdentity);
      return { remaining: [currentIdentity] };
    };
    const rawCensus = async () => ({ processes: realProcesses.at(-1)?.exit ? [] : plan.foreign ? [{ ...currentIdentity, CreationDate: 'foreign-reused-identity' }] : [currentIdentity] });
    const execFile = (program, args, options, callback) => {
      assert.equal(program, 'taskkill');
      assert.deepEqual(Array.from(args), ['/PID', String(currentIdentity.ProcessId), '/F']);
      signals.push({ program, args: Array.from(args), at: new Date().toISOString() });
      callback(null, 'Injected signal receipt only; finite child exits naturally.', '');
    };
    const mappedTimer = (fn, ms) => setTimeout(fn, plan.lateRecovery && ms === 30000 ? 80 : ms);
    const context = vm.createContext({ fs, path, assert, process, spawn: wrappedSpawn, execFile, rawCensus, scan, identity, roots, owned, report, save, console, started: Date.now(), packet: { output, capMs: 840000 }, setTimeout: mappedTimer, clearTimeout });
    vm.runInContext(extracted + '\nglobalThis.runExact = run;', context, { timeout: 1000 });
    let failure;
    try { await context.runExact({ root: here, phase: plan.name, session: 'qualification-only', profile: path.join(output, 'unused-profile') }, 'fixture', [path.join(here, 'qualification-child.mjs'), String(plan.lifetime)], plan.budget, here, Boolean(plan.cleanup)); }
    catch (error) { failure = error.message; }
    finally { report.cleanupSentinel = { reached: true, at: new Date().toISOString() }; save(); }
    await Promise.all(fixtureExits);
    if (plan.lateRecovery) await delay(300);
    assert.equal(Boolean(failure), !plan.success, plan.name);
    assert.equal(signals.length, plan.signal || plan.censusFailure ? 1 : 0, plan.name + ' signal count');
    assert.ok(realProcesses.every(p => p.exit?.code === 0 && p.close?.code === 0), 'Every real fixture must actually exit and close');
    assert.ok(Date.now() - caseStart < 5000, plan.name + ' case cap');
    const command = report.commands.find(c => c.pid);
    if (plan.hideClose) { assert.ok(command.actualExit); assert.equal(command.closed, undefined); assert.equal(command.closeAfterCancellation, 'close-unconfirmed'); }
    if (plan.censusFailure || plan.unobserved || plan.lateRecovery) assert.ok(report.ownershipUncertainty.length);
    if (plan.cleanup) { assert.equal(command.recovery.kind, 'deferred-to-final-owned-recovery'); assert.ok(Date.now() - caseStart < 2000); }
    if (plan.lateRecovery) assert.equal(command.recovery.kind, 'recovery-deadline');
    receipt.cases.push({ name: plan.name, passed: true, elapsedMs: Date.now() - caseStart, failure, signals, timerScale: plan.lateRecovery ? { productionRecoveryMs: 30000, qualificationRecoveryMs: 80, lateScanMs: 250 } : null }); saveReceipt();
  }
  const helper = fs.readFileSync(helperPath, 'utf8');
  const recorderStart = helper.indexOf('    let periodicCaptureFailure;');
  const recorderEnd = helper.indexOf('\n    try {\n    page.setDefaultTimeout', recorderStart);
  assert.ok(recorderStart >= 0 && recorderEnd > recorderStart);
  const recorder = helper.slice(recorderStart, recorderEnd);
  const preservationStart = helper.indexOf('      } catch (captureError)', recorderEnd);
  const preservationEnd = helper.indexOf('\n    }\n  });', preservationStart);
  assert.ok(preservationStart >= 0 && preservationEnd > preservationStart);
  const preservation = helper.slice(preservationStart, preservationEnd);
  const flushStart = helper.indexOf('        flushCollected("final-before-page-shutdown");', recorderEnd);
  const flushEnd = helper.indexOf('\n        assert.deepEqual(report.observerProblems', flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart);
  const finalFlush = helper.slice(flushStart, flushEnd);
  fs.writeFileSync(path.join(output, 'exact-recorder-fragment.js'), recorder);
  fs.writeFileSync(path.join(output, 'exact-final-preservation-fragment.js'), preservation);
  receipt.extractedRecorderSha256 = createHash('sha256').update(recorder).digest('hex');
  receipt.extractedPreservationSha256 = createHash('sha256').update(preservation).digest('hex');
  for (const injectFailure of [false, true]) {
    const recordOutput = path.join(output, injectFailure ? 'recorder-failure' : 'recorder-normal'); fs.mkdirSync(recordOutput);
    const report = { buffers: [{ label: 'initial' }] }; const consoleLines = ['initial'];
    const primary = injectFailure ? new Error('Existing primary callback failure') : undefined;
    const adaptedFs = Object.create(fs);
    if (injectFailure) adaptedFs.appendFileSync = () => { throw new Error('Injected evidence write failure'); };
    const timers = new Set();
    const context = vm.createContext({ fs: adaptedFs, path, output: recordOutput, report, consoleLines, save: () => fs.writeFileSync(path.join(recordOutput, 'report.json'), JSON.stringify(report)), console, setInterval: (fn, ms) => { const timer = setInterval(fn, ms); timers.add(timer); recorderTimers.add(timer); return timer; }, clearInterval: timer => { clearInterval(timer); timers.delete(timer); recorderTimers.delete(timer); } });
    vm.runInContext(recorder + '\nglobalThis.finishRecorder = (primary) => { let callbackFailure; let finalObservationFailure; try { if (primary) throw primary; } catch (error) { callbackFailure = error; throw error; } finally { clearInterval(periodicTimer); try {\n' + finalFlush + '\n' + preservation + '\n} };', context);
    await delay(1100); consoleLines.push('second'); report.buffers.push({ label: 'second' }); await delay(1100);
    let captureFailure;
    try { context.finishRecorder(primary); } catch (error) { captureFailure = error; }
    assert.equal(timers.size, 0);
    if (injectFailure) {
      assert.ok(report.periodicCaptureFailure); assert.equal(captureFailure, primary);
      assert.equal(report.finalCaptureFailure.originalFailurePreserved, true);
    } else {
      const snapshots = fs.readFileSync(path.join(recordOutput, 'console-observer-snapshots.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.ok(snapshots.length >= 3); assert.equal(snapshots[0].consoleLines.length, 1);
      assert.deepEqual(snapshots.at(-1).consoleLines, ['initial', 'second']); assert.equal(snapshots.at(-1).buffers.length, 2);
      assert.equal(snapshots.at(-1).label, 'final-before-page-shutdown');
    }
    receipt.cases.push({ name: injectFailure ? 'recorder-failure' : 'recorder-normal', passed: true, limitation: 'Host recorder and exact final error-preservation fragment only; no browser observer or application behavior.' }); saveReceipt();
  }
} catch (error) { receipt.failure = error.stack; process.exitCode = 1; }
finally {
  for (const timer of recorderTimers) clearInterval(timer);
  await Promise.allSettled(fixtureExits);
  const pids = receipt.fixtureProcesses.map(p => p.pid).filter(Number.isInteger);
  const ps = `$ids=@(${pids.join(',')}); @(Get-CimInstance Win32_Process | Where-Object { $ids -contains $_.ProcessId } | Select-Object ProcessId,CreationDate,CommandLine) | ConvertTo-Json -Depth 3 -Compress`;
  try {
    const census = execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    receipt.finalFixtureCensus = census ? JSON.parse(census) : [];
    receipt.releaseComplete = Array.isArray(receipt.finalFixtureCensus) && receipt.finalFixtureCensus.length === 0 && receipt.fixtureProcesses.every(p => p.exit && p.close);
  } catch (error) { receipt.releaseFailure = error.stack; }
  if (!receipt.releaseComplete) process.exitCode = 1;
  receipt.finished = new Date().toISOString(); receipt.exitCode = process.exitCode ?? 0; saveReceipt(); clearTimeout(outer);
}
console.log(JSON.stringify(receipt));
