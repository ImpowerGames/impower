import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processIdentity } from "./reviewer-slots.mjs";

const launcher = fileURLToPath(new URL("./agent-handoff.mjs", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-lock-"));
console.log(`Scratch repository: ${scratch}`);
const worktree = path.join(scratch, "repo");
fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
git("init");
git("commit", "--allow-empty", "-m", "fixture");
const lock = git("rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock").trim();
const jobDir = path.join(scratch, "repo.review-jobs", "pr-962", "round-1");
fs.mkdirSync(jobDir, { recursive: true });
const run = (...args) => spawnSync(process.execPath, [launcher, ...args], { encoding: "utf8", windowsHide: true });
const until = (predicate, what) => { const end = Date.now() + 60000; while (!predicate()) { if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } };

// A coordinator that dies abruptly while its child runs, as one killed with
// the session that started it, leaves its lock naming a dead process.
const capturedLock = path.join(scratch, "captured-lock.json");
const child = path.join(scratch, "kill-coordinator.mjs");
fs.writeFileSync(child, `import fs from "node:fs"; fs.copyFileSync(process.argv[2], process.argv[3]); process.kill(process.ppid); setTimeout(() => process.exit(0), 500);`);
const prompt = path.join(jobDir, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const plan = (journal) => {
  const file = path.join(jobDir, `${path.basename(journal, ".jsonl")}-plan.json`);
  fs.writeFileSync(file, JSON.stringify({ worktree, pr: 962, completedReviewRound: 0, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", maxSteps: 1, first: "only", journal, steps: {
    only: { role: "implement", model: "writer-test", executable: process.execPath, args: [child, lock, capturedLock, "--model", "writer-test"], prompt, next: [null] },
  } }));
  return file;
};
const journal = path.join(jobDir, "killed.jsonl");
run(plan(journal));
const recorded = JSON.parse(fs.readFileSync(capturedLock, "utf8"));
assert.equal(recorded.host, os.hostname(), "the lock records the host its coordinator runs on");
assert.equal(fs.readFileSync(lock, "utf8"), fs.readFileSync(capturedLock, "utf8"), "the killed coordinator leaves its lock behind");
const rows = fs.readFileSync(journal, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(rows.at(-1).event, "running", "the killed coordinator journals no exit for its child");
until(() => processIdentity(recorded.pid) === null && processIdentity(rows.at(-1).pid) === null, "the coordinator and its child to exit");
const relaunch = run(plan(path.join(jobDir, "relaunch.jsonl")));
assert.match(relaunch.stderr, /EEXIST.*recover-lock/, "the lock refusal names the recovery command");
const recovered = run("recover-lock", worktree);
assert.equal(recovered.status, 0, recovered.stderr);
const result = JSON.parse(recovered.stdout);
assert.equal(fs.existsSync(lock), false, "recovery removes the dead coordinator's lock");
assert.equal(path.dirname(result.copy), jobDir, "the copy is kept in the job directory beside the journal");
assert.equal(fs.readFileSync(result.copy, "utf8"), fs.readFileSync(capturedLock, "utf8"), "the kept copy is the lock as it was");
assert.deepEqual(JSON.parse(run("recover-lock", worktree).stdout), { alreadyAbsent: lock }, "a second recovery reports the absence");
console.log("PASS: a coordinator killed while its child runs leaves a lock that recover-lock removes once both are gone, keeping a copy beside the journal");

// The remaining states are built by hand, with the process probe replaced.
const { recoverHandoffLock } = await import("./agent-handoff.mjs");
const host = os.hostname();
const coordinator = { pid: 4242, start: "100" };
const childIdentity = { pid: 4343, start: "200" };
const fixtureJournal = path.join(jobDir, "fixture.jsonl");
const lockRecord = { pid: coordinator.pid, processIdentity: coordinator, host, startedAt: new Date().toISOString(), journal: fixtureJournal };
const launched = [{ event: "coordinator", pid: coordinator.pid, processIdentity: coordinator }, { event: "launching", index: 0, step: "review", role: "review" }];
const setup = (record, journalRows) => {
  fs.writeFileSync(lock, typeof record === "string" ? record : JSON.stringify(record));
  if (journalRows === null) fs.rmSync(fixtureJournal, { force: true });
  else fs.writeFileSync(fixtureJournal, journalRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
};
const probe = (live) => (pid) => live[pid] ?? null;
const refused = (label, record, journalRows, live, pattern) => {
  setup(record, journalRows);
  const before = fs.readFileSync(lock, "utf8");
  assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: probe(live), host }), pattern, label);
  assert.equal(fs.readFileSync(lock, "utf8"), before, `${label}: the lock is kept unchanged`);
};
const accepted = (label, record, journalRows, live) => {
  setup(record, journalRows);
  const result = recoverHandoffLock(worktree, { identifyProcess: probe(live), host });
  assert.ok(result.recovered && !fs.existsSync(lock), `${label}: the lock is removed`);
  assert.ok(fs.existsSync(result.copy), `${label}: its copy is kept`);
};

refused("a live coordinator", lockRecord, null, { [coordinator.pid]: coordinator }, /still running/);
refused("a lock written on another host", { ...lockRecord, host: "elsewhere" }, null, {}, /host elsewhere/);
refused("a lock without a source host", { ...lockRecord, host: undefined }, null, {}, /no source host/);
refused("a lock still being written", "", null, {}, /empty or unreadable/);
refused("a lock without an OS start identity", { ...lockRecord, processIdentity: undefined }, null, {}, /no OS start identity/);
refused("a child with its recorded identity still running", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity }], { [childIdentity.pid]: childIdentity }, /child \(PID 4343\) is still running/);
refused("a child PID in use with no recorded identity", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }], { [childIdentity.pid]: { pid: childIdentity.pid, start: "999" } }, /no OS start identity to tell reuse apart/);
refused("a reserved slot without a running row", lockRecord, [...launched, { event: "route-probed", index: 0 }, { event: "reserved", index: 0 }], {}, /may have spawned a child/);
refused("a child exit the coordinator reported unconfirmed", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "confirmed-absent", index: 0 }, { event: "blocked", reason: "child exit unconfirmed (PID 4343)" }], {}, /unconfirmed/);
refused("a journal naming another coordinator", lockRecord, [{ ...launched[0], processIdentity: { pid: 1, start: "1" } }], {}, /different coordinator/);
setup(lockRecord, null); fs.writeFileSync(fixtureJournal, "{\n");
assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: probe({}), host }), /journal .* is unreadable/, "a truncated journal row leaves a launched child uncertain");
assert.ok(fs.existsSync(lock), "a truncated journal keeps the lock");
setup(lockRecord, null);
assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: () => { throw new Error("Process start identity unavailable"); }, host }), /identity unavailable/, "an inaccessible identity is never read as absence");
assert.ok(fs.existsSync(lock), "an inaccessible identity keeps the lock");
console.log("PASS: recover-lock refuses live, foreign-host, unrecorded, half-written and uncertain-child states and keeps the lock");

accepted("a reused coordinator PID", lockRecord, null, { [coordinator.pid]: { pid: coordinator.pid, start: "101" } });
accepted("a coordinator gone before its journal", lockRecord, null, {});
accepted("a child whose exit was journalled", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0 }], { [childIdentity.pid]: childIdentity });
accepted("a child whose recorded identity is reused", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity }], { [childIdentity.pid]: { pid: childIdentity.pid, start: "201" } });
accepted("a coordinator that died waiting for a slot", lockRecord, [...launched, { event: "route-probed", index: 0 }, { event: "waiting", index: 0 }], {});
accepted("a child confirmed absent at registration", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "confirmed-absent", index: 0 }], {});
console.log("PASS: recover-lock removes the lock of a gone coordinator whose journal leaves no child that may run");

fs.rmSync(scratch, { recursive: true, force: true });
