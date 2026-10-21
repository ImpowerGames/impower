// A delegated editor shutdown recorded as not drained (I-1395): the driver's
// `down` keeps a nonzero taskkill exit a failure unless the whole tree is
// gone, and confirm-drained settles a journal whose drain was recorded false
// once nothing of its service runs, which the checkpoint then accepts.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { processIdentity } from "./reviewer-slots.mjs";
import { readRepos } from "../.agents/repos.mjs";
import { sessionDir } from "../.agents/skills/drive-web-editor/session-dir.mjs";
import { readJournals, roundState } from "../.agents/skills/orchestrate-issues/review-checkpoint.mjs";
import { stopExitHandler } from "../.agents/skills/drive-web-editor/driver.mjs";

const launcher = fileURLToPath(new URL("./agent-handoff.mjs", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-drain-"));
console.log(`Scratch directory: ${scratch}`);

// --- The driver's stop ------------------------------------------------------

// A nonzero taskkill exit removes the record only when the tree is shown gone.
const stop = async (code, verifyStopped) => {
  const messages = [], failures = [];
  let removed = false;
  await stopExitHandler("state.json", 42324, { remove: () => { removed = true; }, log: (message) => messages.push(message), fail: (failure) => failures.push(failure), verifyStopped })(code);
  return { messages, failures, removed };
};
const gone = await stop(255, async () => ({ stopped: true }));
assert.equal(gone.removed, true, `a 255 exit whose whole tree is gone removes the record: ${gone.messages.join(" | ")}`);
assert.deepEqual(gone.failures, [], "a 255 exit whose whole tree is gone is a successful stop");
assert.ok(gone.messages.includes("stopped"), gone.messages.join(" | "));
const survivor = await stop(255, async () => ({ stopped: false, reason: "pid 47420 of its tree still run" }));
assert.deepEqual([survivor.removed, survivor.failures], [false, [1]], "a survivor keeps the record and fails the stop");
assert.match(survivor.messages.join(" | "), /could not stop pid 42324 \(exit 255; pid 47420 of its tree still run\); the record is kept/);
const unchecked = await stop(255, async () => { throw new Error("census failed"); });
assert.deepEqual([unchecked.removed, unchecked.failures], [false, [1]], "a tree that cannot be checked keeps the record");
const unverified = await stop(255);
assert.deepEqual([unverified.removed, unverified.failures], [false, [1]], "without a census a nonzero exit stays a failure");
assert.deepEqual((await stop(0)).failures, [], "a zero exit still stops");
console.log("PASS: a nonzero taskkill exit is a stop only when no process of the tree remains");

const driver = await import("../.agents/skills/drive-web-editor/driver.mjs");
assert.equal(typeof driver.treeSurvivors, "function", "the driver exports treeSurvivors");
// Root 10 started npm 11, which started vite 12. 20 names 10 as its parent
// but predates it, so 10's pid was reused and 20 is not in the tree.
const before = [{ pid: 10, ppid: 1, start: "1000" }, { pid: 11, ppid: 10, start: "1001" }, { pid: 12, ppid: 11, start: "1002" }, { pid: 20, ppid: 10, start: "900" }, { pid: 30, ppid: 1, start: "500" }];
assert.deepEqual(driver.treeSurvivors(before, [{ pid: 20, ppid: 10, start: "900" }, { pid: 30, ppid: 1, start: "500" }], 10), [], "unrelated processes are no survivors");
assert.deepEqual(driver.treeSurvivors(before, [{ pid: 12, ppid: 11, start: "1002" }], 10).map((row) => row.pid), [12], "a member still running survives");
assert.deepEqual(driver.treeSurvivors(before, [{ pid: 12, ppid: 5, start: "3000" }], 10), [], "a member's pid reused by a later process is gone");
assert.deepEqual(driver.treeSurvivors(before, [{ pid: 40, ppid: 11, start: "2000" }], 10).map((row) => row.pid), [40], "a child a member started after the census survives");
assert.deepEqual(driver.treeSurvivors(before, [{ pid: 12, ppid: 11, start: null }], 10).map((row) => row.pid), [12], "a member whose creation time is unknown survives");
assert.equal(driver.treeSurvivors(before, [], 99), null, "a root missing from the census leaves the tree unknown");
let calls = 0;
const settling = await driver.treeStopped(before, 10, { table: async () => (++calls === 1 ? [{ pid: 12, ppid: 11, start: "1002" }] : []), waitMs: 1 });
assert.deepEqual([settling.stopped, calls], [true, 2], "a member still exiting is read again");
const stuck = await driver.treeStopped(before, 10, { table: async () => [{ pid: 12, ppid: 11, start: "1002" }], attempts: 2, waitMs: 1 });
assert.deepEqual(stuck, { stopped: false, reason: "pid 12 of its tree still run" });
// A child seen in one reading that exits after starting its own child: the
// grandchild is still the tree's.
const readings = [[{ pid: 40, ppid: 10, start: "2000" }], [{ pid: 41, ppid: 40, start: "2100" }], [{ pid: 41, ppid: 40, start: "2100" }]];
let reading = 0;
const handedOn = await driver.treeStopped([{ pid: 10, ppid: 1, start: "1000" }], 10, { table: async () => readings[Math.min(reading++, 2)], attempts: 3, waitMs: 1 });
assert.deepEqual(handedOn, { stopped: false, reason: "pid 41 of its tree still run" }, "a survivor's own child is still found after the survivor exits");
// Three new generations in one reading, of which only the youngest is left
// in the next.
const generations = [[{ pid: 40, ppid: 10, start: "2000" }, { pid: 41, ppid: 40, start: "2100" }, { pid: 42, ppid: 41, start: "2200" }], [{ pid: 42, ppid: 41, start: "2200" }]];
let generation = 0;
const nested = await driver.treeStopped([{ pid: 10, ppid: 1, start: "1000" }], 10, { table: async () => generations[Math.min(generation++, 1)], attempts: 3, waitMs: 1 });
assert.deepEqual(nested, { stopped: false, reason: "pid 42 of its tree still run" }, "every new generation in a reading stays a member");
// A member's pid passed to a new child of the tree: the child stays a member
// in every reading, though its pid matches an older member's.
const collision = await driver.treeStopped([{ pid: 10, ppid: 1, start: "1000" }, { pid: 40, ppid: 10, start: "1100" }], 10, { table: async () => [{ pid: 40, ppid: 10, start: "2000" }], attempts: 3, waitMs: 1 });
assert.deepEqual(collision, { stopped: false, reason: "pid 40 of its tree still run" }, "a new child reusing a member's pid stays a member");
// The parent is whoever held the parent pid when the child was created: a
// child of a process that reused a member's pid is not the tree's.
assert.deepEqual(driver.treeSurvivors([{ pid: 10, ppid: 1, start: "1000" }, { pid: 40, ppid: 10, start: "1100" }], [{ pid: 40, ppid: 5, start: "3000" }, { pid: 50, ppid: 40, start: "3100" }], 10), [], "a child of a reused member pid is not the tree's");
if (process.platform === "win32") {
  const table = await driver.windowsProcessTable();
  const self = table.find((row) => row.pid === process.pid);
  assert.ok(self && self.ppid === process.ppid && /^\d+$/.test(self.start), "the Windows census lists this process with its parent and creation time");
}
console.log("PASS: the tree census names a member still running, a child started after it, and nothing else");

// --- confirm-drained ----------------------------------------------------------

// The driver's server records live under a private home for these fixtures.
const env = { ...process.env, IMPOWER_DRIVER_HOME: path.join(scratch, "driver-home") };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const goneWithin = async (pid, ms = 30000) => {
  const end = Date.now() + ms;
  while (processIdentity(pid) !== null) { if (Date.now() > end) throw new Error(`PID ${pid} never disappeared`); await sleep(100); }
};

// A process that has exited, with the identity it had while it ran and
// when it exited.
const exitedProcess = async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore", windowsHide: true });
  const identity = processIdentity(child.pid);
  const exitedAt = await new Promise((resolve) => child.once("exit", () => resolve(Date.now())));
  await goneWithin(child.pid);
  assert.ok(identity, "the stand-in process was identified while it ran");
  return { identity, exitedAt };
};
const standIns = await Promise.all([exitedProcess(), exitedProcess(), exitedProcess(), exitedProcess()]);
const [launcherGone, upChild, stopped, serverLauncher] = standIns.map((standIn) => standIn.identity);
// The fixture's records are dated when the stand-ins exited, as a real
// shutdown's are: a process that reuses one of their PIDs is created later,
// so it reads as reused rather than as a process that may predate them.
const recordedAt = new Date(Math.min(...standIns.map((standIn) => standIn.exitedAt)) - 1000);
// Ports nothing listens on: each was bound once and released.
const closedPort = async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};
const ports = { editor: await closedPort(), player: await closedPort(), hmr: await closedPort() };
const head = "85c2ec9b2930617de3da95c4e78da826498855c4";
const thread = { repo: "ImpowerGames/impower-internal", number: 1091, issueUrl: "https://api.github.com/repos/ImpowerGames/impower-internal/issues/1091" };
const goodComment = (t, id) => ({ id, issue_url: t.issueUrl, body: `Report for ${head}` });

// A launch directory as the launcher leaves it after a drain recorded false:
// the journal, its plan, the completion artifact, and the editor session's
// started records, session file, up.log and down.log; with `state`, the
// driver's server record that a failed `down` keeps.
const fixture = (name, { thread, coordinator = launcherGone, state, planName = "plan.json", session: withSession = true, startedIdentity = upChild, downPids = [stopped.pid], datedAt = recordedAt, alsoBlockedBy = null, stateChecked = true, stateRow = {} } = {}) => {
  const launchDir = path.join(scratch, name, "round-1", "launch-ax-1");
  const execution = path.join(launchDir, "handoff-0-review", "execution-x");
  const session = path.join(execution, "editor-author-x");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "up.started.json"), JSON.stringify({ phase: "running", pid: startedIdentity.pid, identity: startedIdentity }));
  const sessionId = `review-${name}`;
  let stateFile = null;
  if (withSession) {
    fs.writeFileSync(path.join(session, "session.json"), JSON.stringify({ root: scratch, session: sessionId, driver: "driver.mjs" }));
    fs.writeFileSync(path.join(session, "up.log"), `launching dev servers (same-origin) pid ${serverLauncher.pid} → http://localhost:${ports.editor}\nREADY http://localhost:${ports.editor}   (mode: same-origin)\n`);
    if (state) {
      stateFile = path.join(sessionDir({ root: scratch, session: sessionId, env }), "state.json");
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ url: `http://localhost:${ports.editor}`, pid: serverLauncher.pid, mode: "same-origin", ports, startedAt: Date.now() - 600000, session: sessionId, ...state }));
    }
  }
  fs.writeFileSync(path.join(session, "down.log"), downPids.map((pid) => `SUCCESS: The process with PID ${pid} (child process of PID ${startedIdentity.pid}) has been terminated.`).join("\n") + `\ncould not stop pid ${downPids.at(-1)} (exit 255); the record is kept\n`);
  for (const file of [path.join(session, "up.started.json"), path.join(session, "down.log"), path.join(session, "up.log"), stateFile]) if (file && fs.existsSync(file)) fs.utimesSync(file, datedAt, datedAt);
  const journal = path.join(launchDir, "journal.jsonl");
  const completion = path.join(launchDir, "completion.json");
  fs.writeFileSync(completion, JSON.stringify({ head, next: null, commentIds: [6302234332], summary: "Author-experience review complete; no findings." }));
  fs.writeFileSync(path.join(launchDir, planName), JSON.stringify({ journal, steps: { "review-ax": { role: "review", next: [null] } } }));
  const at = (s) => `2026-10-20T21:${String(s).padStart(2, "0")}:00.000Z`;
  const rows = [
    { time: at(37), event: "coordinator", pid: coordinator.pid, processIdentity: coordinator, ...(thread ? { thread } : {}) },
    { time: at(37), event: "launching", index: 0, step: "review-ax", role: "review", round: 1, reviewerId: "ax", attempt: 1, plannedReviewers: ["ax"], completedRound: 0, reviewedHead: null, completedRoundReviews: null, completedRoundReviewers: null, plannedRoundReviewers: null, finalCorrections: false, head, completion },
    { time: at(37), event: "reserved", index: 0 },
    { time: at(37), event: "execution-service", index: 0, head, directory: execution, operations: [{ id: "author", kind: "editor" }] },
    { time: at(37), event: "running", index: 0, step: "review-ax", pid: 1, head },
    { time: at(43), event: "exited", index: 0, step: "review-ax", code: 0, signal: null, executionDrained: false },
    ...(stateChecked ? [{ time: at(43), event: "review-state-checked", index: 0, step: "review-ax", headUnchanged: true, changedPaths: 0, installChanges: [], ...stateRow }] : []),
    { time: at(43), event: "probe-checkouts-removed", index: 0, step: "review-ax" },
    { time: at(43), event: "blocked", reason: `Editor shutdown unverified; preserve ${session} and inspect ${path.join(session, "down.log")}${alsoBlockedBy ? `; ${alsoBlockedBy}` : ""}` },
  ];
  fs.writeFileSync(journal, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { journal, execution, session, stateFile, jobDir: path.join(scratch, name) };
};
const journalRows = (journal) => fs.readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const confirm = (journal) => spawnSync(process.execPath, [launcher, "confirm-drained", journal], { encoding: "utf8", windowsHide: true, env });
// A refusal, from the CLI's result or a rejected call, leaves the journal as
// it was before the command ran.
const refusedUnchanged = async (journal, act, pattern, label) => {
  const before = fs.readFileSync(journal, "utf8");
  const outcome = await Promise.resolve().then(act).then((value) => (value && "status" in value && "stderr" in value ? value : { status: 0, stderr: JSON.stringify(value) }), (error) => ({ status: 1, stderr: error.message }));
  assert.notEqual(outcome.status, 0, `${label}: confirm-drained refuses (${outcome.stderr})`);
  assert.match(outcome.stderr, pattern, `${label}: ${outcome.stderr}`);
  assert.equal(fs.readFileSync(journal, "utf8"), before, `${label}: the journal is unchanged`);
};

const plain = fixture("launch-plain", { state: {} });
assert.ok(roundState(readJournals(plain.jobDir)).blockers.some((b) => /shutdown is not confirmed \(executionDrained false\)/.test(b)), "the checkpoint refuses the journal before the confirmation");

// A live process holds the confirmation: one naming the execution
// directory, one whose recorded identity still runs, and one a record names.
const live = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", plain.execution], { stdio: "ignore", windowsHide: true });
const handoff = await import("./agent-handoff.mjs");
const quietCensus = () => [{ pid: process.pid, ppid: process.ppid, start: null, commandLine: "node" }];
// Calls with an injected census also get an identity probe that finds the
// exited stand-ins absent: a census that lists none of the machine's
// processes cannot date a stand-in PID another user's process has reused.
const standInPids = new Set([launcherGone, upChild, stopped, serverLauncher].map((identity) => identity.pid));
const probeStandIns = (pid) => (standInPids.has(pid) ? null : processIdentity(pid));
const confirmWith = (journal, options) => handoff.confirmExecutionDrained(journal, { identifyProcess: probeStandIns, env, ...options });
try {
  const liveIdentity = processIdentity(live.pid);
  await refusedUnchanged(plain.journal, () => confirm(plain.journal), /name the execution directory/, "a process naming the execution directory");
  const started = path.join(plain.session, "attempt.started.json");
  fs.writeFileSync(started, JSON.stringify({ phase: "running", pid: live.pid, identity: liveIdentity }));
  await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: quietCensus, env }), /recorded in .*attempt\.started\.json, is still running/, "a recorded identity still running");
  fs.rmSync(started);
  const laterLog = path.join(plain.session, "retry", "down.log");
  fs.mkdirSync(path.dirname(laterLog));
  fs.writeFileSync(laterLog, `ERROR: The process with PID ${live.pid} could not be terminated.\n`);
  await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: quietCensus, env }), /named in .*down\.log, is in use by a process that may predate that record/, "a down.log PID still in use");
  fs.rmSync(path.dirname(laterLog), { recursive: true });
} finally { live.kill(); }
await new Promise((resolve) => (live.exitCode !== null || live.signalCode !== null ? resolve() : live.once("exit", resolve)));
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: () => { throw new Error("CIM unavailable"); }, env }), /process census failed \(CIM unavailable\)/, "a census that fails");
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: quietCensus, env, identifyProcess: () => { throw new Error("Process start identity unavailable"); } }), /cannot be probed|start identity/, "an identity probe that fails");
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: quietCensus, env, probePort: async () => { throw new Error("no answer"); } }), /port \d+, recorded in .*, cannot be probed \(no answer\)/, "a port that cannot be probed");
// A server of the service outlives its launcher: its parent PID (Windows),
// or its process group or session (Linux), still names a recorded PID.
const orphanOf = (pid, start) => () => [...quietCensus(), { pid: 999999, ppid: pid, group: 0, sessionId: 0, start, commandLine: "node vite" }];
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: orphanOf(serverLauncher.pid, "1"), env }), new RegExp(`PID 999999 \\(descended from recorded PID ${serverLauncher.pid}\\) still runs`), "a server orphaned by its launcher");
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: () => [...quietCensus(), { pid: 999999, ppid: 1, group: serverLauncher.pid, sessionId: serverLauncher.pid, start: null, commandLine: "node vite" }], env }), /descended from recorded PID/, "a reparented server still in its launcher's session");
await refusedUnchanged(plain.journal, () => confirmWith(plain.journal, { census: orphanOf(serverLauncher.pid, null), env }), /descended from recorded PID/, "a child whose creation time is unknown");
// The driver's kept record: its launcher still running, or a server still
// answering on a recorded port.
const keptLive = fixture("launch-kept-live", { state: { pid: process.pid, startedAt: Date.now() } });
await refusedUnchanged(keptLive.journal, () => confirmWith(keptLive.journal, { census: quietCensus, env }), /the server launcher .*state\.json records, may still run/, "the driver record's launcher still running");
const listener = net.createServer((socket) => socket.end("alive"));
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
try {
  const answering = fixture("launch-answering", { state: { ports: { ...ports, hmr: listener.address().port } } });
  await refusedUnchanged(answering.journal, () => confirm(answering.journal), new RegExp(`port ${listener.address().port}, recorded in .*state\\.json, still accepts connections`), "a server still answering on a recorded port");
} finally { await new Promise((resolve) => listener.close(resolve)); }
// One run at a time: a marker naming a live run refuses, and one whose run is
// gone is replaced.
const marked = fixture("launch-marked");
fs.writeFileSync(`${marked.journal}.confirm-drained`, JSON.stringify({ processIdentity: processIdentity(process.pid) }));
await refusedUnchanged(marked.journal, () => confirm(marked.journal), /another confirm-drained \(PID \d+\) is running on it/, "a confirmation already running");
fs.writeFileSync(`${marked.journal}.confirm-drained`, JSON.stringify({ processIdentity: launcherGone }));
const replaced = await confirmWith(marked.journal, { census: quietCensus, env });
assert.equal(replaced.confirmed.event, "execution-drained", "a marker whose run is gone is replaced");
assert.equal(fs.existsSync(`${marked.journal}.confirm-drained`), false, "the marker goes when the run ends");
const running = fixture("launch-running", { coordinator: processIdentity(process.pid) });
await refusedUnchanged(running.journal, () => confirm(running.journal), /launcher \(PID \d+\) is still running/, "a launcher still running");
console.log("PASS: confirm-drained refuses while any process of the service may run, and writes nothing");

// A real detached server whose launcher is gone, with nothing recording its
// port: on Windows the hidden wrapper the launcher started still names it as
// its parent; on Linux the server keeps the session of the detached leader
// the driver would record.
{
  const helper = pathToFileURL(fileURLToPath(new URL("./detached-launch.mjs", import.meta.url))).href;
  const serve = "require('node:net').createServer((c) => c.end('alive')).listen(0, '127.0.0.1')";
  const lead = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(serve)}], { stdio: 'ignore', windowsHide: true }).unref(); setTimeout(() => process.exit(0), 500)`;
  const body = process.platform === "win32" ? serve : lead;
  const launch = `const { spawnDetached } = await import(${JSON.stringify(helper)}); const p = spawnDetached(process.execPath, ['-e', ${JSON.stringify(body)}], { stdio: 'ignore' }); console.log(p.pid); p.unref(); setTimeout(() => process.exit(0), 1500);`;
  const starter = spawn(process.execPath, ["--input-type=module", "-e", launch], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  const starterIdentity = processIdentity(starter.pid);
  let printed = "";
  starter.stdout.on("data", (data) => { printed += data; });
  await new Promise((resolve) => starter.once("exit", resolve));
  const detached = Number(printed.trim());
  await sleep(1500);
  const recorded = process.platform === "win32" ? starterIdentity : { pid: detached, start: "recorded" };
  await goneWithin(recorded.pid);
  const census = handoff.processCensus();
  const survivors = census.filter((p) => (process.platform === "win32" ? p.ppid === starterIdentity.pid : p.sessionId === detached));
  try {
    assert.ok(survivors.length, `the detached server outlives the recorded launcher ${recorded.pid}`);
    const orphaned = fixture("launch-detached", { session: false, startedIdentity: recorded, downPids: [recorded.pid], datedAt: new Date() });
    await refusedUnchanged(orphaned.journal, () => confirm(orphaned.journal), /descended from recorded PID/, "a real detached server whose launcher is gone");
  } finally {
    for (const p of handoff.processCensus().filter((p) => p.ppid === detached || p.pid === detached || p.sessionId === detached || survivors.some((s) => s.pid === p.pid))) {
      console.log(`Stopping fixture process ${p.pid} under ${scratch}`);
      try { process.kill(p.pid); } catch {}
    }
  }
}
console.log("PASS: a detached server outliving its recorded launcher holds the confirmation");

// With nothing left, the CLI records the drain with its evidence. This
// journal names no review thread, so the completion cannot be recorded and
// the journal ends blocked, with the drain confirmed.
// The real census can briefly show a child of a short-lived process that
// reused a stand-in's PID (a console host, say); the command refuses that,
// as it must, and a later run passes, as an operator's would.
let settled = confirm(plain.journal);
for (let attempt = 1; settled.status !== 0 && /descended from recorded PID/.test(settled.stderr) && attempt < 10; attempt++) {
  console.log(`retrying after a transient child of a reused PID: ${settled.stderr.trim()}`);
  await sleep(2000);
  settled = confirm(plain.journal);
}
assert.equal(settled.status, 0, settled.stderr);
const drained = journalRows(plain.journal).find((row) => row.event === "execution-drained");
assert.ok(drained && drained.index === 0 && drained.directory === plain.execution, "the confirmation names the launch and its execution directory");
assert.equal(drained.confirmedBy.host, os.hostname(), "the confirmation records who confirmed it");
assert.deepEqual(drained.census.identities.map((entry) => entry.pid), [upChild.pid], "the evidence lists each recorded identity");
assert.ok([...drained.census.identities, ...drained.census.pids].every((entry) => ["absent", "reused"].includes(entry.state)), "each is absent or, when its PID passed to a newer process, reused");
assert.deepEqual(drained.census.pids.map((entry) => entry.pid).sort((a, b) => a - b), [stopped.pid, serverLauncher.pid].sort((a, b) => a - b), "the evidence lists each PID taskkill acted on and the server launcher, not a down.log parent");
assert.deepEqual(drained.census.servers.map((entry) => [entry.record, entry.pid]), [["kept", serverLauncher.pid]], "the evidence names the driver's kept record");
assert.deepEqual(drained.census.ports.map((entry) => entry.port).sort((a, b) => a - b), Object.values(ports).sort((a, b) => a - b), "the evidence lists each recorded port as closed");
assert.match(journalRows(plain.journal).at(-1).reason ?? "", /Drain confirmed; the review completion was not recorded: its coordinator row names no review thread/);
const state = roundState(readJournals(plain.jobDir));
assert.ok(!state.blockers.some((b) => /shutdown is not confirmed/.test(b)), `the checkpoint accepts the confirmed drain: ${state.blockers.join("; ")}`);
// Running it again retries only the completion.
const retried = confirm(plain.journal);
assert.equal(retried.status, 0, retried.stderr);
assert.equal(journalRows(plain.journal).filter((row) => row.event === "execution-drained").length, 1, "a retry records no second confirmation");
// A creation time alone does not show a recorded parent PID was reused: a
// child created after the records still holds the confirmation while that
// PID is absent, or held by a process older than the child; it is let go
// only when the PID is held by a process newer than the records and older
// than the child.
const ticks = (ms) => String(BigInt(Math.floor(ms)) * 10000n + 621355968000000000n);
const reusedParent = fixture("launch-reused-parent");
const childOf = (pid, at) => ({ pid: 999999, ppid: pid, start: ticks(at), commandLine: "node" });
const heldAt = Date.now();
const holder = { pid: stopped.pid, ppid: 4, start: ticks(heldAt), commandLine: "svchost" };
await refusedUnchanged(reusedParent.journal, () => confirmWith(reusedParent.journal, { census: () => [...quietCensus(), childOf(stopped.pid, Date.now())], env }), /PID 999999 \(descended from recorded PID \d+\)/, "a newer child of an absent recorded PID");
await refusedUnchanged(reusedParent.journal, () => confirmWith(reusedParent.journal, { census: () => [...quietCensus(), holder, childOf(stopped.pid, heldAt - 1000)], env }), /PID 999999 \(descended from recorded PID \d+\)/, "a child older than the PID's new holder");
const later = await confirmWith(reusedParent.journal, { census: () => [...quietCensus(), holder, childOf(stopped.pid, heldAt + 1000)], env });
assert.equal(later.confirmed.event, "execution-drained", "a child of a PID held by a newer process does not hold the confirmation");
// A PID the identity probe cannot read (another user's process) is dated by
// the census: a creation time within a millisecond of the recorded identity
// is that process still running, a later one a reuse, and a PID the census
// does not list either refuses. Only Windows dates processes in ticks; the
// Linux census reports no creation time, so there the probe's failure stands.
if (process.platform === "win32") {
  const unreadable = (pid) => (asked) => { if (asked === pid) throw new Error("Process start identity unavailable"); return probeStandIns(asked); };
  const censusDated = fixture("launch-census-dated");
  const withRow = (start) => () => [...quietCensus(), { pid: upChild.pid, ppid: 4, start, commandLine: "" }];
  await refusedUnchanged(censusDated.journal, () => confirmWith(censusDated.journal, { census: withRow(String(BigInt(upChild.start) + 5000n)), identifyProcess: unreadable(upChild.pid), env }), /recorded in .*up\.started\.json, is still running/, "a census creation time matching the recorded identity");
  await refusedUnchanged(censusDated.journal, () => confirmWith(censusDated.journal, { census: quietCensus, identifyProcess: unreadable(upChild.pid), env }), new RegExp(`PID ${upChild.pid} cannot be probed`), "an unreadable PID the census does not list");
  const dated = await confirmWith(censusDated.journal, { census: withRow(ticks(Date.now())), identifyProcess: unreadable(upChild.pid), env });
  assert.deepEqual(dated.confirmed.census.identities.map((entry) => [entry.pid, entry.state, entry.dated]), [[upChild.pid, "reused", "census"]], "a later census creation time is a reuse");
}
// What still runs is read from a census taken after every probe: a recorded
// process that starts a child and exits between the first census and the
// probes, or one the last census still shows holding its PID, refuses.
const raced = fixture("launch-raced");
const sequence = (...readings) => { let reading = 0; return () => readings[Math.min(reading++, readings.length - 1)](); };
await refusedUnchanged(raced.journal, () => confirmWith(raced.journal, { census: sequence(quietCensus, () => [...quietCensus(), childOf(stopped.pid, Date.now())]), env }), /PID 999999 \(descended from recorded PID \d+\)/, "a child started after the first census");
await refusedUnchanged(raced.journal, () => confirmWith(raced.journal, { census: sequence(quietCensus, () => [...quietCensus(), { pid: stopped.pid, ppid: 4, start: ticks(recordedAt.getTime() - 60000), commandLine: "node" }]), env }), new RegExp(`recorded PID ${stopped.pid} is held by a process the last census cannot show is newer than the records naming it`), "a recorded PID the last census shows held by an older process");
// Ancestry runs through both censuses: a chain the first census saw from a
// recorded PID, whose intermediates exited before the last census, still
// holds the confirmation through its surviving leaf.
const chained = fixture("launch-chained");
const chain = [{ pid: 999001, ppid: stopped.pid, start: ticks(Date.now() - 3000), commandLine: "cmd" }, { pid: 999002, ppid: 999001, start: ticks(Date.now() - 2000), commandLine: "npm" }, { pid: 999003, ppid: 999002, start: ticks(Date.now() - 1000), commandLine: "vite" }];
await refusedUnchanged(chained.journal, () => confirmWith(chained.journal, { census: sequence(() => [...quietCensus(), ...chain], () => [...quietCensus(), chain[2]]) }), /PID 999003 \(descended from recorded PID \d+\)/, "a leaf whose intermediates exited between the censuses");
// Only an editor shutdown failure is answered by confirming the drain; any
// other failure the service's close joined into the blocked reason, such as
// a changed frozen worktree, keeps the review uncompleted.
assert.equal(handoff.onlyDrainFailures("Editor shutdown unverified; preserve C:/x/editor-a and inspect C:/x/editor-a/down.log"), true);
assert.equal(handoff.onlyDrainFailures("Editor shutdown unverified; preserve C:/x/editor-a and inspect C:/x/editor-a/down.log; Editor shutdown unverified; preserve C:/x/editor-b and inspect driver state"), true, "two editor sessions that failed to stop");
assert.equal(handoff.onlyDrainFailures("Editor shutdown unverified; preserve C:/x/editor-a and inspect C:/x/editor-a/down.log; Execution refused: reviewed head or worktree changed"), false, "a changed frozen worktree as well");
assert.equal(handoff.onlyDrainFailures("Execution refused: reviewed head or worktree changed"), false, "no shutdown failure at all");
assert.equal(handoff.onlyDrainFailures("Child exit confirmed (code 0); reservation retained at C:/slot: busy; Editor shutdown unverified; preserve C:/x and inspect C:/x/down.log"), false, "a retained reservation as well");
const frozenChanged = fixture("launch-frozen-changed", { thread, alsoBlockedBy: "Execution refused: reviewed head or worktree changed" });
const notCompleted = await confirmWith(frozenChanged.journal, { census: quietCensus, env, readComment: goodComment });
assert.equal(notCompleted.confirmed.event, "execution-drained", "the drain itself is still confirmed");
assert.equal(notCompleted.ended, "blocked", "a review blocked by more than its drain is not completed");
assert.match(notCompleted.reason, /blocked by more than the drain.*Execution refused: reviewed head or worktree changed/);
assert.equal(journalRows(frozenChanged.journal).some((row) => row.event === "completed"), false);
// The real case behind that rule (Windows, where a child keeps its parent's
// PID): an original process starts a child after the records were written,
// then exits.
if (process.platform === "win32") {
  const helper = pathToFileURL(fileURLToPath(new URL("./detached-launch.mjs", import.meta.url))).href;
  const serve = "setInterval(() => {}, 1000)";
  const late = `const { spawnDetached } = await import(${JSON.stringify(helper)}); setTimeout(() => { const p = spawnDetached(process.execPath, ['-e', ${JSON.stringify(serve)}], { stdio: 'ignore' }); console.log(p.pid); p.unref(); setTimeout(() => process.exit(0), 500); }, 2500);`;
  const original = spawn(process.execPath, ["--input-type=module", "-e", late], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  const originalIdentity = processIdentity(original.pid);
  const lateChild = fixture("launch-late-child", { startedIdentity: originalIdentity, downPids: [originalIdentity.pid], session: false, datedAt: new Date() });
  let printed = "";
  original.stdout.on("data", (data) => { printed += data; });
  await new Promise((resolve) => original.once("exit", resolve));
  await goneWithin(originalIdentity.pid);
  const wrapper = Number(printed.trim());
  try {
    assert.ok(handoff.processCensus().some((p) => p.pid === wrapper && p.ppid === originalIdentity.pid), "the late child outlives the original that started it");
    await refusedUnchanged(lateChild.journal, () => confirm(lateChild.journal), new RegExp(`descended from recorded PID ${originalIdentity.pid}`), "a child an original process started after the records");
  } finally {
    for (const p of handoff.processCensus().filter((p) => p.pid === wrapper || p.ppid === wrapper)) {
      console.log(`Stopping fixture process ${p.pid} under ${scratch}`);
      try { process.kill(p.pid); } catch {}
    }
  }
}
console.log("PASS: confirm-drained records the drain, who confirmed it and the evidence, and the checkpoint accepts it");

// A review that exited cleanly also takes the completion the drain failure
// kept the launcher from writing, once its posted report verifies, so the
// round completes and the journal finishes. Its plan is found by content.
const reviewed = fixture("launch-reviewed", { thread, planName: "handoff.plan", state: {} });
const offThread = await confirmWith(reviewed.journal, { census: quietCensus, env, readComment: () => ({ issue_url: thread.issueUrl.replace("1091", "1092"), body: `Report for ${head}` }) });
assert.equal(offThread.ended, "blocked", "a report that does not verify on the review thread leaves the completion unrecorded");
const result = await confirmWith(reviewed.journal, { census: quietCensus, env, readComment: goodComment });
assert.equal(result.ended, "finished", `a retry records the completion: ${result.reason ?? ""}`);
const rows = journalRows(reviewed.journal);
assert.equal(rows.filter((row) => row.event === "execution-drained").length, 1, "the drain is confirmed once");
const completed = rows.find((row) => row.event === "completed");
assert.deepEqual([completed.time, completed.reviewerId, completed.commentIds, completed.completedRound, completed.reviewedHead, completed.drainConfirmed], ["2026-10-20T21:43:00.000Z", "ax", [6302234332], 1, head, true], "the completion is dated at the reviewer's exit");
assert.deepEqual(roundState(readJournals(reviewed.jobDir)).blockers, [], "the round completes and nothing blocks the checkpoint");
await refusedUnchanged(reviewed.journal, () => confirm(reviewed.journal), /already confirmed/, "a finished journal");
console.log("PASS: a clean review blocked only by its drain completes once the drain is confirmed and its report verifies");

// A review is completed only on the launcher's own check of the reviewed
// head, worktree and install at the reviewer's exit. A journal from a
// launcher that predates that record keeps its drain confirmation, and the
// review is left to a retry.
const stateUnchecked = fixture("launch-unchecked", { thread, stateChecked: false });
const historical = await confirmWith(stateUnchecked.journal, { census: quietCensus, readComment: goodComment });
assert.equal(historical.confirmed.event, "execution-drained", "a historical journal's drain is still confirmed");
assert.match(historical.reason ?? "", /recorded no check of the reviewed head, worktree and install/, "a historical journal's review is not counted");
const stateChanged = fixture("launch-state-changed", { thread, stateRow: { installChanges: ["node_modules added 1 (added-by-review)"] } });
const changedState = await confirmWith(stateChanged.journal, { census: quietCensus, readComment: goodComment });
assert.match(changedState.reason ?? "", /left the reviewed head, worktree or install changed or unchecked/, "a recorded install change holds the completion even when the reason names only the drain");
// The launcher records that check when a clean review's drain fails, and a
// reviewer that changed the install is never completed.
{
  const OFF = readRepos((() => { const file = path.join(scratch, "repos-off.json"); fs.writeFileSync(file, JSON.stringify({ ...readRepos(), cutover: false })); return file; })());
  const repo = path.join(scratch, "exec-repo");
  fs.mkdirSync(repo);
  const repoGit = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(repo, ".agents", "skills", "drive-web-editor"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".agents", "skills", "drive-web-editor", "driver.mjs"), "");
  fs.mkdirSync(path.join(repo, "node_modules", "present"), { recursive: true });
  repoGit("init"); repoGit("add", "."); repoGit("commit", "-m", "execution fixture");
  const repoHead = repoGit("rev-parse", "HEAD").trim();
  const reviewerScript = path.join(scratch, "clean-reviewer.mjs");
  fs.writeFileSync(reviewerScript, `import fs from "node:fs"; let p=""; for await (const c of process.stdin) p+=c; if(p.startsWith("Reviewer route probe")){console.log("OK");process.exit(0);} if(process.argv.includes("--damage")) fs.mkdirSync("node_modules/added-by-review", { recursive: true }); process.exit(0);`);
  const jobs = path.join(scratch, "exec-repo.review-jobs", "pr-962", "round-1");
  fs.mkdirSync(jobs, { recursive: true });
  const prompt = path.join(jobs, "prompt.txt");
  fs.writeFileSync(prompt, "test fixture");
  const launched = async (name, damage) => {
    const journal = path.join(jobs, `launch-${name}`, "journal.jsonl");
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    const plan = path.join(path.dirname(journal), "plan.json");
    fs.writeFileSync(plan, JSON.stringify({ worktree: repo, pr: 962, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", completedReviewRound: 0, maxSteps: 1, first: "review", journal, steps: { review: { role: "review", round: 1, model: "reviewer-test", executable: process.execPath, args: [reviewerScript, "--model", "reviewer-test", ...(damage ? ["--damage"] : [])], prompt, next: [null], execution: [{ id: "ui", kind: "editor", maxRequests: 1, timeoutSeconds: 60 }] } } }));
    let session;
    const startExecution = async ({ directory }) => {
      session = path.join(directory, "editor-ui-x");
      fs.mkdirSync(session);
      fs.writeFileSync(path.join(session, "up.started.json"), JSON.stringify({ phase: "running", pid: upChild.pid, identity: upChild }));
      fs.utimesSync(path.join(session, "up.started.json"), recordedAt, recordedAt);
      return { environment: {}, close: async () => { throw new Error(`Editor shutdown unverified; preserve ${session} and inspect ${path.join(session, "down.log")}`); } };
    };
    await assert.rejects(handoff.runHandoff(plan, { repos: OFF, jobRoot: scratch, slotRoot: path.join(scratch, "exec-slots"), editorPreflight: async () => ({ passed: true, failing: [] }), startExecution }), /Editor shutdown unverified/, `${name}: the run ends blocked on the drain`);
    const rows = journalRows(journal);
    fs.writeFileSync(rows.find((row) => row.event === "launching").completion, JSON.stringify({ head: repoHead, next: null, commentIds: [123], summary: "Review complete." }));
    if (damage) fs.rmSync(path.join(repo, "node_modules", "added-by-review"), { recursive: true });
    return { journal, rows };
  };
  // The launcher runs in this process, so its coordinator identity is this
  // one; the confirmation is told it is gone.
  const gone = (pid) => (pid === process.pid ? null : probeStandIns(pid));
  const clean = await launched("clean", false);
  assert.deepEqual(clean.rows.filter((row) => row.event === "review-state-checked").map((row) => [row.headUnchanged, row.changedPaths, row.installChanges]), [[true, 0, []]], "a clean review's state is checked and journalled before the drain failure stops it");
  const cleanResult = await confirmWith(clean.journal, { identifyProcess: gone, census: quietCensus, readComment: (t, id) => ({ id, issue_url: t.issueUrl, body: `Report for ${repoHead}` }) });
  assert.equal(cleanResult.ended, "finished", `a clean review blocked only by its drain completes: ${cleanResult.reason ?? ""}`);
  const damaged = await launched("damaged", true);
  const checked = damaged.rows.find((row) => row.event === "review-state-checked");
  assert.match(checked.installChanges.join("; "), /node_modules added 1 \(added-by-review\)/, "the install change is journalled");
  assert.match(damaged.rows.at(-1).reason, /Review changed the reviewed install: node_modules added 1/, "the install change joins the blocked reason");
  const damagedResult = await confirmWith(damaged.journal, { identifyProcess: gone, census: quietCensus, readComment: (t, id) => ({ id, issue_url: t.issueUrl, body: `Report for ${repoHead}` }) });
  assert.equal(damagedResult.confirmed.event, "execution-drained", "the drain of a review that changed the install is still confirmed");
  assert.equal(damagedResult.ended, "blocked", "a review that changed the install is never completed");
  assert.equal(journalRows(damaged.journal).some((row) => row.event === "completed"), false);
}
console.log("PASS: a review is completed only on the launcher's own check of the reviewed head, worktree and install");

fs.rmSync(scratch, { recursive: true });
