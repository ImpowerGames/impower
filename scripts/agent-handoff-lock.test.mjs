import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { processIdentity } from "./reviewer-slots.mjs";
import { readRepos } from "../.agents/repos.mjs";

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
// A coordinator runs as its own process through a wrapper that pins the cutover
// switch off, from a copy of the repos file, and reports a refusal on stderr as
// the launcher does.
const reposFile = path.join(scratch, "repos-off.json");
fs.writeFileSync(reposFile, JSON.stringify({ ...readRepos(), cutover: false }));
const OFF = readRepos(reposFile);
const coordinatorWrapper = path.join(scratch, "coordinator.mjs");
fs.writeFileSync(coordinatorWrapper, `import { runHandoff } from ${JSON.stringify(pathToFileURL(launcher).href)}; runHandoff(process.argv[2], { repos: ${JSON.stringify(OFF)} }).catch((error) => { console.error(error.message); process.exitCode = 1; });`);
const coordinate = (planFile) => spawnSync(process.execPath, [coordinatorWrapper, planFile], { encoding: "utf8", windowsHide: true });
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
coordinate(plan(journal));
const recorded = JSON.parse(fs.readFileSync(capturedLock, "utf8"));
assert.equal(recorded.host, os.hostname(), "the lock records the host its coordinator runs on");
assert.equal(fs.readFileSync(lock, "utf8"), fs.readFileSync(capturedLock, "utf8"), "the killed coordinator leaves its lock behind");
const rows = fs.readFileSync(journal, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(rows.at(-1).event, "running", "the killed coordinator journals no exit for its child");
until(() => processIdentity(recorded.pid) === null && processIdentity(rows.at(-1).pid) === null, "the coordinator and its child to exit");
const relaunch = coordinate(plan(path.join(jobDir, "relaunch.jsonl")));
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
  assert.equal(fs.existsSync(marker), false, `${label}: the recovery marker is removed`);
};
const accepted = (label, record, journalRows, live) => {
  setup(record, journalRows);
  const result = recoverHandoffLock(worktree, { identifyProcess: probe(live), host });
  assert.ok(result.recovered && !fs.existsSync(lock), `${label}: the lock is removed`);
  assert.ok(fs.existsSync(result.copy), `${label}: its copy is kept`);
  assert.equal(fs.existsSync(marker), false, `${label}: the recovery marker is removed`);
};
const marker = `${lock}.recovery`;

refused("a live coordinator", lockRecord, null, { [coordinator.pid]: coordinator }, /still running/);
refused("a lock written on another host", { ...lockRecord, host: "elsewhere" }, null, {}, /host elsewhere/);
refused("a lock without a source host", { ...lockRecord, host: undefined }, null, {}, /no source host/);
refused("a lock still being written", "", null, {}, /empty or unreadable/);
refused("a lock without an OS start identity", { ...lockRecord, processIdentity: undefined }, null, {}, /no OS start identity/);
refused("a child with its recorded identity still running", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity }], { [childIdentity.pid]: childIdentity }, /child \(PID 4343\) is still running/);
refused("a child PID in use with no recorded identity", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }], { [childIdentity.pid]: { pid: childIdentity.pid, start: "999" } }, /no OS start identity to tell reuse apart/);
refused("a reserved slot without a running row", lockRecord, [...launched, { event: "route-probed", index: 0 }, { event: "reserved", index: 0 }], {}, /may have spawned a child/);
refused("a child exit the coordinator reported unconfirmed", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "confirmed-absent", index: 0 }, { event: "blocked", reason: "child exit unconfirmed (PID 4343)" }], {}, /unconfirmed/);
refused("a malformed recorded child identity", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity: { pid: childIdentity.pid } }], { [childIdentity.pid]: childIdentity }, /malformed OS identity/);
refused("a recorded child identity naming another PID", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity: { pid: 4444, start: "200" } }], { [childIdentity.pid]: childIdentity }, /malformed OS identity/);
refused("an empty journal", lockRecord, [], {}, /is empty/);
refused("a delegated execution service whose shutdown failed", lockRecord, [...launched, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0, executionDrained: false }, { event: "blocked", reason: "Editor shutdown unverified" }], {}, /shutdown failed or was not recorded/);
refused("a drain confirmation recorded before the exit row", lockRecord, [...launched, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "execution-drained", index: 0 }, { event: "exited", index: 0, code: 0, executionDrained: false }, { event: "blocked", reason: "Editor shutdown unverified" }], {}, /confirm-drained/);
refused("a delegated execution service whose exit row records no drain", lockRecord, [...launched, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0 }], {}, /shutdown failed or was not recorded/);
refused("a delegated execution service without a journalled exit", lockRecord, [...launched, { event: "route-probed", index: 0 }, { event: "reserved", index: 0 }, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "confirmed-absent", index: 0 }], {}, /delegated execution service/);
refused("a launch without a step index", lockRecord, [launched[0], { event: "launching", step: "review" }, { event: "exited", code: 0 }], {}, /without a step index/);
refused("a journal naming another coordinator", lockRecord, [{ ...launched[0], processIdentity: { pid: 1, start: "1" } }], {}, /different coordinator/);
setup(lockRecord, null); fs.writeFileSync(fixtureJournal, "{\n");
assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: probe({}), host }), /journal .* is unreadable/, "a truncated journal row leaves a launched child uncertain");
assert.ok(fs.existsSync(lock), "a truncated journal keeps the lock");
setup(lockRecord, null);
assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: () => { throw new Error("Process start identity unavailable"); }, host }), /identity unavailable/, "an inaccessible identity is never read as absence");
assert.ok(fs.existsSync(lock), "an inaccessible identity keeps the lock");
// A second recovery, or one interrupted, holds the marker: recovery refuses
// and leaves both in place, and a coordinator that takes the free lock
// meanwhile gives it up again before writing a journal.
setup(lockRecord, null); fs.writeFileSync(marker, "{}");
assert.throws(() => recoverHandoffLock(worktree, { identifyProcess: probe({}), host }), /Recovery marker exists/, "a held marker refuses recovery");
assert.ok(fs.existsSync(lock) && fs.existsSync(marker), "a held marker keeps the lock and the marker");
fs.unlinkSync(lock);
const blockedJournal = path.join(jobDir, "during-recovery.jsonl");
const duringRecovery = coordinate(plan(blockedJournal));
assert.match(duringRecovery.stderr, /lock recovery is running/, "a coordinator refuses a lock taken while a recovery runs");
assert.ok(!fs.existsSync(lock) && !fs.existsSync(blockedJournal), "the refused coordinator gives the lock up before writing a journal");
fs.unlinkSync(marker);
console.log("PASS: recover-lock refuses live, foreign-host, unrecorded, half-written and uncertain-child states and keeps the lock");

accepted("a reused coordinator PID", lockRecord, null, { [coordinator.pid]: { pid: coordinator.pid, start: "101" } });
accepted("a coordinator gone before its journal", lockRecord, null, {});
accepted("a child whose exit was journalled", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0 }], { [childIdentity.pid]: childIdentity });
accepted("a child whose recorded identity is reused", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "identified", index: 0, childIdentity }], { [childIdentity.pid]: { pid: childIdentity.pid, start: "201" } });
accepted("a delegated execution service drained before the child's exit row", lockRecord, [...launched, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0, executionDrained: true }], {});
accepted("a failed drain that confirm-drained confirmed afterwards", lockRecord, [...launched, { event: "execution-service", index: 0, directory: "execution-x" }, { event: "running", index: 0, pid: childIdentity.pid }, { event: "exited", index: 0, code: 0, executionDrained: false }, { event: "probe-checkouts-removed", index: 0 }, { event: "blocked", reason: "Editor shutdown unverified" }, { event: "execution-drained", index: 0 }, { event: "finished" }], {});
accepted("a coordinator that died waiting for a slot", lockRecord, [...launched, { event: "route-probed", index: 0 }, { event: "waiting", index: 0 }], {});
accepted("a child confirmed absent at registration", lockRecord, [...launched, { event: "running", index: 0, pid: childIdentity.pid }, { event: "confirmed-absent", index: 0 }], {});
console.log("PASS: recover-lock removes the lock of a gone coordinator whose journal leaves no child that may run");

// The launcher itself writes executionDrained on the exit row only once the
// delegated service has closed, and false when the close fails; recovery
// accepts the first journal and refuses the second.
{
  const { runHandoff: actualRunHandoff } = await import("./agent-handoff.mjs");
  const runHandoff = (file, options) => actualRunHandoff(file, { repos: OFF, ...options });
  const repo = path.join(scratch, "exec-repo");
  fs.mkdirSync(path.join(repo, ".agents", "skills", "drive-web-editor"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".agents", "skills", "drive-web-editor", "driver.mjs"), "");
  const repoGit = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
  repoGit("init"); repoGit("add", "."); repoGit("commit", "-m", "execution fixture");
  const repoLock = repoGit("rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock").trim();
  const reviewer = path.join(scratch, "exiting-reviewer.mjs");
  fs.writeFileSync(reviewer, `let p=""; for await (const c of process.stdin) p+=c; if(p.startsWith("Reviewer route probe")){console.log("OK");process.exit(0);} process.exit(1);`);
  const execJobs = path.join(scratch, "repo.review-jobs", "pr-962", "round-2");
  fs.mkdirSync(execJobs, { recursive: true });
  const execPrompt = path.join(execJobs, "prompt.txt");
  fs.writeFileSync(execPrompt, "test fixture");
  for (const fails of [false, true]) {
    const name = fails ? "failed-drain" : "drained";
    const execJournal = path.join(execJobs, `${name}.jsonl`);
    const planFile = path.join(execJobs, `${name}.json`);
    fs.writeFileSync(planFile, JSON.stringify({ worktree: repo, pr: 962, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", completedReviewRound: 0, maxSteps: 1, first: "review", journal: execJournal, steps: { review: { role: "review", round: 1, model: "reviewer-test", executable: process.execPath, args: [reviewer, "--model", "reviewer-test"], prompt: execPrompt, next: [null], execution: [{ id: "ui", kind: "editor", maxRequests: 1, timeoutSeconds: 60 }] } } }));
    let exitedBeforeDrain;
    const startExecution = async () => ({ environment: {}, close: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      exitedBeforeDrain = fs.readFileSync(execJournal, "utf8").includes('"event":"exited"');
      if (fails) throw new Error("Editor shutdown unverified");
    } });
    await assert.rejects(runHandoff(planFile, { jobRoot: scratch, slotRoot: path.join(scratch, "exec-slots"), editorPreflight: async () => ({ passed: true, failing: [] }), startExecution }), fails ? /Editor shutdown unverified/ : /exit|failed/, `${name}: the run ends blocked`);
    assert.equal(exitedBeforeDrain, false, `${name}: the exit row waits for the service to finish closing`);
    const execRows = fs.readFileSync(execJournal, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(execRows.find((row) => row.event === "exited").executionDrained, !fails, `${name}: the exit row records whether the service drained`);
    // Treat the run's coordinator as dead and its lock as left behind.
    const ran = execRows.find((row) => row.event === "coordinator").processIdentity;
    fs.writeFileSync(repoLock, JSON.stringify({ pid: ran.pid, processIdentity: ran, host, startedAt: new Date().toISOString(), journal: execJournal }));
    if (fails) {
      assert.throws(() => recoverHandoffLock(repo, { identifyProcess: probe({}), host }), /shutdown failed or was not recorded/, "a failed drain refuses recovery");
      assert.ok(fs.existsSync(repoLock), "a failed drain keeps the lock");
      fs.unlinkSync(repoLock);
    } else {
      assert.ok(recoverHandoffLock(repo, { identifyProcess: probe({}), host }).recovered, "a clean drain lets recovery proceed");
    }
  }
}
console.log("PASS: the launcher records executionDrained only after the delegated service closes, and recovery refuses a failed drain");

// A filesystem failure after the lock is moved aside puts the record back;
// when even that fails, the marker stays so no coordinator takes the worktree.
const faulted = (overrides, act) => {
  const saved = Object.fromEntries(Object.keys(overrides).map((name) => [name, fs[name]]));
  Object.assign(fs, Object.fromEntries(Object.entries(overrides).map(([name, wrap]) => [name, wrap(saved[name])])));
  try { return act(); } finally { Object.assign(fs, saved); }
};
const failOnClaimed = (code) => (original) => (file, ...rest) => { if (String(file).includes(".recovering-")) throw Object.assign(new Error(`${code}: injected`), { code }); return original(file, ...rest); };
const copies = () => fs.readdirSync(jobDir).filter((name) => name.startsWith("agent-handoff.lock.recovered-")).length;
const claimedAside = () => fs.readdirSync(path.dirname(lock)).filter((name) => name.includes(".recovering-"));
for (const [label, overrides, pattern] of [
  ["a failed read-back of the claimed record", { readFileSync: failOnClaimed("EIO") }, /could not be read back/],
  ["a failed copy", { copyFileSync: failOnClaimed("ENOSPC") }, /copy could not be kept/],
]) {
  setup(lockRecord, null);
  const before = fs.readFileSync(lock, "utf8"), kept = copies();
  assert.throws(() => faulted(overrides, () => recoverHandoffLock(worktree, { identifyProcess: probe({}), host })), pattern, label);
  assert.equal(fs.readFileSync(lock, "utf8"), before, `${label}: the lock is put back unchanged`);
  assert.equal(fs.existsSync(marker), false, `${label}: the recovery marker is removed once the lock is back`);
  assert.equal(copies(), kept, `${label}: no copy is claimed`);
  assert.deepEqual(claimedAside(), [], `${label}: no claimed record is left aside`);
}
setup(lockRecord, null);
const unrestored = fs.readFileSync(lock, "utf8");
const failLink = () => () => { throw Object.assign(new Error("EIO: injected"), { code: "EIO" }); };
assert.throws(() => faulted({ readFileSync: failOnClaimed("EIO"), linkSync: failLink }, () => recoverHandoffLock(worktree, { identifyProcess: probe({}), host })), /restoring it failed.*marker .* is kept/, "a failed restore keeps the marker");
const aside = claimedAside();
assert.equal(aside.length, 1, "the unrestored record stays aside");
assert.equal(fs.readFileSync(path.join(path.dirname(lock), aside[0]), "utf8"), unrestored, "the record aside is the lock as it was");
assert.ok(!fs.existsSync(lock) && fs.existsSync(marker), "the marker keeps protecting the worktree while its lock is aside");
const whileAside = path.join(jobDir, "while-aside.jsonl");
assert.match(coordinate(plan(whileAside)).stderr, /lock recovery is running/, "a coordinator refuses the worktree while a record is aside");
assert.ok(!fs.existsSync(lock) && !fs.existsSync(whileAside), "the refused coordinator leaves no lock or journal");
fs.unlinkSync(path.join(path.dirname(lock), aside[0])); fs.unlinkSync(marker);
console.log("PASS: a failure after the lock is moved aside puts it back, and a failed restore keeps the recovery marker");

fs.rmSync(scratch, { recursive: true, force: true });
