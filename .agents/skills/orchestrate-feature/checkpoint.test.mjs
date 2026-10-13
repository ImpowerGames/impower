// Exercises portable checkpoints of a Feature run across two clones of one
// scratch remote: discovery from the Feature number, takeover by a destination
// with none of the source's private files, competing and stale updates, an
// interrupted status comment, uncertain launches and merges settled from
// GitHub, foreign-host evidence, a planned handoff with a work-in-progress
// snapshot beside a review freeze, abrupt loss of unpublished work, and
// credential refusal. GitHub's comments are an in-memory stand-in; the remote
// is a real bare repository under the system temp directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { reserveFreeze, worktreePaths, assertFrozen } from "../../../scripts/review-job-store.mjs";
import { jobRootOf } from "../../../scripts/review-job-root.mjs";
import * as run from "./feature-run.mjs";
import * as cp from "./checkpoint.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-")));
console.log(`scratch: ${tmp}`);
const defaults = run.readWriterDefaults();
const GB = 2 ** 30;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };
const SRC = "src-host", DST = "dst-host";

// GitHub's issue comments, with injectable failures.
function fakeGithub() {
  const comments = new Map(), fail = { update: 0, create: 0 };
  let next = 1000;
  const shape = (id) => ({ id, body: comments.get(id).body, url: `https://github.com/acme/widgets/issues/${comments.get(id).issue}#issuecomment-${id}` });
  return {
    comments, fail,
    list: (issue) => [...comments.keys()].filter((id) => comments.get(id).issue === issue).map(shape),
    get: (id) => { if (!comments.has(id)) throw new Error("HTTP 404"); return shape(id); },
    create: (issue, body) => { if (fail.create > 0) { fail.create--; throw new Error("HTTP 502"); } const id = next++; comments.set(id, { issue, body }); return shape(id); },
    update: (id, body) => { if (fail.update > 0) { fail.update--; throw new Error("HTTP 502"); } comments.get(id).body = body; return shape(id); },
  };
}

const ticket = (number, more = {}) => ({ number, title: `ticket ${number}`, state: "open", parent: 500, container: false, effort: "Medium", delivered: false, blockers: [], prs: [], worktrees: [], ...more });
const available = (route, numbers) => ({ route, model: "claude-opus-5-5", verdicts: numbers.map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) });

try {
  // One bare remote; the source clone holds the coordinator's private
  // directory and its writers' worktrees.
  const remote = path.join(tmp, "remote.git");
  git(tmp, "init", "-q", "--bare", "-b", "main", remote);
  const clone = (name) => {
    const dir = path.join(tmp, name);
    git(tmp, "clone", "-q", remote, dir);
    for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["core.autocrlf", "false"]]) git(dir, "config", k, v);
    return dir;
  };
  const src = clone("src");
  fs.writeFileSync(path.join(src, "README.md"), "base\n");
  fs.writeFileSync(path.join(src, ".gitignore"), "*.log\n");
  git(src, "add", "-A");
  git(src, "commit", "-q", "-m", "base");
  git(src, "push", "-q", "origin", "main");
  const srcPrivate = path.join(tmp, "src-private");
  fs.mkdirSync(srcPrivate);
  const github = fakeGithub();

  const init = (feature, coordinator, extra = {}) => {
    const record = path.join(srcPrivate, `run-${feature}.json`);
    run.initRecord({ record, checkout: src, repository: "acme/widgets", feature, coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: `Use orchestrate-feature for #${feature}.`, ...extra }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
    return record;
  };
  const rev = (file) => run.readRecord(file).revision;
  const mutate = (file, coordinator, fn) => run.updateRecord(file, { expectRevision: rev(file), coordinator }, fn);
  // A writer started on the source: claimed from a plan, its worktree made as
  // resolve-issue would, and confirmed as a desktop session on the source.
  const startWriter = (file, coordinator, snapshot, number, slug) => {
    const plan = run.planDispatch({ record: run.readRecord(file), snapshot, turn: "user", preflights: [available("claude-desktop", snapshot.tickets.map((t) => t.number))], freeBytes: 100 * GB, defaults, host: SRC });
    const planFile = write(`plan-${number}-${Date.now()}.json`, plan);
    const worktree = path.join(tmp, `src-wt-${number}`);
    mutate(file, coordinator, (r) => run.claim(r, { plan: planFile, ticket: number, worktree, branch: `feat/${number}-${slug}`, artifactParent: srcPrivate, host: SRC }));
    git(src, "worktree", "add", "-q", "-b", `feat/${number}-${slug}`, worktree, "main");
    mutate(file, coordinator, (r) => run.launched(r, { ticket: number, handleKind: "session", handle: `local_w${number}`, host: SRC }));
    return worktree;
  };

  // --- Feature 500: automatic checkpoints, abrupt loss, takeover ----------

  const rec500 = init(500, "local_src");
  const enabled = cp.enable(rec500, { coordinator: "local_src", expectRevision: 1, github, host: SRC });
  assert.equal(enabled.checkpoint.saved, true);
  assert.equal(enabled.checkpoint.seq, 1);
  assert.equal(enabled.checkpoint.summary.state, "synced");
  assert.equal(git(src, "ls-remote", "origin", "refs/heads/orchestrate-state/feature-500").split("\t")[0], enabled.checkpoint.commit, "the checkpoint is on the remote state branch");
  const status = [...github.comments.values()].find((c) => c.issue === 500);
  assert.match(status.body, /orchestrate-feature status: feature 500/);
  assert.match(status.body, new RegExp(`checkpoint seq=1 commit=${enabled.checkpoint.commit}`));
  assert.ok(!git(src, "branch", "--list").includes("orchestrate-state"), "the state branch is not checked out or listed locally");

  // A second run of the same Feature is refused; it must take over instead.
  const rival = path.join(srcPrivate, "rival.json");
  fs.copyFileSync(rec500, rival);
  const rivalRecord = run.readRecord(rival);
  fs.writeFileSync(rival, JSON.stringify({ ...rivalRecord, coordinator: { ...rivalRecord.coordinator, session: "local_rival" } }));
  assert.throws(() => cp.enable(rival, { coordinator: "local_rival", expectRevision: 1, github, host: SRC }), /already has checkpoint 1 by coordinator local_src.*resume/);

  const snap500 = { repository: "acme/widgets", feature: { number: 500, state: "open" }, originMain: "x", observedAt: "2026-10-12T00:00:00Z", tickets: [ticket(501), ticket(502), ticket(503, { prs: [{ number: 603, state: "OPEN", isDraft: true, branch: "feat/503-gamma", head: "a".repeat(40), rounds: 1 }] }), ticket(504)] };
  // #501's start is claimed and its intent saved; the source stops before its
  // outcome (the abrupt interruption at dispatch).
  const plan501 = write("plan-501.json", run.planDispatch({ record: run.readRecord(rec500), snapshot: snap500, turn: "user", preflights: [available("claude-cli", [501, 502, 504])], freeBytes: 100 * GB, defaults, host: SRC }));
  mutate(rec500, "local_src", (r) => run.claim(r, { plan: plan501, ticket: 501, worktree: path.join(tmp, "src-wt-501"), branch: "feat/501-alpha", artifactParent: srcPrivate, host: SRC }));
  assert.equal(run.readRecord(rec500).tickets[501].pending.host, SRC, "the claim records the host it was made on");
  // The maintainer delegated merging to this coordinator; a takeover does not
  // inherit that grant.
  mutate(rec500, "local_src", (r) => { r.authority = { ...r.authority, merge: "delegated by the maintainer to local_src" }; });
  const intentSaved = cp.ensureSaved(rec500, { coordinator: "local_src", github, host: SRC });
  assert.equal(intentSaved.saved, true, "the intent is saved before the writer would start");
  assert.equal(cp.ensureSaved(rec500, { coordinator: "local_src", github, host: SRC }).seq, intentSaved.seq, "an intent already saved is not published again");

  // #502's writer has unfinished files: a modified file, a staged file, an
  // untracked file and an ignored log; none of it is pushed.
  const wt502 = startWriter(rec500, "local_src", snap500, 502, "beta");
  fs.writeFileSync(path.join(wt502, "README.md"), "base\nedited by the writer\n");
  fs.writeFileSync(path.join(wt502, "staged.txt"), "staged\n");
  git(wt502, "add", "staged.txt");
  fs.writeFileSync(path.join(wt502, "new.txt"), "untracked\n");
  fs.writeFileSync(path.join(wt502, "debug.log"), "ignored\n");

  // #503's adopted PR completed a review round awaiting adjudication, and its
  // review launcher left a handoff lock.
  const wt503 = path.join(tmp, "src-wt-503");
  git(src, "worktree", "add", "-q", "-b", "feat/503-gamma", wt503, "main");
  const adoptPlan = write("plan-503.json", run.planDispatch({ record: run.readRecord(rec500), snapshot: { ...snap500, tickets: snap500.tickets.map((t) => (t.number === 503 ? { ...t, worktrees: [{ path: wt503, branch: "feat/503-gamma", head: "x" }] } : t)) }, turn: "user", preflights: [], freeBytes: 100 * GB, defaults, host: SRC }));
  mutate(rec500, "local_src", (r) => run.adopt(r, { plan: adoptPlan, ticket: 503, handleKind: "session", handle: "local_w503", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: wt503, host: SRC }));
  const jobDir = path.join(jobRootOf(src), "pr-603", "round-1", "launch-undirected-1");
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, "journal.jsonl"), [
    { event: "coordinator", processIdentity: { pid: 1, start: "1" } },
    { event: "completed", completedRound: 1, reviewerId: "undirected", attempt: 1, reviewedHead: "a".repeat(40), completedRoundReviews: 1, completedRoundReviewers: { undirected: 1 }, plannedRoundReviewers: ["undirected"], pendingReviewers: [], finalCorrections: false, commentIds: [77] },
    { event: "finished" },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(worktreePaths(wt503).lock, JSON.stringify({ host: SRC, processIdentity: { pid: 4242, start: "9" }, journal: path.join(jobDir, "journal.jsonl") }));
  // The writer's report, with its reviewed head and rounds, is in the record.
  const report = write("report-503.json", { model: "claude-opus-5-5", effort: "medium", pr: 603, reviewedHead: "a".repeat(40), rounds: { "gpt-6.1-sol": 1 }, findings: "two blocking, awaiting adjudication", verification: "red/green", ci: "pending", next: "adjudicate round 1" });
  mutate(rec500, "local_src", (r) => run.result(r, { ticket: 503, report }));
  // The source recorded its intent to merge another PR and stopped before the
  // outcome.
  const mergeHead = "b".repeat(40);
  mutate(rec500, "local_src", (r) => cp.intent(r, { kind: "merge", ticket: 504, pr: 604, expectHead: mergeHead }));
  const auto = cp.autoCheckpoint(rec500, { coordinator: "local_src", transition: "intent to merge PR #604", github, host: SRC });
  assert.equal(auto.saved, true);
  const saved = JSON.parse(git(src, "show", `${auto.commit}:checkpoint.json`));
  assert.equal(saved.tickets[501].pending.host, SRC, "a pending start names the host that claimed it");
  assert.deepEqual([saved.work[502].dirty, saved.work[502].unpushed], [true, true], "the inventory knows #502's work exists only on the source");
  assert.equal(saved.work[503].reviewJobs[0].pendingReviewers.length, 0);
  assert.deepEqual(saved.work[503].reviewJobs[0].completedRoundReviewers, { undirected: 1 }, "the planned-reviewer accounting of the round is carried");
  assert.equal(saved.work[503].handoffLock.host, SRC);
  assert.equal(saved.operations[0].state, "intent");
  assert.ok(!JSON.stringify(saved).includes("ignored\\n"), "file contents are never copied into the record");

  // Interrupted summary: the checkpoint saves, the comment update fails.
  github.fail.update = 1;
  mutate(rec500, "local_src", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  const interrupted = cp.autoCheckpoint(rec500, { coordinator: "local_src", transition: "a note", github, host: SRC });
  assert.equal(interrupted.saved, true, "a failed summary does not undo a saved checkpoint");
  assert.equal(interrupted.summary.state, "failed");
  assert.match(interrupted.summary.repair, /sync-summary/);
  const lastSeq = interrupted.seq;
  const logLength = run.readRecord(rec500).log.length;

  // --- Abrupt loss: the source is gone ------------------------------------

  // The destination is a separate clone with none of the source's private
  // files; the source's private directory is removed before it starts.
  const srcRecordCopy = run.readRecord(rec500);
  fs.renameSync(srcPrivate, path.join(tmp, "src-private-unreachable"));
  const dst = clone("dst");
  const dstPrivate = path.join(tmp, "dst-private");
  fs.mkdirSync(dstPrivate);

  // Discovery from the Feature number alone; the comment is stale.
  const found = cp.discover({ repository: "acme/widgets", feature: 500, checkout: dst, github });
  assert.equal(found.found, true);
  assert.equal(found.checkpoint.seq, lastSeq, "the state branch, not the stale comment, gives the current checkpoint");
  assert.equal(found.summary.stale, true, "the outdated human summary is reported stale");
  assert.equal(found.summary.seq, lastSeq - 1);
  assert.match(found.brief, /Takeover brief for Feature #500/);

  // Foreign-host evidence never becomes an exit.
  const w502 = found.checkpoint.tickets[502].owner;
  assert.equal(run.ownerStatus(w502, { sessions: { local_w502: { state: "absent" } } }, { host: DST }).status, "unknown", "an unlisted session here proves nothing about the source");
  assert.equal(run.ownerStatus(w502, { sessions: { local_w502: { state: "absent", host: DST } } }, { host: DST }).status, "unknown");
  assert.equal(run.ownerStatus(w502, { sessions: { local_w502: { state: "archived", host: SRC } } }, { host: DST }).status, "exited", "an observation made on the source host counts");
  const foreignProcess = { handle: { kind: "process", pid: process.pid, start: "recorded-on-source", host: SRC } };
  assert.equal(run.ownerStatus(foreignProcess, {}, { host: DST }).status, "unknown", "a PID that exists here belongs to another process");
  assert.equal(run.ownerStatus({ handle: { ...foreignProcess.handle, pid: 999999 } }, {}, { host: DST }).status, "unknown", "a PID absent here is not the source process's exit");
  assert.equal(run.ownerStatus(foreignProcess, { processes: { [process.pid]: { host: DST, start: "recorded-on-source", state: "exited" } } }, { host: DST }).status, "unknown");
  assert.equal(run.ownerStatus(foreignProcess, { processes: { [process.pid]: { host: SRC, start: "reused", state: "exited" } } }, { host: DST }).status, "unknown", "an observation of a reused PID is not the recorded process");
  assert.equal(run.ownerStatus(foreignProcess, { processes: { [process.pid]: { host: SRC, start: "recorded-on-source", state: "exited" } } }, { host: DST }).status, "exited");

  // Takeover needs evidence, and a stale takeover (built on a checkpoint
  // another coordinator has since replaced) is refused.
  const rec500d = path.join(dstPrivate, "run-500.json");
  const resumeArgs = { record: rec500d, checkout: dst, repository: "acme/widgets", feature: 500, coordinator: "local_dst", harness: "codex", coordinatorModel: "gpt-6.1-sol", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #500; the previous account is out of usage.", concurrency: 4 };
  assert.throws(() => cp.resume(resumeArgs, { github, host: DST, defaults, totalMemory: 64 * GB }), /--evidence/);
  const taken = cp.resume({ ...resumeArgs, evidence: "the maintainer reports the source account reached its usage limit" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(taken.action, "takeover");
  assert.equal(taken.seq, lastSeq + 1);
  assert.equal(taken.summary.state, "synced", "the takeover repairs the stale summary from the durable checkpoint");
  assert.match(github.get(taken.summary.commentId).body, new RegExp(`seq=${taken.seq} commit=${taken.commit}`));
  assert.equal(markerCount(github, 500), 1, "one status comment, updated in place");
  const kinds = Object.fromEntries(taken.limitations.map((l) => [`${l.ticket}:${l.kind}`, l]));
  assert.ok(kinds["501:pending"], "the uncertain launch is named");
  assert.ok(kinds["502:owner"] && kinds["502:unpublished"], "#502's unfinished work is an explicit limitation, not recovered");
  assert.match(kinds["502:unpublished"].detail, /existed only on src-host/);
  assert.ok(kinds["503:handoff-lock"]);
  assert.ok(kinds["504:operation"]);
  const d = run.readRecord(rec500d);
  assert.equal(d.writer.model, "gpt-6.1-sol", "new writers use the new harness's default");
  assert.equal(d.tickets[502].owner.model, "claude-opus-5-5", "a running writer keeps its recorded identity");
  assert.deepEqual(d.tickets[503].results[0].report.rounds, { "gpt-6.1-sol": 1 }, "reports survive the takeover");
  assert.equal(d.previousCoordinators.at(-1).session, "local_src");
  assert.match(d.previousCoordinators.at(-1).ended, /usage limit/);
  assert.equal(d.previousCoordinators.at(-1).authority.merge, srcRecordCopy.authority.merge, "the previous grant stays as evidence");
  assert.deepEqual(d.authority, run.AUTHORITY, "the new coordinator's authority comes from its own invocation");
  assert.notEqual(d.runId, srcRecordCopy.runId);
  // Resuming again in the same session is idempotent.
  assert.equal(cp.resume({ ...resumeArgs, evidence: "x" }, { github, host: DST, defaults, totalMemory: 64 * GB }).action, "resume");

  // The destination plans from a fresh GitHub snapshot: #502's writer opened a
  // PR after the last checkpoint. Nothing is duplicated or replaced.
  const snapAfter = { ...snap500, tickets: snap500.tickets.map((t) => (t.number === 502 ? { ...t, prs: [{ number: 602, state: "OPEN", isDraft: true, branch: "feat/502-beta", head: "c".repeat(40), rounds: 0 }] } : t)) };
  const dplan = run.planDispatch({ record: run.readRecord(rec500d), snapshot: snapAfter, turn: "user", preflights: [{ route: "codex-cli", model: "gpt-6.1-sol", verdicts: [501, 502, 503, 504].map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) }], freeBytes: 100 * GB, defaults, host: DST });
  const act = Object.fromEntries(dplan.tickets.map((t) => [t.number, t.action]));
  assert.deepEqual([act[501], act[502], act[503]], ["blocked-owner-unknown", "blocked-owner-unknown", "blocked-owner-unknown"]);
  assert.match(dplan.tickets.find((t) => t.number === 501).reason, /claimed on src-host/);
  assert.equal(act[504], "dispatch", "unrelated eligible work continues while the affected tickets are settled");
  assert.equal(dplan.tickets.find((t) => t.number === 504).route, "codex-cli");

  // The foreign launch cannot be settled from here.
  const reconcileErr = assert.throws(() => run.reconcile(run.readRecord(rec500d), { ticket: 501, host: DST, census: () => [] }), /claimed on src-host; reconcile it on that host/);
  void reconcileErr;
  const plainWithdraw = (observedOn) => mutate(rec500d, "local_dst", (r) => run.withdraw(r, { ticket: 501, evidence: "the source coordinator's census found no writer", host: DST, ...(observedOn && { observedOn }) }));
  assert.throws(() => plainWithdraw(), /withdraw it only with evidence observed there/);
  assert.throws(() => plainWithdraw(DST), /withdraw it only with evidence observed there/);
  // A release of the foreign writer needs an observation made on its host.
  assert.throws(() => mutate(rec500d, "local_dst", (r) => run.release(r, { ticket: 503, observations: { sessions: { local_w503: { state: "absent" } } }, host: DST })), /unknown/);
  // With the maintainer's observation on the source, #503 is released and a
  // new writer continues its PR from its posted rounds.
  mutate(rec500d, "local_dst", (r) => run.release(r, { ticket: 503, observations: { sessions: { local_w503: { state: "archived", host: SRC, source: "maintainer on src-host" } } }, host: DST, evidence: "maintainer archived it" }));
  const snap503 = { ...snapAfter, tickets: snapAfter.tickets.map((t) => (t.number === 503 ? { ...t, worktrees: [] } : t)) };
  const cplan = run.planDispatch({ record: run.readRecord(rec500d), snapshot: snap503, turn: "user", preflights: [{ route: "codex-cli", model: "gpt-6.1-sol", verdicts: [503, 504].map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) }], freeBytes: 100 * GB, defaults, host: DST });
  const entry503 = cplan.tickets.find((t) => t.number === 503);
  assert.equal(entry503.action, "adopt-pr");
  assert.equal(entry503.continueWith.model, "gpt-6.1-sol");
  const cplanFile = write("cplan.json", cplan);
  mutate(rec500d, "local_dst", (r) => run.claim(r, { plan: cplanFile, ticket: 503, worktree: path.join(tmp, "dst-wt-503"), branch: "feat/503-gamma", artifactParent: dstPrivate, operation: "continue", evidence: "released after the maintainer's observation on src-host", host: DST }));
  const brief503 = run.brief(run.readRecord(rec500d), cplanFile, 503, [], defaults);
  assert.match(brief503, /PR #603, which has started 1 review rounds; the count continues from there and never resets/);
  assert.ok(!brief503.includes("local_w503"), "the new writer is never given the old writer's session as its own");

  // Uncertain merge outcome, settled from GitHub before any retry.
  const reconciled = (pr) => { const r = structuredClone(run.readRecord(rec500d)); return cp.reconcileOperations(r, { snapshot: { observedAt: "now", tickets: [{ number: 504, prs: [pr] }] } })[0]; };
  assert.deepEqual(pick(reconciled({ number: 604, state: "OPEN", isDraft: false, head: mergeHead })), ["not-applied", true]);
  assert.deepEqual(pick(reconciled({ number: 604, state: "MERGED", head: mergeHead, mergeCommit: "d".repeat(40) })), ["confirmed", false]);
  assert.deepEqual(pick(reconciled({ number: 604, state: "OPEN", isDraft: false, head: "e".repeat(40) })), ["superseded", false]);
  assert.equal(cp.reconcileOperations(structuredClone(run.readRecord(rec500d)), { snapshot: { observedAt: "now", tickets: [] } })[0].state, "uncertain", "a PR GitHub did not report leaves the outcome uncertain");
  assert.throws(() => mutate(rec500d, "local_dst", (r) => cp.intent(r, { kind: "merge", ticket: 504, pr: 604, expectHead: mergeHead })), /is intent; reconcile it/, "no second merge while the first is unsettled");

  // --- Competing updates ----------------------------------------------------

  // The superseded source wakes up: its next checkpoint is refused, and so is
  // any side effect, because the state branch names another coordinator.
  fs.renameSync(path.join(tmp, "src-private-unreachable"), srcPrivate);
  assert.throws(() => cp.autoCheckpoint(rec500, { coordinator: "local_src", transition: "late", github, host: SRC }), (e) => e instanceof cp.CoordinatorChanged && /taken over.*local_dst/.test(e.message));
  assert.throws(() => cp.ensureSaved(rec500, { coordinator: "local_src", github, host: SRC }), /taken over/);
  assert.equal(run.readRecord(rec500).log.length, logLength, "the interrupted summary's repair repeated no recorded side effect");

  // A race: two coordinators build on the same checkpoint; the remote takes
  // one, and Git refuses the other without force.
  const rec900 = init(900, "local_src9");
  cp.enable(rec900, { coordinator: "local_src9", expectRevision: 1, github, host: SRC });
  const head900 = cp.fetchState(dst, "origin", "acme/widgets", 900);
  const rivalRecord900 = { ...run.readRecord(rec900), coordinator: { ...run.readRecord(rec900).coordinator, session: "local_rival9", host: DST } };
  const rivalCheckpoint = cp.buildCheckpoint(rivalRecord900, { seq: head900.checkpoint.seq + 1, previous: head900.commit, kind: "takeover", transition: "a racing takeover", host: DST, work: {} });
  const rivalCommit = cp.writeCommit(dst, { "checkpoint.json": `${JSON.stringify(rivalCheckpoint, null, 2)}\n`, "brief.md": "race\n" }, [head900.commit], "race\n");
  // The source's pre-push hook lands the rival's commit first, as a racing
  // coordinator on another machine would.
  const hooks = path.join(tmp, "race-hooks");
  fs.mkdirSync(hooks);
  const hook = path.join(hooks, "pre-push");
  fs.writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR\ngit -C "${dst.replace(/\\/g, "/")}" push -q origin ${rivalCommit}:refs/heads/orchestrate-state/feature-900\n`);
  fs.chmodSync(hook, 0o755);
  git(src, "config", "core.hooksPath", hooks.replace(/\\/g, "/"));
  mutate(rec900, "local_src9", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  assert.throws(() => cp.publish(rec900, { coordinator: "local_src9", transition: "raced", github, host: SRC }), (e) => e instanceof cp.CoordinatorChanged && /while this checkpoint was being published/.test(e.message));
  git(src, "config", "--unset", "core.hooksPath");
  assert.equal(git(src, "ls-remote", "origin", "refs/heads/orchestrate-state/feature-900").split("\t")[0], rivalCommit, "the winner's checkpoint stands");
  assert.equal(JSON.parse(fs.readFileSync(cp.sidecarOf(rec900), "utf8")).attempt.state, "refused", "the refused attempt is recorded as refused, not saved");

  // --- Feature 700: planned handoff ---------------------------------------

  const rec700 = init(700, "local_src7", { writerModel: "gpt-6-astra" });
  cp.enable(rec700, { coordinator: "local_src7", expectRevision: 1, github, host: SRC });
  const snap700 = { repository: "acme/widgets", feature: { number: 700, state: "open" }, originMain: "x", tickets: [ticket(701, { parent: 700 }), ticket(702, { parent: 700 }), ticket(703, { parent: 700 })] };
  const astra = (numbers) => ({ route: "codex-cli", model: "gpt-6-astra", verdicts: numbers.map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) });
  const start700 = (number, slug) => {
    const plan = write(`plan-${number}.json`, run.planDispatch({ record: run.readRecord(rec700), snapshot: snap700, turn: "user", preflights: [astra([701, 702, 703])], freeBytes: 100 * GB, defaults, host: SRC }));
    const worktree = path.join(tmp, `src-wt-${number}`);
    mutate(rec700, "local_src7", (r) => run.claim(r, { plan, ticket: number, worktree, branch: `feat/${number}-${slug}`, artifactParent: srcPrivate, host: SRC }));
    git(src, "worktree", "add", "-q", "-b", `feat/${number}-${slug}`, worktree, "main");
    mutate(rec700, "local_src7", (r) => run.launched(r, { ticket: number, handleKind: "task", handle: `task-${number}`, host: SRC }));
    return worktree;
  };
  // #701 is under a live review: committed, clean, frozen.
  const wt701 = start700(701, "frozen");
  fs.writeFileSync(path.join(wt701, "done.txt"), "reviewed\n");
  git(wt701, "add", "done.txt");
  git(wt701, "commit", "-q", "-m", "reviewed work");
  const freezePlan = { worktree: wt701, commonGit: git(wt701, "rev-parse", "--path-format=absolute", "--git-common-dir"), head: git(wt701, "rev-parse", "HEAD"), base: git(src, "rev-parse", "main"), jobId: "job-701" };
  const freezeDir = path.join(tmp, "job-701");
  fs.mkdirSync(freezeDir);
  reserveFreeze(freezePlan, freezeDir);
  const freezeBefore = fs.readFileSync(worktreePaths(wt701).freeze, "utf8");
  // #702 has unfinished work.
  const wt702 = start700(702, "unfinished");
  fs.writeFileSync(path.join(wt702, "README.md"), "base\nhalf done\n");
  fs.writeFileSync(path.join(wt702, "part.txt"), "staged part\n");
  git(wt702, "add", "part.txt");
  fs.writeFileSync(path.join(wt702, "part.txt"), "staged part\nand an unstaged line\n");
  fs.writeFileSync(path.join(wt702, "scratch.txt"), "untracked\n");
  fs.writeFileSync(path.join(wt702, "trace.log"), "ignored\n");
  git(wt702, "add", "README.md");
  const sourceBefore = { status: git(wt702, "--no-optional-locks", "status", "--porcelain"), head: git(wt702, "rev-parse", "HEAD"), index: fs.readFileSync(path.join(git(wt702, "rev-parse", "--path-format=absolute", "--git-dir"), "index")) };
  const bytes = (dir) => Object.fromEntries(["README.md", "part.txt", "scratch.txt"].map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
  const sourceBytes = bytes(wt702);
  const staged = git(wt702, "diff", "--cached", "--name-only");

  const stop = cp.prepareHandoff(rec700, { coordinator: "local_src7", expectRevision: rev(rec700), step: "stop", github, host: SRC });
  assert.equal(stop.checkpoint.saved, true);
  const held = run.planDispatch({ record: run.readRecord(rec700), snapshot: snap700, turn: "user", preflights: [astra([703])], freeBytes: 100 * GB, defaults, host: SRC });
  assert.equal(held.tickets.find((t) => t.number === 703).action, "wait-handoff", "no new work starts during a planned handoff");
  // #701's writer is still running its review; #702's has stopped.
  const handed = cp.prepareHandoff(rec700, { coordinator: "local_src7", expectRevision: rev(rec700), step: "publish", observations: { tasks: { "task-701": { state: "running" }, "task-702": { state: "completed" } } }, github, host: SRC });
  assert.equal(handed.checkpoint.saved, true);
  assert.equal(handed.snapshots[701].clean, true, "a frozen clean worktree needs no snapshot");
  assert.equal(handed.snapshots[702].clean, false);
  assert.deepEqual(handed.uncertain.map((u) => [u.ticket, u.status]), [[701, "live"]], "a running writer is listed as running, not as handed over");
  assert.equal(fs.readFileSync(worktreePaths(wt701).freeze, "utf8"), freezeBefore, "the review freeze is untouched");
  assertFrozen(freezePlan);
  assert.deepEqual({ status: git(wt702, "--no-optional-locks", "status", "--porcelain"), head: git(wt702, "rev-parse", "HEAD") }, { status: sourceBefore.status, head: sourceBefore.head }, "the source worktree and branch are unchanged");
  assert.ok(fs.readFileSync(path.join(git(wt702, "rev-parse", "--path-format=absolute", "--git-dir"), "index")).equals(sourceBefore.index), "the source index is byte for byte unchanged");
  assert.deepEqual(bytes(wt702), sourceBytes);
  const handedCheckpoint = cp.fetchState(src, "origin", "acme/widgets", 700).checkpoint;
  assert.equal(handedCheckpoint.handoff.state, "ready");
  assert.match(cp.fetchState(src, "origin", "acme/widgets", 700).brief, /Running or uncertain at handoff[\s\S]*#701: live/);
  assert.equal(git(src, "rev-parse", "feat/702-unfinished"), sourceBefore.head, "the snapshot is not on the writer's branch");

  // A destination machine retrieves the unfinished work from the snapshot.
  const dst2 = clone("dst2");
  const retrieved = cp.retrieve({ repository: "acme/widgets", feature: 700, checkout: dst2, ticket: 702, worktree: path.join(tmp, "dst2-wt-702") });
  assert.equal(retrieved.verified, true);
  assert.deepEqual(bytes(retrieved.worktree), sourceBytes, "the unfinished file bytes arrive");
  assert.equal(git(retrieved.worktree, "diff", "--cached", "--name-only"), staged, "the staged state arrives");
  assert.ok(!fs.existsSync(path.join(retrieved.worktree, "trace.log")), "ignored files are not part of the snapshot");
  assert.throws(() => cp.retrieve({ repository: "acme/widgets", feature: 700, checkout: dst2, ticket: 701, worktree: path.join(tmp, "dst2-wt-701") }), /holds no snapshot for #701/);

  // The takeover keeps the explicit writer override, which a new override
  // still replaces.
  const rec700d = path.join(tmp, "dst2-private", "run-700.json");
  fs.mkdirSync(path.dirname(rec700d));
  const taken700 = cp.resume({ record: rec700d, checkout: dst2, repository: "acme/widgets", feature: 700, coordinator: "local_dst7", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #700.", evidence: "planned handoff" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(run.readRecord(rec700d).writer.model, "gpt-6-astra");
  assert.match(run.readRecord(rec700d).writer.source, /carried from local_src7/);
  assert.ok(taken700.limitations.some((l) => l.ticket === 702 && l.kind === "snapshot"));
  assert.ok(!taken700.limitations.some((l) => l.ticket === 702 && l.kind === "unpublished"), "snapshotted work is not reported lost");
  assert.equal(run.planDispatch({ record: run.readRecord(rec700d), snapshot: snap700, turn: "user", preflights: [astra([703])], freeBytes: 100 * GB, defaults, host: DST }).tickets.find((t) => t.number === 703).action, "dispatch", "the new coordinator admits work again");

  // --- Credentials and network failure ------------------------------------

  const token = ["gh", "p_", "A1b2C3d4".repeat(5)].join("");
  mutate(rec700d, "local_dst7", (r) => { r.log.push({ time: new Date().toISOString(), event: "note", text: `pasted ${token}` }); });
  const before700 = git(dst2, "ls-remote", "origin", "refs/heads/orchestrate-state/feature-700");
  assert.throws(() => cp.publish(rec700d, { coordinator: "local_dst7", github, host: DST }), /would publish credentials: \$\.log\[\d+\]\.text holds a GitHub token/);
  assert.equal(git(dst2, "ls-remote", "origin", "refs/heads/orchestrate-state/feature-700"), before700, "nothing was pushed");
  assert.deepEqual(cp.credentialFindings({ url: "https://user:secret@example.com/x", q: "https://h/x?token=abc" }).length, 2);

  // The command line: an automatic checkpoint follows each transition, and an
  // unreachable remote leaves the change local, reported as unsaved, and
  // blocks any writer start until a checkpoint is saved.
  const rec800 = path.join(dstPrivate, "run-800.json");
  run.initRecord({ record: rec800, checkout: dst, repository: "acme/widgets", feature: 800, coordinator: "local_cli", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: "Use orchestrate-feature for #800." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
  cp.main(["enable", "--record", rec800, "--coordinator", "local_cli", "--expect-revision", "1"], { github });
  const snap800 = { repository: "acme/widgets", feature: { number: 800, state: "open" }, originMain: "x", tickets: [ticket(801, { parent: 800 })] };
  const plan800 = write("plan-800.json", run.planDispatch({ record: run.readRecord(rec800), snapshot: snap800, turn: "user", preflights: [available("claude-cli", [801])], freeBytes: 100 * GB, defaults }));
  const claimed = run.main(["claim", "--record", rec800, "--coordinator", "local_cli", "--expect-revision", String(rev(rec800)), "--plan", plan800, "--ticket", "801", "--worktree", path.join(tmp, "dst-wt-801"), "--branch", "feat/801-cli", "--artifact-parent", dstPrivate], { defaults, github });
  assert.equal(claimed.checkpoint.saved, true, "the claim is checkpointed automatically");
  assert.equal(claimed.checkpoint.seq, 2);
  const offline = path.join(tmp, "remote-offline.git");
  fs.renameSync(remote, offline);
  const withdrawn = run.main(["withdraw", "--record", rec800, "--coordinator", "local_cli", "--expect-revision", String(rev(rec800)), "--ticket", "801", "--evidence", "declined"], { defaults, github });
  assert.equal(withdrawn.checkpoint.saved, false, "a network failure is not presented as a saved checkpoint");
  assert.equal(run.readRecord(rec800).tickets[801].pending, null, "the local change stands");
  assert.throws(() => run.main(["launch", "--record", rec800, "--coordinator", "local_cli", "--expect-revision", String(rev(rec800)), "--ticket", "801", "--executable", process.execPath, "--prompt", plan800], { defaults, github }), /not saved remotely|could not be confirmed|the side effect was not started|failed/);
  fs.renameSync(offline, remote);
  const repaired = cp.ensureSaved(rec800, { coordinator: "local_cli", github });
  assert.equal(repaired.saved, true);
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 800).checkpoint.run.recordRevision, rev(rec800), "the next save carries the change made while offline");

  console.log("PASS: discovery from the Feature number, takeover with fresh authority, stale and competing updates, interrupted summary repair, uncertain launch and merge outcomes, foreign-host evidence, planned handoff snapshot beside a review freeze, abrupt loss of unpublished work, credential refusal and automatic checkpoints");
} finally {
  // The scratch tree holds only this check's clones and remote.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (error) { console.log(`scratch kept: ${error.message}`); }
}

function markerCount(github, feature) { return [...github.comments.values()].filter((c) => c.issue === feature && c.body.includes(cp.statusMarker(feature))).length; }
function pick(r) { return [r.state, r.retry]; }
