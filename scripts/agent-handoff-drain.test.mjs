// A delegated editor shutdown recorded as not drained (I-1395): the driver's
// `down` keeps a nonzero taskkill exit a failure unless the whole tree is
// gone, and confirm-drained settles a journal whose drain was recorded false
// once nothing of its service runs, which the checkpoint then accepts.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processIdentity } from "./reviewer-slots.mjs";
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
if (process.platform === "win32") {
  const table = await driver.windowsProcessTable();
  const self = table.find((row) => row.pid === process.pid);
  assert.ok(self && self.ppid === process.ppid && /^\d+$/.test(self.start), "the Windows census lists this process with its parent and creation time");
}
console.log("PASS: the tree census names a member still running, a child started after it, and nothing else");

// --- confirm-drained ----------------------------------------------------------

// A process that has exited, with the identity it had while it ran.
const exitedProcess = async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore", windowsHide: true });
  const identity = processIdentity(child.pid);
  await new Promise((resolve) => child.once("exit", resolve));
  const end = Date.now() + 30000;
  while (processIdentity(child.pid) !== null) { if (Date.now() > end) throw new Error(`PID ${child.pid} never disappeared`); await new Promise((resolve) => setTimeout(resolve, 100)); }
  assert.ok(identity, "the stand-in process was identified while it ran");
  return identity;
};
const [launcherGone, upChild, server] = await Promise.all([exitedProcess(), exitedProcess(), exitedProcess()]);
const head = "85c2ec9b2930617de3da95c4e78da826498855c4";

// A launch directory as the launcher leaves it after a drain recorded false:
// the journal, its plan, the completion artifact and the editor session's
// started records and down.log.
const fixture = (name, { thread, coordinator = launcherGone } = {}) => {
  const launchDir = path.join(scratch, name, "round-1", "launch-ax-1");
  const execution = path.join(launchDir, "handoff-0-review", "execution-x");
  const session = path.join(execution, "editor-author-x");
  fs.mkdirSync(session, { recursive: true });
  fs.writeFileSync(path.join(session, "up.started.json"), JSON.stringify({ phase: "running", pid: upChild.pid, identity: upChild }));
  fs.writeFileSync(path.join(session, "down.log"), `SUCCESS: The process with PID ${server.pid} (child process of PID ${upChild.pid}) has been terminated.\ncould not stop pid ${server.pid} (exit 255); the record is kept\n`);
  const journal = path.join(launchDir, "journal.jsonl");
  const completion = path.join(launchDir, "completion.json");
  fs.writeFileSync(completion, JSON.stringify({ head, next: null, commentIds: [6302234332], summary: "Author-experience review complete; no findings." }));
  fs.writeFileSync(path.join(launchDir, "plan.json"), JSON.stringify({ journal, steps: { "review-ax": { role: "review", next: [null] } } }));
  const at = (s) => `2026-10-20T21:${String(s).padStart(2, "0")}:00.000Z`;
  const rows = [
    { time: at(37), event: "coordinator", pid: coordinator.pid, processIdentity: coordinator, ...(thread ? { thread } : {}) },
    { time: at(37), event: "launching", index: 0, step: "review-ax", role: "review", round: 1, reviewerId: "ax", attempt: 1, plannedReviewers: ["ax"], completedRound: 0, reviewedHead: null, completedRoundReviews: null, completedRoundReviewers: null, plannedRoundReviewers: null, finalCorrections: false, head, completion },
    { time: at(37), event: "reserved", index: 0 },
    { time: at(37), event: "execution-service", index: 0, head, directory: execution, operations: [{ id: "author", kind: "editor" }] },
    { time: at(37), event: "running", index: 0, step: "review-ax", pid: 1, head },
    { time: at(43), event: "exited", index: 0, step: "review-ax", code: 0, signal: null, executionDrained: false },
    { time: at(43), event: "probe-checkouts-removed", index: 0, step: "review-ax" },
    { time: at(43), event: "blocked", reason: `Editor shutdown unverified; preserve ${session} and inspect ${path.join(session, "down.log")}` },
  ];
  fs.writeFileSync(journal, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { journal, execution, session, jobDir: path.join(scratch, name) };
};
const confirm = (journal) => spawnSync(process.execPath, [launcher, "confirm-drained", journal], { encoding: "utf8", windowsHide: true });
const unchanged = (journal, run, pattern, label) => {
  const before = fs.readFileSync(journal, "utf8");
  assert.notEqual(run.status, 0, `${label}: confirm-drained refuses`);
  assert.match(run.stderr, pattern, `${label}: ${run.stderr}`);
  assert.equal(fs.readFileSync(journal, "utf8"), before, `${label}: the journal is unchanged`);
};

const plain = fixture("launch-plain");
assert.ok(roundState(readJournals(plain.jobDir)).blockers.some((b) => /shutdown is not confirmed \(executionDrained false\)/.test(b)), "the checkpoint refuses the journal before the confirmation");

// A live process holds the confirmation: one naming the execution
// directory, one whose recorded identity still runs, and one a down.log names.
const live = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", plain.execution], { stdio: "ignore", windowsHide: true });
try {
  const liveIdentity = processIdentity(live.pid);
  unchanged(plain.journal, confirm(plain.journal), /name the execution directory/, "a process naming the execution directory");
  const started = path.join(plain.session, "attempt.started.json");
  fs.writeFileSync(started, JSON.stringify({ phase: "running", pid: live.pid, identity: liveIdentity }));
  const { confirmExecutionDrained } = await import("./agent-handoff.mjs");
  const quietCensus = () => [{ pid: process.pid, commandLine: "node" }];
  await assert.rejects(confirmExecutionDrained(plain.journal, { census: quietCensus }), /recorded in .*attempt\.started\.json, is still running/, "a recorded identity still running refuses");
  fs.rmSync(started);
  const laterLog = path.join(plain.session, "retry", "down.log");
  fs.mkdirSync(path.dirname(laterLog));
  fs.writeFileSync(laterLog, `ERROR: The process with PID ${live.pid} could not be terminated.\n`);
  await assert.rejects(confirmExecutionDrained(plain.journal, { census: quietCensus }), /named in .*down\.log, is in use by a process that may predate that log/, "a down.log PID still in use refuses");
  fs.rmSync(path.dirname(laterLog), { recursive: true });
  await assert.rejects(confirmExecutionDrained(plain.journal, { census: () => { throw new Error("CIM unavailable"); } }), /process census failed \(CIM unavailable\)/, "a census that fails refuses");
  await assert.rejects(confirmExecutionDrained(plain.journal, { census: quietCensus, identifyProcess: () => { throw new Error("Process start identity unavailable"); } }), /cannot be probed|start identity/, "an identity probe that fails refuses");
} finally { live.kill(); }
await new Promise((resolve) => (live.exitCode !== null || live.signalCode !== null ? resolve() : live.once("exit", resolve)));
const running = fixture("launch-running", { coordinator: processIdentity(process.pid) });
unchanged(running.journal, confirm(running.journal), /launcher \(PID \d+\) is still running/, "a launcher still running");
console.log("PASS: confirm-drained refuses while any process of the service may run, and writes nothing");

// With nothing left, the CLI records the drain with its evidence. This
// journal names no review thread, so the completion cannot be recorded and
// the journal ends blocked, with the drain confirmed.
const settled = confirm(plain.journal);
assert.equal(settled.status, 0, settled.stderr);
const rows = fs.readFileSync(plain.journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
const drained = rows.find((row) => row.event === "execution-drained");
assert.ok(drained && drained.index === 0 && drained.directory === plain.execution, "the confirmation names the launch and its execution directory");
assert.equal(drained.confirmedBy.host, os.hostname(), "the confirmation records who confirmed it");
assert.deepEqual(drained.census.identities.map((entry) => [entry.pid, entry.state]), [[upChild.pid, "absent"]], "the census evidence lists each recorded identity");
assert.deepEqual(drained.census.pids.map((entry) => entry.pid).sort((a, b) => a - b), [server.pid, upChild.pid].sort((a, b) => a - b), "the census evidence lists each down.log PID");
assert.equal(drained.census.namingDirectory, 0);
assert.match(rows.at(-1).reason ?? "", /Drain confirmed; the review completion was not recorded: its coordinator row names no review thread/);
const state = roundState(readJournals(plain.jobDir));
assert.ok(!state.blockers.some((b) => /shutdown is not confirmed/.test(b)), `the checkpoint accepts the confirmed drain: ${state.blockers.join("; ")}`);
unchanged(plain.journal, confirm(plain.journal), /already confirmed/, "a second confirmation");
console.log("PASS: confirm-drained records the drain, who confirmed it and the census, and the checkpoint accepts it");

// A review that exited cleanly also takes the completion the drain failure
// kept the launcher from writing, once its posted report verifies, so the
// round completes and the journal finishes.
const thread = { repo: "ImpowerGames/impower-internal", number: 1091, issueUrl: "https://api.github.com/repos/ImpowerGames/impower-internal/issues/1091" };
const reviewed = fixture("launch-reviewed", { thread });
const { confirmExecutionDrained } = await import("./agent-handoff.mjs");
const quiet = () => [{ pid: process.pid, commandLine: "node" }];
const wrongThread = fixture("launch-wrong-thread", { thread });
const elsewhere = await confirmExecutionDrained(wrongThread.journal, { census: quiet, readComment: () => ({ issue_url: thread.issueUrl.replace("1091", "1092"), body: `Report for ${head}` }) });
assert.equal(elsewhere.ended, "blocked", "a report that does not verify on the review thread leaves the completion unrecorded");
const result = await confirmExecutionDrained(reviewed.journal, { census: quiet, readComment: (t, id) => ({ id, issue_url: t.issueUrl, body: `Report for ${head}` }) });
assert.equal(result.ended, "finished");
const completed = fs.readFileSync(reviewed.journal, "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((row) => row.event === "completed");
assert.deepEqual([completed.time, completed.reviewerId, completed.commentIds, completed.completedRound, completed.reviewedHead, completed.drainConfirmed], ["2026-10-20T21:43:00.000Z", "ax", [6302234332], 1, head, true], "the completion is dated at the reviewer's exit");
assert.deepEqual(roundState(readJournals(reviewed.jobDir)).blockers, [], "the round completes and nothing blocks the checkpoint");
console.log("PASS: a clean review blocked only by its drain completes once the drain is confirmed and its report verifies");

fs.rmSync(scratch, { recursive: true });
