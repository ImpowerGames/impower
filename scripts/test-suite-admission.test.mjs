// agent-tooling-timeout-ms: 600000
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquire, acquireWaiting, waitForUnit, runPool, slotFile, slotFiles, admissionFloorMb, admissionSlots, poolSlotLimit,
  foreignVitestProcesses, windowsVitestProcesses, vitestProcesses, freeMemoryMb, processIdentity, read, withProbeCleanupGuard } from "./test-suite-process.mjs";
import { main } from "./test-suite.mjs";
import { removeProbeCheckouts } from "./reviewer-probe-cleanup.mjs";
import { canonicalPath } from "./test-suite-identity.mjs";
import * as processApi from "./test-suite-process.mjs";
import * as suiteApi from "./test-suite.mjs";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

const coordinator = await import("./fixtures/test-suite-coordinator-adapter.mjs");
delete process.env.IMPOWER_TEST_POOL;
const scratch = canonicalPath(fs.mkdtempSync(path.join(os.tmpdir(), "impower-admission-")));
console.log(`Admission scratch: ${scratch}`);
const store = path.join(scratch, "store");
const owner = processIdentity(process.pid);
assert.ok(owner, "this process has an identity");
const live = { root: store, identify: pid => pid === owner.pid ? owner : null, census: () => [], memory: () => 8192 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const { recoverReservations, releaseDiagnostic } = processApi;
const { tolerateClosedOutput } = suiteApi;
{
  const root = path.join(scratch, "unknown-reservation");fs.mkdirSync(root);
  acquire("identity warmup", { ...live, root }).release();
  const file = slotFile(root, 2), token = "75937960-789a-4906-9fc3-7da9fd21a0a2";
  const unknown = { version: 2, token, owner: { pid: 800004, start: "dead" }, phase: "launching", run: "missing-proof" };
  const bytes = JSON.stringify(unknown);fs.writeFileSync(file, bytes);
  const waits = [], began = Date.now();
  await assert.rejects(acquireWaiting("bounded unknown", { ...live, root, waitMs: 80, pollMs: 10,
    onWait: row => waits.push(row) }), /recover-reservation.*waited.*Test Suite workflow/);
  assert.ok(Date.now() - began >= 80);
  assert.ok(waits.length > 0);assert.equal(waits[0].waiting, "unknown reservation");
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  assert.throws(() => recoverReservations({ ...live, root }), /Recovery refused.*unknown/);
  assert.equal(fs.readFileSync(file, "utf8"), bytes);
  const completed = { ...unknown, phase: "reserved" };fs.writeFileSync(file, JSON.stringify(completed));
  assert.throws(() => recoverReservations({ ...live, root, census: () => [123] }), /Vitest processes still present/);
  assert.equal(read(file).token, token);
  assert.equal(await main(["recover-reservation"], { ...live, root }), 0);
  assert.equal(fs.existsSync(file), false);
  assert.equal(read(path.join(root, `recovered-${token}.json`)).token, token);
  const archive = path.join(root, `recovered-${token}.json`), archiveBytes = fs.readFileSync(archive, "utf8");
  fs.writeFileSync(file, JSON.stringify(completed));
  recoverReservations({ ...live, root });
  assert.equal(fs.readFileSync(archive, "utf8"), archiveBytes, "Interrupted archive/remove finishes without replacing the original archive");
  fs.writeFileSync(file, JSON.stringify({ ...completed, exit: 1 }));
  assert.throws(() => recoverReservations({ ...live, root }), /archive differs/);
  assert.equal(read(file).exit, 1);assert.equal(fs.readFileSync(archive, "utf8"), archiveBytes);
  fs.unlinkSync(file);
  assert.deepEqual(recoverReservations({ ...live, root }), []);
  await assert.rejects(main(["recover-reservation", "unexpected"], { ...live, root }), /takes no arguments/);
  fs.writeFileSync(file, JSON.stringify(unknown));
  const reservation = await acquireWaiting("unknown resolves", { ...live, root, waitMs: 1000, pollMs: 10,
    onWait: () => fs.writeFileSync(file, JSON.stringify(completed)) });
  reservation.release();
  const fake = { file, record: { token } }, error = new Error("guard busy");
  assert.match(releaseDiagnostic(fake, error), /slot is absent/);
  fs.writeFileSync(file, JSON.stringify(completed));
  assert.match(releaseDiagnostic(fake, error), /slot still holds this token.*recover-reservation/);
  fs.writeFileSync(file, JSON.stringify({ token: "replacement" }));
  assert.match(releaseDiagnostic(fake, error), /another token; preserve it/);
  assert.equal(read(file).token, "replacement");
  fs.writeFileSync(file, "{");
  assert.match(releaseDiagnostic(fake, error), /slot state unavailable/);
  console.log("PASS: unknown reservations wait within their bound, guarded recovery preserves records, and release diagnostics name actual slot state");
}
{
  const stream = new EventEmitter();tolerateClosedOutput(stream);
  stream.emit("error", Object.assign(new Error("closed reader"), { code: "EPIPE" }));
  assert.throws(() => stream.emit("error", new Error("unrelated output fault")), /unrelated output fault/);
  const marker = path.join(scratch, "broken-output-finished");
  fs.writeFileSync(marker, "pending");
  const source = `import fs from 'node:fs';import {tolerateClosedOutput} from ${JSON.stringify(new URL("./test-suite.mjs", import.meta.url).href)};
tolerateClosedOutput();tolerateClosedOutput(process.stderr);console.log('reader may close');setTimeout(()=>{for(let n=0;n<100;n++){console.log('later output');console.error('later diagnostic');}setTimeout(()=>fs.writeFileSync(process.argv[1],'released'),50);},100);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source, marker], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";child.stderr.on("data", chunk => { diagnostics += chunk; });
  child.stdout.once("data", () => { child.stdout.destroy();child.stderr.destroy(); });
  const exit = await new Promise((resolve, reject) => { child.once("error", reject);child.once("close", (code, signal) => resolve({ code, signal })); });
  assert.deepEqual(exit, { code: 0, signal: null }, diagnostics);
  assert.equal(fs.readFileSync(marker, "utf8"), "released");
  console.log("PASS: an early-closing stdout reader cannot interrupt later cleanup");
}
{
  const root = path.join(scratch, "partial-record");
  fs.mkdirSync(root);
  const file = slotFile(root, 2);
  const bytes = '{"progress":';
  fs.writeFileSync(file, bytes);
  const waits = [];
  const reservation = await acquireWaiting("partial read", { ...live, root, waitMs: 10000, pollMs: 10, onWait: row => {
    waits.push(row);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
    assert.equal(fs.existsSync(slotFile(root, 1)), false, "unreadable evidence cannot admit into an empty slot");
    fs.unlinkSync(file);
  } });
  assert.equal(waits.length, 1, "a partial reservation is retried instead of refused");
  assert.equal(waits[0].waiting, "reservation record");
  assert.ok(waits[0].detail.includes(file), "the diagnostic names the unreadable file");
  reservation.release();

  for (const waitMs of [0, 80]) {
    fs.writeFileSync(file, bytes);
    const began = Date.now();
    let attempts = 0;
    await assert.rejects(acquireWaiting("permanent malformed record", { ...live, root, waitMs, pollMs: 10,
      onWait: () => { attempts++; } }), error => {
      assert.ok(error.message.includes(file));
      assert.match(error.message, /retry.*safe/i);
      assert.match(error.message, /Test Suite workflow/);
      return true;
    });
    assert.ok(Date.now() - began >= waitMs, "permanent damage consumes the bounded wait");
    assert.equal(attempts > 0, waitMs > 0);
    assert.equal(fs.readFileSync(file, "utf8"), bytes, "malformed evidence stays intact");
    assert.equal(fs.existsSync(slotFile(root, 1)), false);
    assert.equal(fs.existsSync(path.join(root, "guard.json")), false);
  }
  fs.unlinkSync(file);
  let attempts = 0;
  await assert.rejects(acquireWaiting("unrelated parse failure", { ...live, root, waitMs: 80,
    memory: () => { throw new SyntaxError("memory transport parse failure"); }, onWait: () => { attempts++; } }), /memory transport parse failure/);
  assert.equal(attempts, 0, "unrelated parse errors are not admission retries");
  console.log("PASS: partial reservation reads retry conservatively within the deadline and retain actionable refusal evidence");
}
const waitingRows = () => fs.readdirSync(store).filter(name => name.startsWith("waiting-"));
const until = async (condition, what, ms = 15000) => {
  for (const deadline = Date.now() + ms; !condition();) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(10);
  }
};

assert.equal(admissionFloorMb, 4096, "the floor is one run's worst case with headroom");
assert.equal(admissionSlots, 3);
assert.equal(poolSlotLimit, 2);

{
  const probeClone = path.join(scratch, "impower.review-jobs", "pr-1", "round-1", "codex", "clone", "packages", "sparkdown");
  assert.equal(runPool({ env: {} }), "writer", "an unmarked run is a writer run");
  assert.equal(runPool({ env: { IMPOWER_TEST_POOL: "writer" } }), "writer");
  assert.equal(runPool({ env: { IMPOWER_TEST_POOL: "reviewer" } }), "reviewer", "the launcher's variable names the reviewer pool");
  assert.equal(runPool({ env: {}, directory: probeClone }), "reviewer", "a package under a review-jobs directory is a probe clone");
  assert.equal(runPool({ env: { IMPOWER_TEST_POOL: "writer" }, directory: probeClone }), "reviewer", "a probe clone is a reviewer run whatever the variable says");
  assert.equal(runPool({ env: {}, directory: path.join(scratch, "review-jobs-notes", "pkg") }), "writer", "only a segment ending in .review-jobs marks a probe clone");
  assert.throws(() => runPool({ env: { IMPOWER_TEST_POOL: "both" } }), /must be writer or reviewer, not "both"/);
  assert.throws(() => runPool({ env: { IMPOWER_TEST_POOL: "" } }), /must be writer or reviewer/);
  console.log("PASS: a run's pool comes from IMPOWER_TEST_POOL or a review-jobs package path, writer otherwise");
}

{
  const rows = [
    { pid: 40, parent: 1, created: 100, command: "node scripts/test-suite.mjs run pkg a.test.ts" },
    { pid: 9, parent: 40, created: 110, command: "powershell test-suite-child-windows.ps1 launches vitest", node: false },
    { pid: 10, parent: 9, created: 120, command: "node suite-engine.mjs run-direct pkg vitest.json a.test.ts" },
    { pid: 11, parent: 10, created: 130, command: "node tinypool worker" },
    { pid: 12, parent: 11, created: 140, command: "node tinypool worker" },
    { pid: 20, parent: 2, created: 50, command: "node node_modules/vitest/vitest.mjs run" },
    { pid: 30, parent: 31, created: 60, command: "node tinypool orphan" }, { pid: 31, parent: 30, created: 61, command: "node tinypool orphan" },
    { pid: 50, parent: 9, created: 105, command: "node node_modules/vitest/vitest.mjs run --stale-parent" },
    { pid: 51, parent: 9, created: NaN, command: "node node_modules/vitest/vitest.mjs run --unknown-age" },
  ];
  assert.deepEqual(foreignVitestProcesses(rows, 99, { accounted: new Set([40]) }), [20, 30, 31, 50, 51], "the engine and its forks reach their coordinator through a supervisor that is not Node; a direct Vitest call, a cyclic orphan pair, a process older than its recorded parent and one of unknown age are foreign");
  assert.deepEqual(foreignVitestProcesses(rows, 99, { accounted: new Set([10]) }), [20, 30, 31, 50, 51], "a holder's engine pid also accounts for its forks, though admission never trusts one");
  assert.deepEqual(foreignVitestProcesses(rows, 99, { accounted: new Set() }), [10, 11, 12, 20, 30, 31, 50, 51], "with no holder every Vitest process is foreign, and the supervisor is never a candidate");
  assert.deepEqual(foreignVitestProcesses(rows, 20, { accounted: new Set([40]) }), [30, 31, 50, 51], "the census never counts the asking process");
  assert.deepEqual(foreignVitestProcesses(rows, 99, { accounted: new Set([40]), within: "orphan" }), [30, 31], "within narrows to command lines naming the path");
  const raw = JSON.stringify([{ ProcessId: 0, ParentProcessId: 0, Name: "System Idle Process", CommandLine: null, Created: null }, { ProcessId: 40, ParentProcessId: 1, Name: "node.exe", CommandLine: "node scripts/test-suite.mjs", Created: 1000 },
    { ProcessId: 9, ParentProcessId: 40, Name: "powershell.exe", CommandLine: "powershell helper vitest", Created: 1100 }, { ProcessId: 10, ParentProcessId: 9, Name: "node.exe", CommandLine: "node vitest", Created: 1200 },
    { ProcessId: 11, ParentProcessId: 10, Name: "node.exe", CommandLine: "node tinypool", Created: 1300 }, { ProcessId: 12, ParentProcessId: null, Name: "node.exe", CommandLine: null, Created: 1400 },
    { ProcessId: 50, ParentProcessId: 9, Name: "node.exe", CommandLine: "node vitest run", Created: 1050 }]);
  assert.deepEqual(windowsVitestProcesses(raw, 99, { accounted: new Set([40]) }), [12, 50], "the Windows census carries every process's parent and creation time through; a Node process whose command line cannot be read, and one older than its recorded parent, stay foreign");
  assert.deepEqual(windowsVitestProcesses(raw, 99, { accounted: new Set() }), [10, 11, 12, 50]);
  assert.throws(() => windowsVitestProcesses(JSON.stringify([{ ProcessId: 10, ParentProcessId: "x", CommandLine: "node vitest" }]), 99), /Malformed/);
  assert.throws(() => windowsVitestProcesses(JSON.stringify([{ ProcessId: 10, ParentProcessId: 1, CommandLine: "node vitest", Created: "yesterday" }]), 99), /Malformed/);
  const real = vitestProcesses({ accounted: new Set() });
  assert.ok(Array.isArray(real), "the real census answers");
  const reading = freeMemoryMb();
  assert.ok(Number.isSafeInteger(reading) && reading > 0, "the real free-memory reading is a positive whole number of MB");
  console.log(JSON.stringify({ realCensus: real.length, freeMemoryMb: reading }));
  console.log("PASS: the census accounts for a holder's own processes through their ancestry and reads the machine otherwise");
}

{
  const first = acquire("first", { ...live, pool: "writer" });
  assert.equal(first.slot, 1); assert.equal(first.file, slotFile(store, 1)); assert.equal(path.basename(first.file), "reservation.json");
  assert.equal(read(first.file).pool, "writer"); assert.equal(read(first.file).slot, 1);
  const second = acquire("second", { ...live, pool: "reviewer" });
  assert.equal(second.slot, 2, "a second run is admitted while memory is above the floor");
  const third = acquire("third", { ...live, pool: "writer" });
  assert.equal(third.slot, 3, "and a third");
  assert.throws(() => acquire("fourth", { ...live, pool: "reviewer" }), error => error.waitable === "reservation" && error.holders.length === 3 && /Existing suite running in every slot \(3 of 3\)/.test(error.message), "a fourth waits on the cap");
  second.release();
  assert.throws(() => acquire("third writer", { ...live, pool: "writer" }), error => error.waitable === "pool slots" && /writer pool holds its 2 slots/.test(error.message), "one pool never holds all three slots");
  const reviewer = acquire("reviewer into the free slot", { ...live, pool: "reviewer" });
  assert.equal(reviewer.slot, 2, "the slot the pool limit keeps free is reachable by the other pool");
  reviewer.release();
  assert.throws(() => acquire("low memory", { ...live, pool: "reviewer", memory: () => admissionFloorMb - 1 }), error => error.waitable === "memory" && error.freeMb === 4095 && /4095 MB is below the 4096 MB floor/.test(error.message), "a reading below the floor refuses admission");
  const atFloor = acquire("at the floor", { ...live, pool: "reviewer", memory: () => admissionFloorMb });
  assert.equal(atFloor.slot, 2, "a reading at the floor admits");
  atFloor.release();
  assert.throws(() => acquire("unreadable", { ...live, pool: "reviewer", memory: () => { throw new Error("CIM query failed"); } }), /CIM query failed/, "a reading that cannot be taken refuses");
  assert.throws(() => acquire("not a number", { ...live, pool: "reviewer", memory: () => NaN }), /Free memory reading unavailable/);
  assert.equal(fs.existsSync(slotFile(store, 2)), false, "nothing was admitted");
  const rows = [];
  await assert.rejects(waitForUnit(first, { ...live, memory: () => 1000, deadline: Date.now() + 3000, pollMs: 20, onWait: row => rows.push(row) }), /1000 MB is below the 4096 MB floor/, "a unit waits while the reading is below the floor and ends at the deadline");
  assert.ok(rows.length > 0 && rows.every(row => row.waiting === "memory" && row.freeMb === 1000 && row.floorMb === 4096), "unit waits report the reading");
  assert.equal(read(first.file).token, first.record.token, "the holder was not evicted");
  assert.deepEqual(await waitForUnit(first, { ...live, deadline: Date.now() + 300 }), { freeMb: 8192 }, "the unit proceeds once memory returns");
  first.update({ phase: "running", child: { pid: 777, start: "engine" } });
  const seen = [];
  assert.deepEqual(await waitForUnit(third, { ...live, deadline: Date.now() + 100, pollMs: 20, census: ({ accounted }) => { seen.push([...accounted].sort()); return accounted.has(777) ? [777] : []; } }), { freeMb: 8192 });
  assert.ok(seen.length > 0 && seen.every(pids => pids.includes(owner.pid) && !pids.includes(777)), `the holders' coordinators are accounted for and the recorded engine pid is not: ${JSON.stringify(seen)}`);
  fs.writeFileSync(slotFile(store, 2), JSON.stringify({ version: 2, token: "dead-peer", owner: { pid: 4000003, start: "gone" }, run: "dead peer", pool: "reviewer", slot: 2, heldSince: new Date().toISOString(), heldUptime: 1, phase: "running", child: { pid: 4000004, start: "orphan" } }));
  const peers = [];
  await assert.rejects(waitForUnit(third, { ...live, deadline: Date.now() + 1500, pollMs: 20, census: ({ accounted }) => { peers.push([...accounted]); return accounted.has(4000003) ? [] : [4000004]; } }), /still present: 4000004/, "a dead peer's orphan is foreign at the unit gate");
  assert.ok(peers.every(pids => !pids.includes(4000003)));
  fs.unlinkSync(slotFile(store, 2));
  first.update({ phase: "exited", child: null });
  assert.throws(() => acquire("beside a foreign process", { ...live, pool: "reviewer", census: () => [4242] }), error => error.waitable === "vitest processes" && /already running: 4242/.test(error.message), "a Vitest process outside every holder's ancestry blocks admission");
  const accountedCensus = acquire("beside the holders' own processes", { ...live, pool: "reviewer", census: ({ accounted }) => accounted.has(owner.pid) ? [] : [owner.pid] });
  assert.equal(accountedCensus.slot, 2, "a holder's own child does not block admission");
  accountedCensus.release();
  assert.throws(() => acquire("first", { ...live, pool: "reviewer" }), error => error.waitable === "reservation" && /Existing suite running for first; inspect/.test(error.message), "the same run directory is refused while its coordinator holds a slot");
  fs.writeFileSync(path.join(store, "waiting-left-behind.json"), JSON.stringify({ token: "left-behind", owner, pool: "writer", run: "first", arrivedAt: "2020-01-01T00:00:00.000Z" }));
  const unqueued = acquire("not queued behind a holder's stale row", { ...live, pool: "reviewer" });
  assert.equal(unqueued.slot, 2, "a holder's leftover row holds no place in the queue");
  assert.equal(fs.existsSync(path.join(store, "waiting-left-behind.json")), false, "and is removed");
  unqueued.release();
  const resumer = { pid: 4000010, start: "resume" };
  const withResumer = { ...live, identify: pid => pid === owner.pid ? owner : pid === resumer.pid ? resumer : null };
  fs.writeFileSync(path.join(store, "waiting-resume-of-first.json"), JSON.stringify({ token: "resume-of-first", owner: resumer, pool: "reviewer", run: "first", arrivedAt: "2020-01-01T00:00:00.000Z" }));
  const beside = acquire("admitted beside an ineligible resume waiter", { ...withResumer, pool: "reviewer" });
  assert.equal(beside.record.run, "admitted beside an ineligible resume waiter", "the resume waiter does not hold the queue");
  assert.ok(fs.existsSync(path.join(store, "waiting-resume-of-first.json")), "and keeps its row");
  beside.release();
  fs.unlinkSync(path.join(store, "waiting-resume-of-first.json"));
  fs.writeFileSync(path.join(store, "guard.json"), JSON.stringify({ owner }));
  const gated = Date.now();
  await assert.rejects(waitForUnit(first, { ...live, deadline: Date.now() + 100, pollMs: 20 }), /Reservation transaction unavailable/, "a held guard past the unit's deadline refuses");
  const gateElapsed = Date.now() - gated;
  fs.unlinkSync(path.join(store, "guard.json"));
  assert.ok(gateElapsed < 2500, `the unit gate gives up at its deadline, not after a whole guard wait (${gateElapsed} ms)`);
  third.release();
  const orphanToken = "orphaned-supervised", orphanAttempt = "0f6b1a2c-3d4e-4f50-8a9b-c0d1e2f3a4b5", orphanRun = path.join(scratch, "orphaned-run");
  const supervisorIdentity = { launcher: { pid: 4000020, start: "supervisor" }, helper: { pid: 4000021, start: "supervisor" } };
  fs.writeFileSync(slotFile(store, 2), JSON.stringify({ version: 2, token: orphanToken, owner: { pid: 4000011, start: "dead-coordinator" }, run: orphanRun, pool: "reviewer", slot: 2,
    heldSince: new Date().toISOString(), heldUptime: os.uptime(), phase: "running", attempt: orphanAttempt, child: { pid: 4000012, start: "engine" },
    supervision: { reservationToken: orphanToken, attemptId: orphanAttempt, directory: path.join(orphanRun, orphanAttempt), ...supervisorIdentity } }));
  const recycled = { pid: 4000011, start: "direct-vitest" };
  const orphanLive = { ...live, identify: pid => pid === owner.pid ? owner : pid === 4000011 ? recycled : pid === 4000020 || pid === 4000021 ? { pid, start: "supervisor" } : pid === 4000012 ? { pid: 4000012, start: "engine" } : null };
  const exempt = [];
  const recycledCensus = ({ accounted }) => { exempt.push([...accounted].sort()); return accounted.has(4000011) ? [] : [4000011]; };
  assert.throws(() => acquire("beside a recycled coordinator pid", { ...orphanLive, pool: "writer", census: recycledCensus }), error => error.waitable === "vitest processes" && /already running: 4000011/.test(error.message), "admission refuses the recycled pid as foreign");
  await assert.rejects(waitForUnit(first, { ...orphanLive, deadline: Date.now() + 1500, pollMs: 20, census: recycledCensus }), /still present: 4000011/, "the unit gate refuses the recycled pid as foreign");
  assert.ok(exempt.length >= 2 && exempt.every(pids => !pids.includes(4000011) && pids.includes(4000020) && pids.includes(4000021) && pids.includes(4000012) && pids.includes(owner.pid)), `the live supervisor and engine are accounted for, the dead coordinator's pid is not: ${JSON.stringify(exempt)}`);
  fs.unlinkSync(slotFile(store, 2));
  first.release();
  assert.deepEqual(slotFiles(store).filter(file => fs.existsSync(file)), [], "every slot is released");
  console.log("PASS: a second and third run are admitted above the floor, a fourth waits on the cap, one pool keeps one slot free, the floor refuses admission and only delays a holder's next unit");
}

{
  const hold = (name, pool) => acquire(name, { ...live, pool });
  const a = hold("A", "writer"), b = hold("B", "reviewer"), c = hold("C", "writer");
  const order = [], waits = {};
  const queue = (name, pool) => {
    waits[name] = [];
    return acquireWaiting(name, { ...live, pool, waitMs: 60000, pollMs: 20, onWait: row => waits[name].push(row) }).then(reservation => { order.push(name); return reservation; });
  };
  const w1 = queue("W1", "writer");
  await until(() => waits.W1.length > 0, "W1's first wait");
  const r1 = queue("R1", "reviewer");
  await until(() => waits.R1.length > 0, "R1's first wait");
  const w2 = queue("W2", "writer");
  await until(() => waits.W2.length > 0, "W2's first wait");
  const r2 = queue("R2", "reviewer");
  await until(() => waits.R2.length > 0, "R2's first wait");
  assert.equal(waitingRows().length, 4, "every waiter has a row");
  assert.ok(waits.W1.some(row => row.waiting === "reservation" && row.position === 1 && row.queued >= 1 && row.holders.length === 3 && row.freeMb === 8192), `rows carry the reason, the position, the holders and the reading: ${JSON.stringify(waits.W1[0])}`);
  await until(() => waits.R2.some(row => row.queued === 4), "R2 to see the whole queue");
  assert.ok(waits.R2.some(row => row.position === 4 && row.queued === 4), "the newest waiter is last");
  assert.throws(() => acquire("impatient", { ...live, pool: "reviewer" }), error => error.waitable === "reservation", "no slot, no admission for anyone");
  c.release();
  await until(() => order.length === 1, "the first admission");
  assert.deepEqual(order, ["R1"], "the last admitted run was a writer, so the oldest reviewer goes before the older writer");
  assert.throws(() => acquire("impatient", { ...live, pool: "writer" }), error => error.waitable === "reservation");
  b.release();
  await until(() => order.length === 2, "the second admission");
  assert.deepEqual(order, ["R1", "W1"], "then the oldest writer");
  a.release();
  await until(() => order.length === 3, "the third admission");
  assert.deepEqual(order, ["R1", "W1", "R2"], "then the remaining reviewer, as the last admitted run was a writer");
  const turns = waits.W2.filter(row => row.waiting === "queue");
  assert.ok(turns.every(row => /Queued behind the (?:writer run W1|reviewer run R[12])$/.test(row.detail)), `a waiter told to wait its turn reports whose turn it is: ${JSON.stringify(turns.map(row => row.detail))}`);
  assert.ok(waits.W2.every(row => ["reservation", "queue"].includes(row.waiting)), "a writer behind a full store waits on the store or on its turn");
  const [R1, W1, R2] = await Promise.all([r1, w1, r2]);
  assert.throws(() => acquire("no wait", { ...live, pool: "writer" }), error => error.waitable === "reservation");
  R1.release();
  await until(() => order.length === 4, "the last admission");
  assert.deepEqual(order, ["R1", "W1", "R2", "W2"]);
  const W2 = await w2;
  assert.deepEqual(waitingRows(), [], "admitted runs removed their rows");
  const parked = [];
  const later = acquireWaiting("later waiter", { ...live, pool: "writer", waitMs: 60000, pollMs: 20, onWait: row => parked.push(row) });
  await until(() => parked.length > 0, "the later waiter's first wait");
  assert.equal(parked[0].waiting, "reservation", "every slot is held, so it waits");
  assert.equal(waitingRows().length, 1, "its row is in the store while it waits");
  W1.release();
  const admittedLater = await later;
  assert.equal(admittedLater.record.run, "later waiter");
  W2.release();
  fs.writeFileSync(path.join(store, "waiting-dead-row.json"), JSON.stringify({ token: "dead-row", owner: { pid: 4000002, start: "gone" }, pool: "writer", run: "dead waiter", arrivedAt: "2020-01-01T00:00:00.000Z" }));
  const afterDead = acquire("after a dead waiter", { ...live, pool: "writer" });
  assert.equal(afterDead.record.run, "after a dead waiter", "a dead waiter does not hold the queue");
  assert.ok(fs.existsSync(path.join(store, "recovered-waiting-dead-row.json")), "the dead waiter's row is set aside as recovered evidence");
  assert.equal(fs.existsSync(path.join(store, "waiting-dead-row.json")), false);
  assert.deepEqual([R2, admittedLater, afterDead].map(holder => holder.slot).sort(), [1, 2, 3]);
  await assert.rejects(acquireWaiting("late reviewer", { ...live, pool: "reviewer", waitMs: 1500, pollMs: 50 }), error => {
    assert.match(error.message, /^Existing suite running in every slot \(3 of 3\)/);
    assert.match(error.message, /waited [0-9]+ s: queue position 1 of 1; holders: /);
    assert.match(error.message, /after a dead waiter \(writer, slot \d, reserved\)/);
    assert.match(error.message, /free memory 8192 MB \(floor 4096 MB\)/);
    assert.match(error.message, /the Test Suite workflow on the pushed head is the route for the files that did not run/);
    return error.waitable === "reservation" && error.holders.length === 3;
  }, "the refusal reports the queue state");
  assert.deepEqual(waitingRows(), [], "a run that gives up withdraws its row");
  R2.release(); admittedLater.release(); afterDead.release();
  console.log("PASS: waiters are admitted oldest first alternating between pools, a dead waiter's row is recovered, and the expired wait names position, holders, reading and route");
}

{
  const older = { version: 2, token: "older-checkout", owner, run: path.join(scratch, "older-run"), heldSince: new Date().toISOString(), heldUptime: os.uptime(), phase: "reserved" };
  fs.writeFileSync(slotFile(store, 1), JSON.stringify(older, null, 2) + "\n");
  assert.throws(() => acquire("single slot", { ...live, pool: "writer", slots: 1 }), error => /Existing suite running/.test(error.message) && error.holder.run === older.run && error.holder.pool === "writer" && error.holder.slot === 1, "a store of one slot honours the older record");
  const beside = acquire("beside the older checkout", { ...live, pool: "writer" });
  assert.equal(beside.slot, 2, "the new code takes the next slot");
  assert.throws(() => acquire("writer pool full", { ...live, pool: "writer" }), error => error.waitable === "pool slots", "the older checkout's run counts as a writer");
  assert.deepEqual(read(slotFile(store, 1)), older, "the older record is untouched");
  beside.release();
  fs.unlinkSync(slotFile(store, 1));
  console.log("PASS: an older checkout's reservation.json is honoured as the first slot of the writer pool");
}

{
  fs.writeFileSync(path.join(store, "waiting-row-one.json"), JSON.stringify({ token: "row-one", owner, pool: "writer", run: "somewhere", arrivedAt: new Date().toISOString() }));
  const seen = withProbeCleanupGuard(files => ({ files, guard: fs.existsSync(path.join(store, "guard.json")) }), { root: store });
  assert.deepEqual(seen.files, [...slotFiles(store), path.join(store, "waiting-row-one.json")], "the callback sees the three slots and the waiting row");
  assert.equal(seen.guard, true, "the guard is held while the callback runs");
  assert.equal(fs.existsSync(path.join(store, "guard.json")), false, "and released afterwards");
  fs.unlinkSync(path.join(store, "waiting-row-one.json"));
  const reviewerDirectory = path.join(scratch, "impower.review-jobs", "pr-2", "round-1", "codex");
  const clone = path.join(reviewerDirectory, "clone");
  const probe = () => { fs.mkdirSync(path.join(clone, ".git"), { recursive: true }); fs.writeFileSync(path.join(clone, ".git", "HEAD"), "ref: refs/heads/main\n"); fs.writeFileSync(path.join(clone, "probe.test.ts"), "probe"); };
  probe();
  const other = acquire(path.join(scratch, "elsewhere"), { ...live, pool: "writer" });
  const reviewerRun = acquire(path.join(clone, ".git", "run"), { ...live, pool: "reviewer" });
  assert.equal(reviewerRun.slot, 2);
  const preserved = removeProbeCheckouts(reviewerDirectory, { reservationRoot: store });
  assert.equal(preserved.skipped, true, "a reservation in the second slot naming the directory preserves it");
  assert.match(preserved.reason, /reservation-2\.json/);
  reviewerRun.release();
  fs.writeFileSync(path.join(store, "waiting-row-two.json"), JSON.stringify({ token: "row-two", owner, pool: "reviewer", run: path.join(clone, ".git", "run"), arrivedAt: new Date().toISOString() }));
  const queued = removeProbeCheckouts(reviewerDirectory, { reservationRoot: store });
  assert.equal(queued.skipped, true, "a waiting row naming the directory preserves it");
  assert.match(queued.reason, /waiting-row-two\.json/);
  fs.unlinkSync(path.join(store, "waiting-row-two.json"));
  const removed = removeProbeCheckouts(reviewerDirectory, { reservationRoot: store });
  assert.equal(removed.skipped, undefined, removed.reason);
  assert.equal(fs.existsSync(clone), false, "without a reservation or row the probe clone goes");
  other.release();
  console.log("PASS: probe cleanup reads every slot and waiting row and a reservation or row naming the directory preserves it");
}

{
  const enginePath = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "fixtures", "test-suite-engine-control.mjs");
  const fixture = (directory, files) => {
    fs.mkdirSync(path.join(directory, ".git"), { recursive: true });
    fs.mkdirSync(path.join(directory, "node_modules", "vitest"), { recursive: true });
    fs.writeFileSync(path.join(directory, "node_modules", "vitest", "package.json"), '{"version":"2.1.9"}');
    fs.writeFileSync(path.join(directory, "package.json"), "{}");
    for (const file of files) fs.writeFileSync(path.join(directory, file), "bounded fixture");
    return canonicalPath(directory);
  };
  const clone = fixture(path.join(scratch, "impower.review-jobs", "pr-3", "round-1", "codex", "clone"), ["a.test.ts", "b.test.ts"]);
  const worktree = fixture(path.join(scratch, "worktree"), ["c.test.ts"]);
  const units = [];
  const dependencies = (pool, extra = {}) => ({ root: store, census: () => [], memory: () => 8192, stdio: "ignore", pollMs: 20, identify: live.identify,
    prepareRuntime: coordinator.prepareRuntime, prepareChild: coordinator.prepareChild, enginePath, ...extra,
    ownedChild: async value => {
      const [, , mode, , , file] = value.prepared.args;
      units.push({ pool, mode, file: file ? path.basename(file) : null, slotsHeld: slotFiles(store).filter(slot => fs.existsSync(slot)).length });
      return coordinator.ownedChild(value);
    } });
  const lines = [], log = console.log;
  console.log = (...args) => { lines.push(args.join(" ")); };
  let reviewerExit, writerExit;
  try {
    let writerRun;
    const reviewerDependencies = dependencies("reviewer");
    const inner = reviewerDependencies.ownedChild;
    reviewerDependencies.ownedChild = async value => {
      if (!writerRun) {
        writerRun = main(["run", worktree, "c.test.ts", "--wait", "30"], dependencies("writer"));
        await until(() => slotFiles(store).filter(slot => fs.existsSync(slot)).length === 2, "the writer's admission beside the reviewer");
      }
      return inner(value);
    };
    reviewerExit = await main(["run", clone, "a.test.ts", "b.test.ts", "--wait", "5"], reviewerDependencies);
    writerExit = await writerRun;
  } finally { console.log = log; }
  assert.equal(reviewerExit, 0, `the reviewer run passes: ${lines.filter(line => line.includes('"exit"')).join("\n")}`);
  assert.equal(writerExit, 0, "the writer run passes");
  assert.ok(lines.includes(JSON.stringify({ status: "admitted", pool: "reviewer", slot: 1, freeMb: 8192 })), "the probe clone's run announces the reviewer pool, its slot and the reading");
  assert.ok(lines.includes(JSON.stringify({ status: "admitted", pool: "writer", slot: 2, freeMb: 8192 })), "the worktree's run announces the writer pool, its slot and the reading");
  assert.equal(lines.filter(line => line === '{"status":"acquired"}').length, 2, "each run announces its admission once");
  assert.ok(units.some(unit => unit.pool === "writer" && unit.slotsHeld === 2), `the writer executed while the reviewer held its slot: ${JSON.stringify(units)}`);
  assert.deepEqual(units.filter(unit => unit.pool === "reviewer").map(unit => unit.mode), ["select", "run-direct", "run-direct", "merge"]);
  assert.deepEqual(units.filter(unit => unit.pool === "writer").map(unit => unit.mode), ["select", "run-direct", "merge"]);
  assert.deepEqual(slotFiles(store).filter(slot => fs.existsSync(slot)), [], "both slots are released");
  console.log("PASS: a probe clone's run and a worktree's run are admitted together and both complete");

  const marked = [];
  console.log = (...args) => { marked.push(args.join(" ")); };
  process.env.IMPOWER_TEST_POOL = "reviewer";
  try { assert.equal(await main(["run", worktree, "c.test.ts", "--wait", "5"], dependencies("reviewer")), 0); }
  finally { console.log = log; delete process.env.IMPOWER_TEST_POOL; }
  assert.ok(marked.includes(JSON.stringify({ status: "admitted", pool: "reviewer", slot: 1, freeMb: 8192 })), "IMPOWER_TEST_POOL=reviewer puts a worktree run in the reviewer pool");

  const events = path.join(worktree, ".git", "engine-control-events.jsonl");
  const before = fs.readFileSync(events, "utf8").split("\n").filter(Boolean).length;
  const holders = ["one", "two", "three"].map((name, index) => acquire(name, { ...live, pool: index === 1 ? "reviewer" : "writer" }));
  const refused = [];
  console.log = (...args) => { refused.push(args.join(" ")); };
  try {
    await assert.rejects(main(["run", worktree, "c.test.ts", "--wait", "5"], dependencies("writer")), error => error.notRun === true
      && /Existing suite running in every slot \(3 of 3\)/.test(error.message) && /queue position 1 of 1/.test(error.message)
      && /holders: one \(writer, slot 1, reserved\); two \(reviewer, slot 2, reserved\); three \(writer, slot 3, reserved\)/.test(error.message)
      && /free memory 8192 MB \(floor 4096 MB\)/.test(error.message) && /Test Suite workflow on the pushed head/.test(error.message), "the expired wait is a not-run that reports the queue state");
  } finally { console.log = log; }
  assert.ok(refused.some(line => line.includes('"waiting":"reservation"') && line.includes('"position":1')), `the wait rows carried the position: ${refused.join(" | ")}`);
  assert.ok(!refused.includes('{"status":"acquired"}'), "nothing was admitted");
  assert.equal(fs.readFileSync(events, "utf8").split("\n").filter(Boolean).length, before, "no engine ran");
  assert.deepEqual(waitingRows(), [], "the refused run withdrew its row");
  for (const holder of holders) holder.release();
  console.log("PASS: a run refused within --wait has not run and names the queue position, holders, reading and route");

  let readings = 0;
  const stalled = [];
  console.log = (...args) => { stalled.push(args.join(" ")); };
  let exit;
  try { exit = await main(["run", clone, "a.test.ts", "b.test.ts", "--wait", "1"], dependencies("reviewer", { memory: () => ++readings <= 3 ? 8192 : 1000 })); }
  finally { console.log = log; }
  assert.equal(exit, 1, "the stalled run is an ordinary incomplete failure");
  const summary = JSON.parse(stalled.find(line => line.includes('"coordinationError"')) ?? "{}");
  assert.match(summary.diagnostics?.coordinationError ?? "", /1000 MB is below the 4096 MB floor/, `the stall is named: ${stalled.join("\n")}`);
  assert.deepEqual(summary.completed?.map(file => path.basename(file.file ?? file)), ["a.test.ts"], `the completed file keeps its result: ${JSON.stringify(summary.completed)}`);
  assert.deepEqual(summary.unfinished?.map(file => [path.basename(file.file), file.status]), [["b.test.ts", "not-run"]], "the remaining file ends not run");
  assert.ok(stalled.some(line => line.includes('"waiting":"memory"') && line.includes('"freeMb":1000')), "the unit wait reported the reading");
  assert.deepEqual(slotFiles(store).filter(slot => fs.existsSync(slot)), [], "the stalled holder released its slot at the end");
  console.log("PASS: a holder stalled by the floor at a unit boundary keeps its slot until it ends and reports the stall");
}
