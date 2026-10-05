// Source-only adaptation of the previously audited local guard. NOT LAUNCH-AUTHORIZED.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const readinessPath = path.resolve(process.argv[2]);
const packet = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(process.argv[3], '--approved-run', 'A separately reviewed launch command is required');
assert.equal(hash(readinessPath), process.argv[4], 'Approved readiness hash mismatch');
assert.equal(hash(fileURLToPath(import.meta.url)), process.argv[5], 'Approved guard hash mismatch');
const normalize = value => String(value ?? '').replaceAll(String.fromCharCode(92), '/').toLowerCase();
for (const f of packet.privateFiles) assert.equal(hash(f.path), f.sha256, f.path);
assert.ok(!fs.existsSync(packet.output), 'Never overwrite/retry an existing attempt');
fs.mkdirSync(packet.output);
assert.equal(packet.capMs, 840000);
assert.equal(process.execPath.toLowerCase(), packet.node.toLowerCase());
const started = Date.now();
const report = { started: new Date(started).toISOString(), guardPid: process.pid, readinessSha256: hash(readinessPath), commands: [], census: [], audits: [], failures: [], releaseComplete: false };
const save = () => fs.writeFileSync(path.join(packet.output, 'guard.json'), JSON.stringify(report, null, 2));
const roots = new Map(); const owned = new Map(); const states = []; const seenPorts = new Set();
const identity = p => `${p.ProcessId}/${p.CreationDate}`;
const ps = "$p=@(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{Name=$_.Name;ProcessId=$_.ProcessId;ParentProcessId=$_.ParentProcessId;CreationDate=$_.CreationDate.ToUniversalTime().ToString('o');CommandLine=$_.CommandLine} }); $l=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess); [pscustomobject]@{processes=$p;listeners=$l;freeGiB=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB} | ConvertTo-Json -Depth 4";
async function rawCensus() {
  return new Promise((resolve, reject) => execFile('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8000000 }, (error, stdout) => {
    if (error) reject(error); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
  }));
}
async function census(label) {
  const data = await rawCensus(); const records = [];
  for (const state of states) {
    if (!fs.existsSync(state.path)) continue;
    const record = JSON.parse(fs.readFileSync(state.path, 'utf8')); records.push({ ...state, record });
    for (const port of [record.port, record.ports?.editor, record.ports?.player, record.ports?.hmr]) if (Number.isInteger(port)) seenPorts.add(port);
    const p = data.processes.find(p => p.ProcessId === record.pid);
    if (p && record.startedAt >= started && Date.parse(p.CreationDate) >= record.startedAt - 60000 && Date.parse(p.CreationDate) <= record.startedAt + 2000 && (state.kind !== 'web' || record.session === state.session)) owned.set(identity(p), p);
  }
  for (const p of data.processes) {
    const r = roots.get(p.ProcessId);
    if (r && !r.identity && Math.abs(Date.parse(p.CreationDate) - r.startedMs) < 2000) r.identity = identity(p);
    if (r?.identity === identity(p)) owned.set(identity(p), p);
    if (/chrom(e|ium)/i.test(p.Name) && packet.candidates.some(c => normalize(p.CommandLine).includes(normalize(c.profile))) && Date.parse(p.CreationDate) >= started) owned.set(identity(p), p);
  }
  let changed;
  do {
    changed = false;
    for (const p of data.processes) {
      if (owned.has(identity(p)) || p.ProcessId === process.pid) continue;
      const parent = data.processes.find(q => q.ProcessId === p.ParentProcessId && owned.has(identity(q)));
      if (parent && Date.parse(parent.CreationDate) <= Date.parse(p.CreationDate)) { owned.set(identity(p), p); changed = true; }
    }
  } while (changed);
  const remaining = data.processes.filter(p => owned.has(identity(p)));
  for (const listener of data.listeners) if (remaining.some(p => p.ProcessId === listener.OwningProcess)) seenPorts.add(listener.LocalPort);
  const unclassified = data.processes.filter(p => p.ProcessId !== process.pid && !owned.has(identity(p)) && Date.parse(p.CreationDate) >= started && packet.candidates.some(c => normalize(p.CommandLine).includes(normalize(c.root))));
  const result = { label, at: new Date().toISOString(), ...data, records, remaining, unclassified, relevantListeners: data.listeners.filter(l => seenPorts.has(l.LocalPort)) };
  report.census.push(result); report.roots = [...roots.entries()]; report.owned = [...owned.values()]; save(); return result;
}
let scanning;
function scan(label) { if (scanning) return scanning; scanning = census(label).finally(() => { scanning = undefined; }); return scanning; }
let cancelActiveStep;
let censusFailure;
function onCensusFailure(error) {
  censusFailure ??= error;
  report.failures.push({ census: error.stack ?? String(error) });
  report.ownershipUncertainty ??= [];
  report.ownershipUncertainty.push('A failed process scan left an ownership observation gap');
  save();
  cancelActiveStep?.(error);
}
async function killVerified(p, label, stillAllowed = () => true) {
  const current = await rawCensus();
  if (!stillAllowed()) return;
  if (!current.processes.some(q => identity(q) === identity(p))) return;
  assert.ok(owned.has(identity(p)), 'Refuse signalling unowned identity');
  await new Promise(resolve => execFile('taskkill', ['/PID', String(p.ProcessId), '/F'], { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
    report.commands.push({ label, action: 'verified-single-process-stop', identity: p, code: error?.code ?? 0, stdout, stderr }); save(); resolve();
  }));
}
async function run(c, label, args, maximumMs, cwd = c.root, cleanup = false) {
  if (censusFailure && !cleanup) throw censusFailure;
  const budget = cleanup ? maximumMs : Math.min(maximumMs, started + packet.capMs - 120000 - Date.now());
  assert.ok(budget > 0, 'Pair deadline reached; leave time for cleanup');
  const out = fs.openSync(path.join(packet.output, `${c.phase}-${label}.stdout.log`), 'wx');
  const err = fs.openSync(path.join(packet.output, `${c.phase}-${label}.stderr.log`), 'wx');
  const entry = { phase: c.phase, label, cwd, args, started: new Date().toISOString(), startedMs: Date.now(), budget };
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, IMPOWER_DRIVER_SESSION: c.session, IMPOWER_DRIVER_PROFILE: c.profile }, windowsHide: true, stdio: ['ignore', out, err] });
  entry.pid = child.pid; roots.set(child.pid, entry); report.commands.push(entry); save();
  console.log(JSON.stringify({ event: 'start', ...entry }));
  let timer;
  let cancel;
  const interrupted = new Promise(resolve => { cancel = error => resolve({ kind: 'census-failed', error }); });
  if (!cleanup) cancelActiveStep = cancel;
  const closed = new Promise(resolve => {
    child.once('error', error => {
      entry.spawnError = { message: error.message, code: error.code };
      save(); resolve({ kind: 'spawn-error', error });
    });
    child.once('exit', (code, signal) => {
      entry.actualExit = { code, signal, at: new Date().toISOString() };
      save();
    });
    child.once('close', (code, signal) => {
      Object.assign(entry, { code, signal, closed: new Date().toISOString() });
      save(); resolve({ kind: 'closed' });
    });
  });
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      entry.timedOut = true; save(); resolve({ kind: 'deadline' });
    }, budget);
  });
  scan(`start-${c.phase}-${label}`).catch(onCensusFailure);
  let outcome;
  try {
    outcome = await Promise.race([closed, interrupted, deadline]);
    if (outcome.kind !== 'closed') {
      entry.cancellation = { reason: outcome.kind, error: outcome.error?.message, at: new Date().toISOString() };
      let recoveryOpen = true;
      const recovery = cleanup ? Promise.resolve({ kind: 'deferred-to-final-owned-recovery' }) : (async () => {
        const current = await scan(`cancel-${label}`);
        if (!recoveryOpen) return { kind: 'recovery-expired' };
        const ownRoot = current.remaining.find(p => p.ProcessId === child.pid && roots.get(child.pid)?.identity === identity(p));
        if (ownRoot) await killVerified(ownRoot, `cancel-root-${label}`, () => recoveryOpen);
        else if (!entry.actualExit && !entry.spawnError) {
          report.ownershipUncertainty ??= [];
          report.ownershipUncertainty.push(`${label}: root identity was not observed and its exit is unconfirmed`);
        }
        return { kind: 'recovery-finished' };
      })().catch(error => ({ kind: 'recovery-failed', error: error.stack ?? String(error) }));
      let recoveryTimer;
      const recoveryDeadline = new Promise(resolve => { recoveryTimer = setTimeout(() => resolve({ kind: 'recovery-deadline' }), 30000); });
      entry.recovery = await Promise.race([recovery, recoveryDeadline]);
      recoveryOpen = false;
      clearTimeout(recoveryTimer);
      if (!['recovery-finished', 'deferred-to-final-owned-recovery'].includes(entry.recovery.kind)) {
        report.ownershipUncertainty ??= [];
        report.ownershipUncertainty.push(`${label}: ${entry.recovery.kind}`);
      }
      // A close event can remain pending after an exit or failed census.
      // One bounded grace is evidence collection, never a substitute for exit.
      let graceTimer;
      const grace = new Promise(resolve => { graceTimer = setTimeout(() => resolve({ kind: 'close-unconfirmed' }), 1000); });
      entry.closeAfterCancellation = (await Promise.race([closed, grace])).kind;
      clearTimeout(graceTimer);
      save();
    }
  } finally {
    clearTimeout(timer);
    if (cancelActiveStep === cancel) cancelActiveStep = undefined;
    fs.closeSync(out); fs.closeSync(err);
    // Late exit/close listeners remain attached and update the receipt. An
    // unconfirmed child must not prevent the outer supported-down cleanup.
    if (!entry.closed) child.unref();
    save();
  }
  console.log(JSON.stringify({ event: 'exit', ...entry }));
  assert.equal(outcome.kind, 'closed', `${c.phase}/${label} interrupted; enter supported-down cleanup without awaiting an unconfirmed close`);
  assert.equal(entry.code, 0, `${c.phase}/${label} nonzero actual exit; no retry`);
  assert.ok(!entry.timedOut, `${label} exceeded bounded step`);
}
function audit(c, label) {
  const git = args => execFileSync('git', args, { cwd: c.root, encoding: 'utf8', windowsHide: true }).trimEnd();
  assert.equal(git(['rev-parse', 'HEAD']), c.head);
  assert.equal(git(['status', '--porcelain=v1']), c.status, `${label} git status`);
  for (const f of [...c.files, ...c.extras, ...c.install.anchors]) assert.equal(hash(path.join(c.root, f.path)), f.sha256, `${label}: ${f.path}`);
  assert.deepEqual(fs.readdirSync(path.join(c.root, 'node_modules')).sort(), c.install.entries);
  assert.deepEqual(fs.readdirSync(path.join(c.root, 'node_modules/.bin')).sort(), c.install.bin);
  for (const [name, target] of Object.entries(c.install.links)) assert.equal(fs.realpathSync(path.join(c.root, 'node_modules/@impower', name)), target);
  for (const f of c.install.anchors) assert.equal(fs.realpathSync(path.join(c.root, f.path)), f.realpath);
  for (const f of packet.privateFiles) assert.equal(hash(f.path), f.sha256);
  report.audits.push({ phase: c.phase, label, at: new Date().toISOString(), files: c.files.length, passed: true }); save();
}
const hard = setTimeout(() => {
  report.failures.push('14-minute absolute cap; actual remaining resources uncertain, no release claim'); report.releaseComplete = false; report.finished = new Date().toISOString(); save(); process.exit(1);
}, packet.capMs);
let interval; let admitted = false;
try {
  for (const c of packet.candidates) {
    const { sessionDir } = await import(pathToFileURL(path.join(c.root, '.agents/skills/drive-web-editor/session-dir.mjs')));
    const env = { ...process.env, IMPOWER_DRIVER_SESSION: c.session, IMPOWER_DRIVER_PROFILE: c.profile };
    states.push({ path: path.join(sessionDir({ root: c.root, session: c.session, env }), 'state.json'), kind: 'web', session: c.session });
    states.push({ path: path.join(c.root, '.agents/skills/drive-vscode-web/.state.json'), kind: 'vscode' });
    for (const relative of ['.agents/skills/drive-web-editor/.state.json', '.agents/skills/resolve-issue/.state.json', '.claude/skills/drive-web-editor/.state.json', '.claude/skills/resolve-issue/.state.json', '.claude/skills/drive-vscode-web/.state.json']) assert.ok(!fs.existsSync(path.join(c.root, relative)), 'Legacy state requires separate recovery');
    assert.ok(!fs.existsSync(c.profile)); audit(c, 'before-pair');
  }
  assert.ok(states.every(s => !fs.existsSync(s.path)), 'Existing owned state requires separate recovery');
  const initial = await scan('before-pair');
  const preexisting = initial.processes.filter(p => p.ProcessId !== process.pid && packet.candidates.some(c => normalize(p.CommandLine).includes(normalize(c.root)) || normalize(p.CommandLine).includes(normalize(c.profile))));
  assert.deepEqual(preexisting, [], 'Candidate or profile is already in use');
  assert.ok(initial.freeGiB >= 2, 'Need at least 2 GiB free RAM');
  admitted = true;
  interval = setInterval(() => scan('periodic').catch(onCensusFailure), 3000);
  for (const c of packet.candidates) {
    const output = path.join(packet.output, c.phase);
    const configPath = path.join(packet.output, c.phase + '-config.json');
    const template = JSON.parse(fs.readFileSync(c.configTemplate, 'utf8'));
    assert.equal(template.expectedHead, c.head);
    assert.equal(path.resolve(template.repoRoot), path.resolve(c.root));
    const runtimeConfig = { ...template, deadlineMs: started + packet.capMs, output };
    if (c.phase === 'after') runtimeConfig.beforeReport = path.join(packet.output, 'before', 'report.json');
    fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2));
    report.configs ??= []; report.configs.push({ phase: c.phase, path: configPath, sha256: hash(configPath) }); save();
    await run(c, 'build-ls', [packet.npmCli, 'run', 'build:sparkdown-language-server'], 90000, path.join(c.root, 'vscode-sparkdown'));
    await run(c, 'build-pdf', [packet.npmCli, 'run', 'build:screenplay-pdf'], 90000, path.join(c.root, 'vscode-sparkdown'));
    await run(c, 'build-extension', ['scripts/esbuild.ts'], 90000, path.join(c.root, 'vscode-sparkdown'));
    const pdfSource = path.join(c.root, 'packages/sparkdown-screenplay-pdf/dist/sparkdown-screenplay-pdf.js');
    const pdfServed = path.join(c.root, 'vscode-sparkdown/out/workers/sparkdown-screenplay-pdf.js');
    assert.ok(fs.statSync(pdfSource).size > 0);
    assert.equal(hash(pdfSource), hash(pdfServed), 'Served PDF worker must match this candidate package build');
    report.workerArtifacts ??= []; report.workerArtifacts.push({ phase: c.phase, source: pdfSource, served: pdfServed, sha256: hash(pdfServed) }); save();
    await run(c, 'live-phase', [c.helper, configPath], 360000);
    const phaseReport = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(phaseReport.behaviorComplete, true);
    assert.equal(phaseReport.failure, undefined);
    assert.equal(phaseReport.supportedShutdownComplete, true);
    assert.equal(phaseReport.sourceFreezeUnchanged, true);
    assert.equal(phaseReport.screenshots.length, c.phase === 'before' ? 6 : 8);
    assert.deepEqual(phaseReport.observerProblems, []);
    assert.deepEqual(phaseReport.unadjudicatedConsoleErrors, []);
    assert.deepEqual(phaseReport.unadjudicatedPageErrors, []);
    assert.deepEqual(phaseReport.unadjudicatedWorkbenchErrors, []);
    assert.equal(hash(configPath), report.configs.at(-1).sha256);
    audit(c, 'after-candidate'); await scanning;
    const release = await scan(`after-${c.phase}`);
    assert.deepEqual(release.remaining, []); assert.deepEqual(release.unclassified, []); assert.deepEqual(release.relevantListeners, []);
    assert.ok(states.every(s => !fs.existsSync(s.path)), 'Before must fully release before after');
  }
} catch (error) { report.failures.push({ error: error.stack }); process.exitCode = 1; }
finally {
  clearInterval(interval); await scanning?.catch(() => {});
  for (const c of admitted ? packet.candidates : []) {
    for (const [kind, driver] of [['web', '.agents/skills/drive-web-editor/driver.mjs'], ['vscode', '.agents/skills/drive-vscode-web/driver.mjs']]) {
      try { await run(c, `final-${kind}-down`, [driver, 'down'], 15000, c.root, true); }
      catch (error) { report.failures.push({ cleanup: `${c.phase}/${kind}`, error: error.stack }); }
    }
  }
  try {
    await scanning; const current = await scan('after-supported-down');
    for (const p of current.remaining.sort((a, b) => Date.parse(b.CreationDate) - Date.parse(a.CreationDate))) {
      assert.ok(Date.now() < started + packet.capMs - 10000, 'Absolute deadline: release remains uncertain');
      await killVerified(p, 'remaining-owned-process');
    }
    const end = await census('final-release');
    for (const c of packet.candidates) audit(c, 'final');
    report.unconfirmedCommandExits = report.commands.filter(command => command.pid && (!command.actualExit || !command.closed));
    for (const config of report.configs ?? []) assert.equal(hash(config.path), config.sha256, 'Runtime phase config changed');
    report.releaseComplete = end.remaining.length === 0 && end.unclassified.length === 0 && end.relevantListeners.length === 0 && states.every(s => !fs.existsSync(s.path)) && report.unconfirmedCommandExits.length === 0 && (report.ownershipUncertainty ?? []).length === 0;
    assert.ok(report.releaseComplete, 'Uncertain resources retained for recovery');
  } catch (error) { report.failures.push({ final: error.stack }); }
  report.finished = new Date().toISOString(); report.elapsedMs = Date.now() - started;
  if (report.failures.length || !report.releaseComplete) process.exitCode = 1;
  report.exitCode = process.exitCode ?? 0; save(); clearTimeout(hard);
}
console.log(JSON.stringify({ guard: path.join(packet.output, 'guard.json'), releaseComplete: report.releaseComplete, exitCode: report.exitCode, failures: report.failures }));
