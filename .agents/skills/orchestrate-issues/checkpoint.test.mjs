// agent-tooling-timeout-ms: 900000
// Measured at 254 s on the Windows CI runner, 403 s alone and 518 s inside
// the sweep on a loaded Windows machine, so the default five-minute bound
// leaves no headroom.
// Exercises portable checkpoints of a parent issue run across two clones of one
// scratch remote: discovery from the parent issue number, takeover by a destination
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
import { createHash } from "node:crypto";
import { reserveFreeze, worktreePaths, assertFrozen } from "../../../scripts/review-job-store.mjs";
import { jobRootOf } from "../../../scripts/review-job-root.mjs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { readRepos } from "../../repos.mjs";
import * as run from "./issue-run.mjs";
import * as cp from "./checkpoint.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-")));
console.log(`scratch: ${tmp}`);
const defaults = run.readWriterDefaults();
const GB = 2 ** 30;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };
const SRC = "src-host", DST = "dst-host";
// A ticket's first located work entry in a checkpoint.
const at = (c, n) => cp.workFor(c, n)[0];
// Nothing is ever reported as covered by a snapshot: no checkpoint holds a
// coverage judgement, and every location with unfinished files or unpushed
// commits, as observed or last observed, is reported as possibly holding work
// only on its host, snapshot or not.
function assertNoCoverage(checkpoint, why) {
  assert.ok(!/"(snapshotCurrent|headInSnapshot|comparedWith)"/.test(JSON.stringify(checkpoint)), `${why}: no coverage judgement is recorded`);
  const reported = cp.limitations(checkpoint, { host: "elsewhere-host" }).filter((l) => l.kind === "unpublished");
  for (const w of Object.values(checkpoint.work ?? {})) {
    const state = cp.workState(w);
    if (state.dirty || state.unpushed) assert.ok(reported.some((l) => l.ticket === w.ticket && l.detail.includes(`${w.host} held`) && l.detail.includes(w.worktree)), `${why}: #${w.ticket} on ${w.host} is reported as possibly holding work only there`);
  }
}

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

  const init = (issue, coordinator, extra = {}) => {
    const record = path.join(srcPrivate, `run-${issue}.json`);
    run.initRecord({ record, checkout: src, repository: "acme/widgets", issue, coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: `Use orchestrate-issues for #${issue}.`, ...extra }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
    return record;
  };
  const rev = (file) => run.readRecord(file).revision;
  const mutate = (file, coordinator, fn) => run.updateRecord(file, { expectRevision: rev(file), coordinator }, fn);
  // A writer working on the source: its worktree made as resolve-issue would,
  // and the desktop session working in it recorded with adopt from a plan
  // that found the worktree.
  const startWriter = (file, coordinator, snapshot, number, slug) => {
    const worktree = path.join(tmp, `src-wt-${number}`), branch = `feat/${number}-${slug}`;
    git(src, "worktree", "add", "-q", "-b", branch, worktree, "main");
    const found = { ...snapshot, tickets: snapshot.tickets.map((t) => (t.number === number ? { ...t, worktrees: [{ path: worktree, branch, head: "x" }] } : t)) };
    const planFile = write(`plan-${number}-${Date.now()}.json`, run.planDispatch({ record: run.readRecord(file), snapshot: found, preflights: [], freeBytes: 100 * GB, defaults, host: SRC, census: () => [] }));
    mutate(file, coordinator, (r) => run.adopt(r, { plan: planFile, ticket: number, handleKind: "session", handle: `local_w${number}`, route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree, branch, host: SRC }));
    return worktree;
  };

  // --- Parent issue 500: automatic checkpoints, abrupt loss, takeover ----------

  const rec500 = init(500, "local_src");
  const enabled = cp.enable(rec500, { coordinator: "local_src", expectRevision: 1, github, host: SRC });
  assert.equal(enabled.checkpoint.saved, true);
  assert.equal(enabled.checkpoint.seq, 1);
  assert.equal(enabled.checkpoint.summary.state, "synced");
  assert.equal(git(src, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-500").split("\t")[0], enabled.checkpoint.commit, "the checkpoint is on the remote state branch");
  const status = [...github.comments.values()].find((c) => c.issue === 500);
  assert.match(status.body, /orchestrate-issues status: issue 500/);
  assert.match(status.body, new RegExp(`checkpoint seq=1 commit=${enabled.checkpoint.commit}`));
  assert.ok(!git(src, "branch", "--list").includes("orchestrate-state"), "the state branch is not checked out or listed locally");

  // A second run of the same parent issue is refused; it must take over instead.
  const rival = path.join(srcPrivate, "rival.json");
  fs.copyFileSync(rec500, rival);
  const rivalRecord = run.readRecord(rival);
  fs.writeFileSync(rival, JSON.stringify({ ...rivalRecord, coordinator: { ...rivalRecord.coordinator, session: "local_rival" } }));
  assert.throws(() => cp.enable(rival, { coordinator: "local_rival", expectRevision: 1, github, host: SRC }), /already has checkpoint 1 by coordinator local_src.*resume/);

  const snap500 = { repository: "acme/widgets", issue: { number: 500, state: "open" }, originMain: "x", observedAt: "2026-10-12T00:00:00Z", tickets: [ticket(501), ticket(502), ticket(503, { prs: [{ number: 603, state: "OPEN", isDraft: true, branch: "feat/503-gamma", head: "a".repeat(40), rounds: 1 }] }), ticket(504)] };
  // #501's start is claimed and its intent saved; the source stops before its
  // outcome (the abrupt interruption at dispatch).
  const plan501 = write("plan-501.json", run.planDispatch({ record: run.readRecord(rec500), snapshot: snap500, preflights: [available("claude-cli", [501, 502, 504])], freeBytes: 100 * GB, defaults, host: SRC }));
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
  const adoptPlan = write("plan-503.json", run.planDispatch({ record: run.readRecord(rec500), snapshot: { ...snap500, tickets: snap500.tickets.map((t) => (t.number === 503 ? { ...t, worktrees: [{ path: wt503, branch: "feat/503-gamma", head: "x" }] } : t)) }, preflights: [], freeBytes: 100 * GB, defaults, host: SRC }));
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
  const report = write("report-503.json", { model: "claude-opus-5-5", effort: "medium", permissionMode: null, pr: 603, reviewedHead: "a".repeat(40), rounds: { "gpt-6.1-sol": 1 }, findings: "two blocking, awaiting adjudication", verification: "red/green", ci: "pending", next: "adjudicate round 1" });
  mutate(rec500, "local_src", (r) => run.result(r, { ticket: 503, report }));
  // A later round's reviewer attempt was launched and blocked before it
  // completed; its round, reviewer, attempt and planned reviewers are known
  // only from its launching row.
  const blockedDir = path.join(jobRootOf(src), "pr-603", "round-2", "launch-ax-2");
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.writeFileSync(path.join(blockedDir, "journal.jsonl"), [
    { event: "coordinator", processIdentity: { pid: 2, start: "2" } },
    { event: "launching", step: "ax", round: 2, reviewerId: "ax", attempt: 2, plannedReviewers: ["ax", "undirected"], completedRoundReviewers: null },
    { event: "blocked", reason: "route unavailable" },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  // #502's writer has a brief whose delivery is unconfirmed.
  mutate(rec500, "local_src", (r) => { r.tickets[502].owner.brief = { state: "intent", deliveryId: "d1", attempts: 1, time: new Date().toISOString(), text: "the stored brief for #502" }; });
  // The source scheduled its check-in and carries its title.
  mutate(rec500, "local_src", (r) => { run.recordCheckIn(r, { job: "src-cron", file: rec500, defaults }); r.title = "ORCH #500: widget delivery"; });
  // The source recorded its intent to merge another PR and stopped before the
  // outcome.
  const mergeHead = "b".repeat(40);
  mutate(rec500, "local_src", (r) => cp.intent(r, { kind: "merge", ticket: 504, pr: 604, expectHead: mergeHead }));
  const auto = cp.autoCheckpoint(rec500, { coordinator: "local_src", transition: "intent to merge PR #604", github, host: SRC });
  assert.equal(auto.saved, true);
  const saved = JSON.parse(git(src, "show", `${auto.commit}:checkpoint.json`));
  assert.equal(saved.tickets[501].pending.host, SRC, "a pending start names the host that claimed it");
  assert.deepEqual([at(saved, 502).dirty, at(saved, 502).unpushed], [true, true], "the inventory knows #502's work exists only on the source");
  assert.equal(at(saved, 503).reviewJobs[0].pendingReviewers.length, 0);
  assert.deepEqual(at(saved, 503).reviewJobs[0].completedRoundReviewers, { undirected: 1 }, "the planned-reviewer accounting of the round is carried");
  assert.equal(at(saved, 503).handoffLock.host, SRC);
  const blockedJob = at(saved, 503).reviewJobs.find((j) => j.job.endsWith("launch-ax-2"));
  assert.deepEqual([blockedJob.lastEvent, blockedJob.attempted.round, blockedJob.attempted.reviewerId, blockedJob.attempted.attempt, blockedJob.attempted.plannedReviewers], ["blocked", 2, "ax", 2, ["ax", "undirected"]], "an attempt that never completed keeps its round, reviewer, attempt and fixed plan");
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

  // Discovery from the parent issue number alone; the comment is stale.
  const found = cp.discover({ repository: "acme/widgets", issue: 500, checkout: dst, github });
  assert.equal(found.found, true);
  assert.equal(found.checkpoint.seq, lastSeq, "the state branch, not the stale comment, gives the current checkpoint");
  assert.equal(found.summary.stale, true, "the outdated human summary is reported stale");
  assert.equal(found.summary.seq, lastSeq - 1);
  assert.match(found.brief, /Takeover brief for issue #500/);

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
  // A detached writer's recorded process is its wrapper: its exit alone
  // leaves the writer, found by its launch directory, unknown.
  const foreignWrapper = { handle: { ...foreignProcess.handle, launchDir: "/source/artifacts/launch-1" } };
  assert.equal(run.ownerStatus(foreignWrapper, { processes: { [process.pid]: { host: SRC, start: "recorded-on-source", state: "exited" } } }, { host: DST }).status, "unknown", "a wrapper's exit does not show its writer ended");
  assert.equal(run.ownerStatus(foreignWrapper, { processes: { [process.pid]: { host: SRC, start: "recorded-on-source", state: "exited", launchDirUnused: true } } }, { host: DST }).status, "exited");

  // Takeover needs evidence, and a stale takeover (built on a checkpoint
  // another coordinator has since replaced) is refused.
  const rec500d = path.join(dstPrivate, "run-500.json");
  const resumeArgs = { record: rec500d, checkout: dst, repository: "acme/widgets", issue: 500, coordinator: "local_dst", harness: "codex", coordinatorModel: "gpt-6.1-sol", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #500; the previous account is out of usage.", concurrency: 4 };
  assert.throws(() => cp.resume(resumeArgs, { github, host: DST, defaults, totalMemory: 64 * GB }), /--evidence/);
  // A takeover holds the same concurrency bounds as init, refused before
  // anything is written or published; the takeover below is still next.
  for (const concurrency of [0, 9, 99, 2.5]) assert.throws(() => cp.resume({ ...resumeArgs, concurrency, evidence: "out of usage" }, { github, host: DST, defaults, totalMemory: 64 * GB }), /--concurrency must be 1 to 8/, `concurrency ${concurrency} is refused`);
  assert.equal(fs.existsSync(rec500d), false, "a refused takeover writes no record");
  const taken =cp.resume({ ...resumeArgs, evidence: "the maintainer reports the source account reached its usage limit" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(taken.action, "takeover");
  assert.equal(taken.seq, lastSeq + 1);
  assert.equal(taken.summary.state, "synced", "the takeover repairs the stale summary from the durable checkpoint");
  assert.match(github.get(taken.summary.commentId).body, new RegExp(`seq=${taken.seq} commit=${taken.commit}`));
  assert.equal(markerCount(github, 500), 1, "one status comment, updated in place");
  const kinds = Object.fromEntries(taken.limitations.map((l) => [`${l.ticket}:${l.kind}`, l]));
  assert.ok(kinds["501:pending"], "the uncertain launch is named");
  assert.ok(kinds["502:owner"] && kinds["502:unpublished"], "#502's unfinished work is an explicit limitation, not recovered");
  assert.match(kinds["502:unpublished"].detail, /src-host held unfinished files and unpushed commits in .* that may exist only there/);
  assert.ok(kinds["503:handoff-lock"]);
  assert.ok(kinds["504:operation"]);
  const d = run.readRecord(rec500d);
  assert.equal(d.writer.model, "gpt-6.1-sol", "new writers use the new harness's default");
  assert.equal(d.tickets[502].owner.model, "claude-opus-5-5", "a running writer keeps its recorded identity");
  assert.deepEqual(d.tickets[503].results[0].report.rounds, { "gpt-6.1-sol": 1 }, "reports survive the takeover");
  assert.equal(d.previousCoordinators.at(-1).session, "local_src");
  assert.match(d.previousCoordinators.at(-1).ended, /usage limit/);
  assert.equal(d.previousCoordinators.at(-1).authority.merge, srcRecordCopy.authority.merge, "the previous grant stays as evidence");
  // The check-in ended with the source's session: the takeover carries the
  // command that recreates it for the new record, and the parent issue's title.
  assert.deepEqual([d.checkIn.job, d.checkIn.state, d.checkIn.command, d.title, d.coordinator.permissionMode], [null, "recreate on this coordinator's runner", `node .agents/skills/orchestrate-issues/issue-run.mjs schedule --record '${rec500d}'`, "ORCH #500: widget delivery", "bypassPermissions"]);
  assert.match(found.brief, /recreate it on your own runner with: node \.agents\/skills\/orchestrate-issues\/issue-run\.mjs schedule --record /);
  assert.ok(run.scheduleSpec(d, rec500d, defaults).prompt.includes(rec500d), "the recreated job names the new record");
  assert.deepEqual(d.authority, run.AUTHORITY, "the new coordinator's authority comes from its own invocation");
  assert.notEqual(d.runId, srcRecordCopy.runId);
  assert.match(run.deliver(structuredClone(d), { ticket: 502, retry: true }).message, /the stored brief for #502/, "an unconfirmed brief can still be resent exactly after a takeover");
  // Resuming again in the same session is idempotent.
  assert.equal(cp.resume({ ...resumeArgs, evidence: "x" }, { github, host: DST, defaults, totalMemory: 64 * GB }).action, "resume");
  // A later request in the same session decides who merges from then on, and
  // the change is saved before the session acts on it: a grant, then a
  // request that stops at ready PRs takes it back.
  const granted = cp.resume({ ...resumeArgs, merging: "coordinator" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.deepEqual([granted.action, granted.checkpoint?.saved, run.coordinatorMerges(run.readRecord(rec500d))], ["resume", true, true]);
  const stopRequest = cp.resume({ ...resumeArgs, invocation: "Use orchestrate-issues for #500; stop at ready PRs.", merging: "maintainer" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  const afterStop = run.readRecord(rec500d);
  assert.deepEqual([stopRequest.action, stopRequest.checkpoint?.saved, run.coordinatorMerges(afterStop), afterStop.invocation.text, afterStop.authority.merge], ["resume", true, false, "Use orchestrate-issues for #500; stop at ready PRs.", run.AUTHORITY.merge]);
  assert.deepEqual(afterStop.log.at(-1).replaced, { text: resumeArgs.invocation, merging: "coordinator" }, "the replaced request stays in the log");
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 500).checkpoint.seq, stopRequest.checkpoint.seq, "the restriction is on the state branch");
  assert.ok(!("checkpoint" in cp.resume({ ...resumeArgs, invocation: "Use orchestrate-issues for #500; stop at ready PRs.", merging: "maintainer" }, { github, host: DST, defaults, totalMemory: 64 * GB })), "an unchanged request saves nothing");
  cp.resume({ ...resumeArgs, evidence: "x" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.deepEqual(run.readRecord(rec500d).authority, run.AUTHORITY);

  // The destination plans from a fresh GitHub snapshot: #502's writer opened a
  // PR after the last checkpoint. Nothing is duplicated or replaced.
  const snapAfter = { ...snap500, tickets: snap500.tickets.map((t) => (t.number === 502 ? { ...t, prs: [{ number: 602, state: "OPEN", isDraft: true, branch: "feat/502-beta", head: "c".repeat(40), rounds: 0 }] } : t)) };
  const dplan = run.planDispatch({ record: run.readRecord(rec500d), snapshot: snapAfter, preflights: [{ route: "codex-cli", model: "gpt-6.1-sol", verdicts: [501, 502, 503, 504].map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) }], freeBytes: 100 * GB, defaults, host: DST });
  const act = Object.fromEntries(dplan.tickets.map((t) => [t.number, t.action]));
  // #502's writer still has an unconfirmed brief, which is settled from its
  // transcript before anything else.
  assert.deepEqual([act[501], act[502], act[503]], ["blocked-owner-unknown", "reconcile-pending", "blocked-owner-unknown"]);
  assert.match(dplan.tickets.find((t) => t.number === 501).reason, /claimed on src-host/);
  assert.equal(act[504], "dispatch", "unrelated eligible work continues while the affected tickets are settled");
  assert.equal(dplan.tickets.find((t) => t.number === 504).route, "codex-cli");

  // The foreign launch cannot be settled from here.
  const reconcileErr = assert.throws(() => run.reconcile(run.readRecord(rec500d), { ticket: 501, host: DST, census: () => [] }), /claimed on src-host; reconcile it on that host/);
  void reconcileErr;
  const plainWithdraw = (observedOn) => mutate(rec500d, "local_dst", (r) => run.withdraw(r, { ticket: 501, evidence: "the source coordinator's census found no writer", host: DST, ...(observedOn && { observedOn }) }));
  assert.throws(() => plainWithdraw(), /withdraw it only with evidence observed there/);
  assert.throws(() => plainWithdraw(DST), /withdraw it only with evidence observed there/);
  // No start entrypoint runs another host's pending start, whatever the plan.
  assert.throws(() => run.launch(structuredClone(run.readRecord(rec500d)), { ticket: 501, executable: process.execPath, prompt: plan501, host: DST, spawner: () => { throw new Error("must not spawn"); } }), /claimed on src-host; it runs, or is settled, only on that host/);
  assert.throws(() => run.launched(structuredClone(run.readRecord(rec500d)), { ticket: 501, handleKind: "session", handle: "local_x", host: DST }), /confirm it only with evidence observed there/);
  // A release of the foreign writer needs an observation made on its host.
  assert.throws(() => mutate(rec500d, "local_dst", (r) => run.release(r, { ticket: 503, observations: { sessions: { local_w503: { state: "absent" } } }, host: DST })), /unknown/);
  // With the maintainer's observation on the source, #503 is released and a
  // new writer continues its PR from its posted rounds.
  mutate(rec500d, "local_dst", (r) => run.release(r, { ticket: 503, observations: { sessions: { local_w503: { state: "archived", host: SRC, source: "maintainer on src-host" } } }, host: DST, evidence: "maintainer archived it" }));
  const snap503 = { ...snapAfter, tickets: snapAfter.tickets.map((t) => (t.number === 503 ? { ...t, worktrees: [] } : t)) };
  const cplan = run.planDispatch({ record: run.readRecord(rec500d), snapshot: snap503, preflights: [{ route: "codex-cli", model: "gpt-6.1-sol", verdicts: [503, 504].map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) }], freeBytes: 100 * GB, defaults, host: DST });
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
  fs.writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR\ngit -C "${dst.replace(/\\/g, "/")}" push -q origin ${rivalCommit}:refs/heads/orchestrate-state/issue-900\n`);
  fs.chmodSync(hook, 0o755);
  git(src, "config", "core.hooksPath", hooks.replace(/\\/g, "/"));
  mutate(rec900, "local_src9", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  assert.throws(() => cp.publish(rec900, { coordinator: "local_src9", transition: "raced", github, host: SRC }), (e) => e instanceof cp.CoordinatorChanged && /while this checkpoint was being published/.test(e.message));
  git(src, "config", "--unset", "core.hooksPath");
  assert.equal(git(src, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-900").split("\t")[0], rivalCommit, "the winner's checkpoint stands");
  assert.equal(JSON.parse(fs.readFileSync(cp.sidecarOf(rec900), "utf8")).attempt.state, "refused", "the refused attempt is recorded as refused, not saved");

  // The remote moves after the checkpoint was read but before the push sees
  // it: the push advertises the newer head, and only the no-force push keeps
  // it. A reference-transaction hook lands the rival when the read's fetch
  // updates the local state ref.
  const rec910 = init(910, "local_src91");
  cp.enable(rec910, { coordinator: "local_src91", expectRevision: 1, github, host: SRC });
  const head910 = cp.fetchState(dst, "origin", "acme/widgets", 910);
  const rival910 = { ...run.readRecord(rec910), coordinator: { ...run.readRecord(rec910).coordinator, session: "local_rival91", host: DST } };
  const rival910Commit = cp.writeCommit(dst, { "checkpoint.json": `${JSON.stringify(cp.buildCheckpoint(rival910, { seq: head910.checkpoint.seq + 1, previous: head910.commit, kind: "takeover", transition: "a racing takeover", host: DST, work: {} }), null, 2)}\n`, "brief.md": "race\n" }, [head910.commit], "race\n");
  git(src, "update-ref", "-d", "refs/orchestrate-issues/orchestrate-state/issue-910");
  const hooks2 = path.join(tmp, "race-hooks-2"), marker = path.join(tmp, "race-2-fired");
  fs.mkdirSync(hooks2);
  fs.writeFileSync(path.join(hooks2, "reference-transaction"), `#!/bin/sh\n[ "$1" = committed ] || { cat > /dev/null; exit 0; }\ngrep -q "refs/orchestrate-issues/orchestrate-state/issue-910" || exit 0\n[ -e "${marker.replace(/\\/g, "/")}" ] && exit 0\n: > "${marker.replace(/\\/g, "/")}"\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR\ngit -C "${dst.replace(/\\/g, "/")}" push -q origin ${rival910Commit}:refs/heads/orchestrate-state/issue-910\nexit 0\n`);
  fs.chmodSync(path.join(hooks2, "reference-transaction"), 0o755);
  git(src, "config", "core.hooksPath", hooks2.replace(/\\/g, "/"));
  mutate(rec910, "local_src91", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  try { assert.throws(() => cp.publish(rec910, { coordinator: "local_src91", transition: "raced late", github, host: SRC }), (e) => e instanceof cp.CoordinatorChanged); }
  finally { git(src, "config", "--unset", "core.hooksPath"); }
  assert.ok(fs.existsSync(marker), "the rival landed between the read and the push");
  assert.equal(git(src, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-910").split("\t")[0], rival910Commit, "a push built on an outdated read never replaces the newer checkpoint");

  // --- Parent issue 700: planned handoff ---------------------------------------

  const rec700 = init(700, "local_src7", { writerModel: "gpt-6-astra" });
  cp.enable(rec700, { coordinator: "local_src7", expectRevision: 1, github, host: SRC });
  const snap700 = { repository: "acme/widgets", issue: { number: 700, state: "open" }, originMain: "x", tickets: [ticket(701, { parent: 700 }), ticket(702, { parent: 700 }), ticket(703, { parent: 700 })] };
  const astra = (numbers) => ({ route: "codex-cli", model: "gpt-6-astra", verdicts: numbers.map((n) => ({ ticket: n, effort: "medium", verdict: "available" })) });
  const start700 = (number, slug) => {
    const plan = write(`plan-${number}.json`, run.planDispatch({ record: run.readRecord(rec700), snapshot: snap700, preflights: [astra([701, 702, 703])], freeBytes: 100 * GB, defaults, host: SRC }));
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
  // A CRLF file the worktree's attributes would normalize to LF on add.
  fs.writeFileSync(path.join(wt702, ".gitattributes"), "crlf.txt text eol=lf\n");
  fs.writeFileSync(path.join(wt702, "crlf.txt"), "first\r\nsecond\r\n");
  fs.writeFileSync(path.join(wt702, "trace.log"), "ignored\n");
  git(wt702, "add", "README.md");
  const sourceBefore = { status: git(wt702, "--no-optional-locks", "status", "--porcelain"), head: git(wt702, "rev-parse", "HEAD"), index: fs.readFileSync(path.join(git(wt702, "rev-parse", "--path-format=absolute", "--git-dir"), "index")) };
  const bytes = (dir) => Object.fromEntries(["README.md", "part.txt", "scratch.txt", "crlf.txt", ".gitattributes"].map((f) => [f, fs.readFileSync(path.join(dir, f)).toString("hex")]));
  const sourceBytes = bytes(wt702);
  const staged = git(wt702, "diff", "--cached", "--name-only");

  const stop = cp.prepareHandoff(rec700, { coordinator: "local_src7", expectRevision: rev(rec700), step: "stop", github, host: SRC });
  assert.equal(stop.checkpoint.saved, true);
  const held = run.planDispatch({ record: run.readRecord(rec700), snapshot: snap700, preflights: [astra([703])], freeBytes: 100 * GB, defaults, host: SRC });
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

  // Later checkpoints keep naming the snapshot; an edit made after it is
  // reported as existing only on the source.
  const latest700 = () => cp.fetchState(src, "origin", "acme/widgets", 700).checkpoint;
  mutate(rec700, "local_src7", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  assert.equal(cp.autoCheckpoint(rec700, { coordinator: "local_src7", transition: "a later note", github, host: SRC }).saved, true);
  assert.equal(latest700().snapshots[702].commit, handed.snapshots[702].commit, "a later checkpoint still names the snapshot");
  assertNoCoverage(latest700(), "a location whose files match its snapshot");
  fs.appendFileSync(path.join(wt702, "scratch.txt"), "edited after the snapshot\n");
  cp.autoCheckpoint(rec700, { coordinator: "local_src7", transition: "an edit after the snapshot", github, host: SRC });
  const afterEdit = cp.limitations(latest700(), { host: DST }).filter((l) => l.ticket === 702).map((l) => l.kind);
  assert.deepEqual(afterEdit.sort(), ["owner", "snapshot", "unpublished"], "the snapshot stays retrievable and the later edit is named as unrecoverable");
  fs.writeFileSync(path.join(wt702, "scratch.txt"), "untracked\n");
  cp.autoCheckpoint(rec700, { coordinator: "local_src7", transition: "the edit was undone", github, host: SRC });
  assertNoCoverage(latest700(), "after the edit is undone");

  // A snapshot that would publish a credential is refused and stays local;
  // the handoff names the ticket as not snapshotted.
  const fakeToken = ["gh", "p_", "A1b2C3d4".repeat(5)].join("");
  const rec720 = init(720, "local_src72");
  cp.enable(rec720, { coordinator: "local_src72", expectRevision: 1, github, host: SRC });
  const wt721 = startWriter(rec720, "local_src72", { repository: "acme/widgets", issue: { number: 720, state: "open" }, originMain: "x", tickets: [ticket(721, { parent: 720 })] }, 721, "secret");
  fs.writeFileSync(path.join(wt721, "notes.txt"), `token ${fakeToken}\n`);
  cp.prepareHandoff(rec720, { coordinator: "local_src72", expectRevision: rev(rec720), step: "stop", github, host: SRC });
  const handed720 = cp.prepareHandoff(rec720, { coordinator: "local_src72", expectRevision: rev(rec720), step: "publish", observations: { sessions: { local_w721: { state: "archived" } } }, github, host: SRC });
  assert.equal(handed720.snapshots[721], undefined);
  assert.match(handed720.uncertain.find((u) => u.ticket === 721 && u.status === "not snapshotted").reason, /would publish credentials: notes\.txt holds a GitHub token/);
  const state720 = cp.fetchState(src, "origin", "acme/widgets", 720);
  assert.equal(git(src, "rev-list", "--parents", "-n", "1", state720.commit).split(" ").length, 2, "no snapshot commit was attached");
  assert.equal(state720.checkpoint.snapshots[721], undefined);
  assert.ok(cp.limitations(state720.checkpoint, { host: DST }).some((l) => l.ticket === 721 && l.kind === "unpublished"));

  // History another remote holds is still unpublished on the checkpoint's
  // remote, and commit messages are scanned like files.
  const elsewhere = path.join(tmp, "elsewhere.git");
  git(tmp, "init", "-q", "--bare", "-b", "main", elsewhere);
  git(src, "remote", "add", "elsewhere", elsewhere);
  const rec770 = init(770, "local_src77");
  cp.enable(rec770, { coordinator: "local_src77", expectRevision: 1, github, host: SRC });
  const snap770 = { repository: "acme/widgets", issue: { number: 770, state: "open" }, originMain: "x", tickets: [ticket(771, { parent: 770 }), ticket(772, { parent: 770 })] };
  const wt771 = startWriter(rec770, "local_src77", snap770, 771, "elsewhere");
  fs.writeFileSync(path.join(wt771, "config.txt"), `token ${fakeToken}\n`);
  git(wt771, "add", "config.txt");
  git(wt771, "commit", "-q", "-m", "a secret, pushed only elsewhere");
  git(wt771, "push", "-q", "elsewhere", "HEAD:refs/heads/feat/771-elsewhere");
  git(wt771, "fetch", "-q", "elsewhere");
  fs.writeFileSync(path.join(wt771, "config.txt"), "no secret\n");
  git(wt771, "commit", "-q", "-am", "secret removed");
  fs.writeFileSync(path.join(wt771, "draft.txt"), "draft\n");
  const wt772 = startWriter(rec770, "local_src77", snap770, 772, "message");
  fs.writeFileSync(path.join(wt772, "plain.txt"), "plain\n");
  git(wt772, "add", "plain.txt");
  git(wt772, "commit", "-q", "-m", `pasted ${fakeToken} by mistake`);
  fs.writeFileSync(path.join(wt772, "draft.txt"), "draft\n");
  cp.prepareHandoff(rec770, { coordinator: "local_src77", expectRevision: rev(rec770), step: "stop", github, host: SRC });
  const handed770 = cp.prepareHandoff(rec770, { coordinator: "local_src77", expectRevision: rev(rec770), step: "publish", observations: { sessions: { local_w771: { state: "archived" }, local_w772: { state: "archived" } } }, github, host: SRC });
  const refusal = (n) => handed770.uncertain.find((u) => u.ticket === n && u.status === "not snapshotted")?.reason ?? "";
  assert.match(refusal(771), /config\.txt holds a GitHub token/, "history pushed only to another remote is scanned");
  assert.match(refusal(772), /commit [0-9a-f]{40} holds a GitHub token/, "an unpushed commit message is scanned");
  assert.equal(git(src, "rev-list", "--parents", "-n", "1", cp.fetchState(src, "origin", "acme/widgets", 770).commit).split(" ").length, 2, "neither snapshot was attached");

  // A handoff whose save failed is saved by a later ordinary publish together
  // with its snapshot. The writer had replaced a committed directory with a
  // file and a committed file with a directory; both arrive as they are.
  const rec730 = init(730, "local_src73");
  cp.enable(rec730, { coordinator: "local_src73", expectRevision: 1, github, host: SRC });
  const wt731 = startWriter(rec730, "local_src73", { repository: "acme/widgets", issue: { number: 730, state: "open" }, originMain: "x", tickets: [ticket(731, { parent: 730 })] }, 731, "shapes");
  fs.mkdirSync(path.join(wt731, "entry"));
  fs.writeFileSync(path.join(wt731, "entry", "child.txt"), "child\n");
  fs.writeFileSync(path.join(wt731, "leaf"), "leaf\n");
  fs.writeFileSync(path.join(wt731, "clean.txt"), "base\n");
  fs.writeFileSync(path.join(wt731, ".gitattributes"), "clean.txt text eol=lf\n");
  git(wt731, "add", "-A");
  git(wt731, "commit", "-q", "-m", "shapes");
  // A staged edit, then working bytes whose clean conversion equals HEAD.
  fs.writeFileSync(path.join(wt731, "clean.txt"), "staged edit\n");
  git(wt731, "add", "clean.txt");
  fs.writeFileSync(path.join(wt731, "clean.txt"), "base\r\n");
  assert.match(git(wt731, "status", "--porcelain", "--", "clean.txt"), /^MM clean\.txt$/);
  fs.rmSync(path.join(wt731, "entry"), { recursive: true });
  fs.writeFileSync(path.join(wt731, "entry"), "now a file\n");
  fs.rmSync(path.join(wt731, "leaf"));
  fs.mkdirSync(path.join(wt731, "leaf"));
  fs.writeFileSync(path.join(wt731, "leaf", "inner.txt"), "now a directory\n");
  cp.prepareHandoff(rec730, { coordinator: "local_src73", expectRevision: rev(rec730), step: "stop", github, host: SRC });
  const offline730 = path.join(tmp, "remote-offline-730.git");
  fs.renameSync(remote, offline730);
  let handed730;
  try { handed730 = cp.prepareHandoff(rec730, { coordinator: "local_src73", expectRevision: rev(rec730), step: "publish", observations: { sessions: { local_w731: { state: "archived" } } }, github, host: SRC }); }
  finally { fs.renameSync(offline730, remote); }
  assert.equal(handed730.checkpoint.saved, false, "an offline handoff is reported unsaved");
  assert.equal(handed730.snapshots[731]?.clean, false, JSON.stringify(handed730.uncertain));
  assert.equal(cp.publish(rec730, { coordinator: "local_src73", transition: "the handoff again", github, host: SRC }).saved, true);
  const dst3 = clone("dst3");
  const got731 = cp.retrieve({ repository: "acme/widgets", issue: 730, checkout: dst3, ticket: 731, worktree: path.join(tmp, "dst3-wt-731") });
  assert.equal(got731.verified, true, "the snapshot reached the remote with the retried save");
  assert.equal(fs.readFileSync(path.join(got731.worktree, "entry"), "utf8"), "now a file\n");
  assert.equal(fs.readFileSync(path.join(got731.worktree, "leaf", "inner.txt"), "utf8"), "now a directory\n");
  assert.equal(fs.readFileSync(path.join(got731.worktree, "clean.txt")).toString("hex"), Buffer.from("base\r\n").toString("hex"), "working bytes that normalize to HEAD are kept");
  assert.equal(git(got731.worktree, "show", ":clean.txt"), "staged edit", "and the staged edit beside them");
  // Releasing the writer keeps the snapshot in the latest checkpoint.
  mutate(rec730, "local_src73", (r) => run.release(r, { ticket: 731, observations: { sessions: { local_w731: { state: "archived" } } }, host: SRC, evidence: "its session was archived" }));
  assert.equal(cp.autoCheckpoint(rec730, { coordinator: "local_src73", transition: "the release", github, host: SRC }).saved, true);
  assert.equal(cp.fetchState(dst3, "origin", "acme/widgets", 730).checkpoint.snapshots[731].commit, handed730.snapshots[731].commit, "the snapshot outlives its writer");
  const dst4 = clone("dst4");
  assert.equal(cp.retrieve({ repository: "acme/widgets", issue: 730, checkout: dst4, ticket: 731, worktree: path.join(tmp, "dst4-wt-731") }).verified, true);

  // An unstaged edit whose conversion equals HEAD keeps its bytes; a snapshot
  // stays retrievable beside a worktree that has gone; and edits made after a
  // snapshot are still reported once their writer is released.
  const rec780 = init(780, "local_src78");
  cp.enable(rec780, { coordinator: "local_src78", expectRevision: 1, github, host: SRC });
  const snap780 = { repository: "acme/widgets", issue: { number: 780, state: "open" }, originMain: "x", tickets: [ticket(781, { parent: 780 }), ticket(782, { parent: 780 }), ticket(783, { parent: 780 })] };
  const wt781 = startWriter(rec780, "local_src78", snap780, 781, "unstaged");
  fs.writeFileSync(path.join(wt781, ".gitattributes"), "clean.txt text eol=lf\n");
  fs.writeFileSync(path.join(wt781, "clean.txt"), "base\n");
  git(wt781, "add", "-A");
  git(wt781, "commit", "-q", "-m", "clean");
  fs.writeFileSync(path.join(wt781, "clean.txt"), "base\r\n");
  fs.writeFileSync(path.join(wt781, "draft.txt"), "draft\n");
  assert.equal(git(wt781, "diff", "--name-only", "--", "clean.txt"), "", "a converted diff does not see the edit");
  const wt782 = startWriter(rec780, "local_src78", snap780, 782, "moved");
  fs.writeFileSync(path.join(wt782, "draft.txt"), "moved draft\n");
  const wt783 = startWriter(rec780, "local_src78", snap780, 783, "edited");
  fs.writeFileSync(path.join(wt783, "draft.txt"), "first\n");
  cp.prepareHandoff(rec780, { coordinator: "local_src78", expectRevision: rev(rec780), step: "stop", github, host: SRC });
  const h780 = cp.prepareHandoff(rec780, { coordinator: "local_src78", expectRevision: rev(rec780), step: "publish", observations: { sessions: { local_w781: { state: "running" }, local_w782: { state: "running" }, local_w783: { state: "running" } } }, github, host: SRC });
  assert.ok(h780.snapshots[781].paths.includes("clean.txt"), "the unstaged edit is in the snapshot");
  const moved782 = `${wt782}-moved`;
  fs.renameSync(wt782, moved782);
  fs.appendFileSync(path.join(wt783, "draft.txt"), "second\n");
  assert.equal(cp.autoCheckpoint(rec780, { coordinator: "local_src78", transition: "after the handoff", github, host: SRC }).saved, true);
  mutate(rec780, "local_src78", (r) => run.release(r, { ticket: 783, observations: { sessions: { local_w783: { state: "archived" } } }, host: SRC, evidence: "its session was archived" }));
  fs.renameSync(wt783, `${wt783}-gone`);
  assert.equal(cp.autoCheckpoint(rec780, { coordinator: "local_src78", transition: "the release", github, host: SRC }).saved, true);
  const latest780 = cp.fetchState(dst4, "origin", "acme/widgets", 780).checkpoint;
  assert.deepEqual([at(latest780, 782).exists, latest780.snapshots[782]?.commit], [false, h780.snapshots[782].commit], "the snapshot is named beside its missing worktree");
  const lim780 = cp.limitations(latest780, { host: DST });
  assert.ok(lim780.some((l) => l.ticket === 783 && l.kind === "unpublished" && /src-host held unfinished files .* may exist only there; snapshot [0-9a-f]+ holds only what was saved/.test(l.detail)), "the edits after the snapshot are still reported after the release");
  assertNoCoverage(latest780, "after a release and a missing worktree");
  assert.ok(lim780.some((l) => l.ticket === 783 && l.kind === "snapshot"));
  const row783 = github.get(JSON.parse(fs.readFileSync(cp.sidecarOf(rec780), "utf8")).summary.commentId).body.split("\n").find((line) => line.startsWith("| #783 "));
  assert.match(row783, /src-host: worktree missing, as of [^,]+, unpushed commits, unfinished files; snapshot [0-9a-f]+ from src-host/, "the summary carries the last observation, never a clean state");
  // A worktree never observed renders as unknown, not as clean and pushed.
  const unseen = structuredClone(latest780);
  unseen.work[Object.keys(unseen.work).find((k) => unseen.work[k].ticket === 782)] = { ticket: 782, host: SRC, worktree: moved782, branch: "feat/782-moved", exists: false, observedAt: "now" };
  assert.match(cp.renderSummary({ commit: "0".repeat(40), checkpoint: unseen }, "acme/widgets").split("\n").find((line) => line.startsWith("| #782 ")), /worktree missing, push state unknown, file state unknown; snapshot [0-9a-f]+ from src-host/);
  // An observation that passes through later checkpoints keeps its own time,
  // clean or not, so it never reads as current.
  const old = structuredClone(latest780);
  old.work[Object.keys(old.work).find((k) => old.work[k].ticket === 782)] = { ticket: 782, host: SRC, worktree: moved782, branch: "feat/782-moved", exists: true, head: "x", dirty: false, unpushed: false, observedAt: "2026-10-01T00:00:00.000Z" };
  assert.match(cp.renderSummary({ commit: "0".repeat(40), checkpoint: old }, "acme/widgets").split("\n").find((line) => line.startsWith("| #782 ")), /src-host: as of 2026-10-01T00:00:00\.000Z, head pushed, clean/);
  const got781 = cp.retrieve({ repository: "acme/widgets", issue: 780, checkout: dst4, ticket: 781, worktree: path.join(tmp, "dst4-wt-781") });
  assert.equal(fs.readFileSync(path.join(got781.worktree, "clean.txt")).toString("hex"), Buffer.from("base\r\n").toString("hex"), "the unstaged bytes arrive");
  assert.equal(fs.readFileSync(path.join(cp.retrieve({ repository: "acme/widgets", issue: 780, checkout: dst4, ticket: 782, worktree: path.join(tmp, "dst4-wt-782") }).worktree, "draft.txt"), "utf8"), "moved draft\n");
  fs.renameSync(moved782, wt782);

  // A takeover on the same machine (another account) keeps the snapshots
  // retrievable, and a commit made after a snapshot whose files still match
  // is reported as existing only on its host.
  const rec790 = init(790, "local_src79");
  cp.enable(rec790, { coordinator: "local_src79", expectRevision: 1, github, host: SRC });
  const snap790 = { repository: "acme/widgets", issue: { number: 790, state: "open" }, originMain: "x", tickets: [ticket(791, { parent: 790 }), ticket(792, { parent: 790 })] };
  const wt791 = startWriter(rec790, "local_src79", snap790, 791, "kept");
  fs.writeFileSync(path.join(wt791, "draft.txt"), "kept draft\n");
  const wt792 = startWriter(rec790, "local_src79", snap790, 792, "committed");
  fs.writeFileSync(path.join(wt792, "staged.txt"), "staged\n");
  git(wt792, "add", "staged.txt");
  cp.prepareHandoff(rec790, { coordinator: "local_src79", expectRevision: rev(rec790), step: "stop", github, host: SRC });
  const h790 = cp.prepareHandoff(rec790, { coordinator: "local_src79", expectRevision: rev(rec790), step: "publish", observations: { sessions: { local_w791: { state: "running" }, local_w792: { state: "running" } } }, github, host: SRC });
  git(wt792, "commit", "-q", "-m", "the staged work, committed after the snapshot");
  assert.equal(cp.autoCheckpoint(rec790, { coordinator: "local_src79", transition: "a later milestone", github, host: SRC }).saved, true);
  const after792 = at(cp.fetchState(src, "origin", "acme/widgets", 790).checkpoint, 792);
  assert.deepEqual([after792.unpushed, after792.head === h790.snapshots[792].head], [true, false], "the head moved after the snapshot");
  // The draft changes after the last save; the takeover observes it afresh.
  fs.appendFileSync(path.join(wt791, "draft.txt"), "edited after the last save\n");
  const rec790b = path.join(srcPrivate, "run-790-second-account.json");
  const sameHost = cp.resume({ record: rec790b, checkout: src, repository: "acme/widgets", issue: 790, coordinator: "local_src79b", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #790.", evidence: "the first account reached its usage limit" }, { github, host: SRC, defaults, totalMemory: 64 * GB });
  assert.ok(sameHost.limitations.some((l) => l.ticket === 792 && l.kind === "unpublished" && /src-host held unpushed commits in .* that may exist only there/.test(l.detail)), "commits after a matching snapshot are not hidden");
  assert.ok(sameHost.limitations.some((l) => l.ticket === 791 && l.kind === "unpublished" && /src-host held unfinished files/.test(l.detail)), "the takeover reports what its own checkpoint observed");
  const taken790 = cp.fetchState(dst4, "origin", "acme/widgets", 790);
  assert.equal(taken790.checkpoint.coordinator.session, "local_src79b");
  assert.equal(taken790.checkpoint.snapshots[791]?.commit, h790.snapshots[791].commit, "the takeover's own checkpoint names the snapshot");
  assert.match(taken790.brief, /src-host held unpushed commits in .* that may exist only there/);
  assertNoCoverage(taken790.checkpoint, "a same-machine takeover");
  assert.equal(fs.readFileSync(path.join(cp.retrieve({ repository: "acme/widgets", issue: 790, checkout: dst4, ticket: 791, worktree: path.join(tmp, "dst4-wt-791") }).worktree, "draft.txt"), "utf8"), "kept draft\n");

  // Snapshot coverage at its edges: a staged rename with an edit, a large
  // binary file and a symbolic link are carried exactly; an unmerged index
  // and a changed submodule are refused and reported as not snapshotted.
  // Then the run passes through two takeovers across hosts.
  const THIRD = "third-host";
  const rec795 = init(795, "local_src95", { concurrency: 8 });
  cp.enable(rec795, { coordinator: "local_src95", expectRevision: 1, github, host: SRC });
  const snap795 = { repository: "acme/widgets", issue: { number: 795, state: "open" }, originMain: "x", tickets: [796, 797, 798, 799, 800].map((n) => ticket(n, { parent: 795 })) };
  const wtRename = startWriter(rec795, "local_src95", snap795, 796, "rename");
  fs.writeFileSync(path.join(wtRename, "old.txt"), "old contents\n");
  git(wtRename, "add", "old.txt");
  git(wtRename, "commit", "-q", "-m", "old");
  git(wtRename, "mv", "old.txt", "new.txt");
  fs.writeFileSync(path.join(wtRename, "new.txt"), "renamed and edited\n");
  const wtBinary = startWriter(rec795, "local_src95", snap795, 797, "binary");
  const binary = Buffer.alloc(5 * 2 ** 20, 0);
  for (let i = 0; i < binary.length; i++) binary[i] = (i * 131 + (i >> 9)) % 256;
  fs.writeFileSync(path.join(wtBinary, "blob.bin"), binary);
  const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
  const wtLink = startWriter(rec795, "local_src95", snap795, 798, "link");
  let linked = true;
  try { fs.symlinkSync("README.md", path.join(wtLink, "link.txt")); } catch (error) { linked = false; console.log(`symbolic links unavailable here (${error.code}); the link case runs where they are`); }
  fs.writeFileSync(path.join(wtLink, "beside.txt"), "beside the link\n");
  const wtMerge = startWriter(rec795, "local_src95", snap795, 799, "merge");
  fs.writeFileSync(path.join(wtMerge, "conflict.txt"), "base\n");
  git(wtMerge, "add", "conflict.txt");
  git(wtMerge, "commit", "-q", "-m", "base");
  git(wtMerge, "branch", "side-799");
  fs.writeFileSync(path.join(wtMerge, "conflict.txt"), "ours\n");
  git(wtMerge, "commit", "-q", "-am", "ours");
  git(wtMerge, "checkout", "-q", "side-799");
  fs.writeFileSync(path.join(wtMerge, "conflict.txt"), "theirs\n");
  git(wtMerge, "commit", "-q", "-am", "theirs");
  git(wtMerge, "checkout", "-q", "feat/799-merge");
  assert.throws(() => git(wtMerge, "merge", "-q", "side-799"), /conflict|Command failed/i);
  const subRepo = path.join(tmp, "sub-repo");
  fs.mkdirSync(subRepo);
  git(subRepo, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(subRepo, "inner.txt"), "inner\n");
  git(subRepo, "add", "inner.txt");
  git(subRepo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "inner");
  const wtSub = startWriter(rec795, "local_src95", snap795, 800, "submodule");
  git(wtSub, "-c", "protocol.file.allow=always", "submodule", "add", "-q", subRepo.replace(/\\/g, "/"), "sub");
  cp.prepareHandoff(rec795, { coordinator: "local_src95", expectRevision: rev(rec795), step: "stop", github, host: SRC });
  const running795 = Object.fromEntries([796, 797, 798, 799, 800].map((n) => [`local_w${n}`, { state: "running" }]));
  const h795 = cp.prepareHandoff(rec795, { coordinator: "local_src95", expectRevision: rev(rec795), step: "publish", observations: { sessions: running795 }, github, host: SRC });
  const notSnapshotted = (n) => h795.uncertain.find((u) => u.ticket === n && u.status === "not snapshotted")?.reason ?? "";
  assert.match(notSnapshotted(799), /unmerged paths \(conflict\.txt\)/, "an unmerged index is refused");
  assert.match(notSnapshotted(800), /changed submodules \(sub\)/, "a changed submodule is refused");
  assert.deepEqual([796, 797, 798].map((n) => h795.snapshots[n]?.clean), [false, false, false]);
  const lim795 = cp.limitations(cp.fetchState(src, "origin", "acme/widgets", 795).checkpoint, { host: DST });
  assert.ok([799, 800].every((n) => lim795.some((l) => l.ticket === n && l.kind === "unpublished")), "refused work is reported as existing only on its host");

  // Two takeovers: the source to a destination, then to a third host.
  const dst5 = clone("dst5"), dst6 = clone("dst6");
  const takeover795 = (checkout, record, coordinator, host) => cp.resume({ record, checkout, repository: "acme/widgets", issue: 795, coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #795.", evidence: `${coordinator}'s predecessor is out of usage` }, { github, host, defaults, totalMemory: 64 * GB });
  takeover795(dst5, path.join(dstPrivate, "run-795.json"), "local_dst95", DST);
  fs.mkdirSync(path.join(tmp, "third-private"));
  const third = takeover795(dst6, path.join(tmp, "third-private", "run-795.json"), "local_third95", THIRD);
  const chained = cp.fetchState(dst6, "origin", "acme/widgets", 795).checkpoint;
  assert.deepEqual(chained.previousCoordinators.map((p) => [p.session, p.host]), [["local_src95", SRC], ["local_dst95", DST]], "both earlier coordinators stay in the record");
  assert.deepEqual([796, 797, 798].map((n) => [at(chained, n).host, chained.snapshots[n]?.commit]), [796, 797, 798].map((n) => [SRC, h795.snapshots[n].commit]), "the source's snapshots survive two takeovers under their own host");
  assert.ok([796, 797, 798, 799, 800].every((n) => third.limitations.some((l) => l.ticket === n && l.kind === "owner" && l.status === "unknown")), "the source's writers stay unknown on the third host");
  assert.ok([799, 800].every((n) => third.limitations.some((l) => l.ticket === n && l.kind === "unpublished")));
  // The third host retrieves the source's work exactly.
  const gotRename = cp.retrieve({ repository: "acme/widgets", issue: 795, checkout: dst6, ticket: 796, worktree: path.join(tmp, "dst6-wt-796") });
  assert.deepEqual([fs.existsSync(path.join(gotRename.worktree, "old.txt")), fs.readFileSync(path.join(gotRename.worktree, "new.txt"), "utf8")], [false, "renamed and edited\n"]);
  assert.equal(git(gotRename.worktree, "diff", "--cached", "--name-status", "-M"), git(wtRename, "diff", "--cached", "--name-status", "-M"), "the staged rename arrives");
  const gotBinary = cp.retrieve({ repository: "acme/widgets", issue: 795, checkout: dst6, ticket: 797, worktree: path.join(tmp, "dst6-wt-797") });
  assert.equal(sha(fs.readFileSync(path.join(gotBinary.worktree, "blob.bin"))), sha(binary), "the binary file arrives byte for byte");
  const gotLink = cp.retrieve({ repository: "acme/widgets", issue: 795, checkout: dst6, ticket: 798, worktree: path.join(tmp, "dst6-wt-798") });
  assert.equal(gotLink.verified, true);
  if (linked) {
    const there = fs.lstatSync(path.join(gotLink.worktree, "link.txt"));
    assert.equal(there.isSymbolicLink() ? fs.readlinkSync(path.join(gotLink.worktree, "link.txt")) : fs.readFileSync(path.join(gotLink.worktree, "link.txt"), "utf8"), "README.md", "the link keeps its target");
  }

  // Work beside an existing snapshot, by location: a conflicting merge, an
  // edit inside a submodule and work the snapshot holds whole are all
  // reported; work another host adopts after retrieving it keeps its
  // snapshot; and a source host's newer observation is never undone by an
  // older one after a takeover round trip.
  const rec810 = init(810, "local_src81", { concurrency: 8 });
  cp.enable(rec810, { coordinator: "local_src81", expectRevision: 1, github, host: SRC });
  const snap810 = { repository: "acme/widgets", issue: { number: 810, state: "open" }, originMain: "x", tickets: [811, 812, 813, 814, 815].map((n) => ticket(n, { parent: 810 })) };
  const wt811 = startWriter(rec810, "local_src81", snap810, 811, "conflict");
  fs.writeFileSync(path.join(wt811, "conflict.txt"), "base\n");
  git(wt811, "add", "conflict.txt");
  git(wt811, "commit", "-q", "-m", "base");
  git(wt811, "branch", "side-811");
  fs.writeFileSync(path.join(wt811, "conflict.txt"), "ours\n");
  git(wt811, "commit", "-q", "-am", "ours");
  git(wt811, "checkout", "-q", "side-811");
  fs.writeFileSync(path.join(wt811, "conflict.txt"), "theirs\n");
  git(wt811, "commit", "-q", "-am", "theirs");
  git(wt811, "checkout", "-q", "feat/811-conflict");
  fs.writeFileSync(path.join(wt811, "draft.txt"), "first draft\n");
  const wt812 = startWriter(rec810, "local_src81", snap810, 812, "submodule");
  git(wt812, "-c", "protocol.file.allow=always", "submodule", "add", "-q", subRepo.replace(/\\/g, "/"), "sub");
  git(wt812, "commit", "-q", "-m", "a submodule, not pushed");
  fs.writeFileSync(path.join(wt812, "draft.txt"), "draft\n");
  const wt813 = startWriter(rec810, "local_src81", snap810, 813, "adopted");
  fs.writeFileSync(path.join(wt813, "draft.txt"), "adopted draft\n");
  const wt814 = startWriter(rec810, "local_src81", snap810, 814, "pushed");
  const wt815 = startWriter(rec810, "local_src81", snap810, 815, "ancestor");
  for (const name of ["one", "two"]) { fs.writeFileSync(path.join(wt815, `${name}.txt`), `${name}\n`); git(wt815, "add", `${name}.txt`); git(wt815, "commit", "-q", "-m", name); }
  fs.writeFileSync(path.join(wt815, "draft.txt"), "staged draft\n");
  git(wt815, "add", "draft.txt");
  cp.prepareHandoff(rec810, { coordinator: "local_src81", expectRevision: rev(rec810), step: "stop", github, host: SRC });
  const h810 = cp.prepareHandoff(rec810, { coordinator: "local_src81", expectRevision: rev(rec810), step: "publish", observations: { sessions: Object.fromEntries([811, 812, 813, 814, 815].map((n) => [`local_w${n}`, { state: "running" }])) }, github, host: SRC });
  assert.deepEqual([811, 812, 813, 815].map((n) => h810.snapshots[n]?.clean), [false, false, false, false], "an unpushed submodule commit does not stop a snapshot");
  assert.throws(() => git(wt811, "merge", "-q", "side-811"), /conflict|Command failed/i);
  fs.writeFileSync(path.join(wt811, "draft.txt"), "second draft\n");
  fs.writeFileSync(path.join(wt812, "sub", "inner.txt"), "edited inside\n");
  fs.writeFileSync(path.join(wt814, "draft.txt"), "pending\n");
  git(wt815, "reset", "-q", "--soft", "HEAD~1");
  assert.equal(cp.autoCheckpoint(rec810, { coordinator: "local_src81", transition: "after the handoff", github, host: SRC }).saved, true);
  const lim810 = cp.limitations(cp.fetchState(src, "origin", "acme/widgets", 810).checkpoint, { host: DST });
  const only = (n) => lim810.filter((l) => l.ticket === n && l.kind === "unpublished").map((l) => l.detail).join(" | ");
  assert.match(only(811), /src-host held unfinished files/, "a conflicting merge after the snapshot is reported");
  assert.match(only(812), /src-host held unfinished files/, "an edit inside a submodule after the snapshot is reported");
  assert.match(only(814), /src-host held unfinished files/);
  assert.match(only(815), /src-host held unfinished files and unpushed commits/, "work a snapshot holds whole is still reported, since nothing is judged covered");
  assertNoCoverage(cp.fetchState(src, "origin", "acme/widgets", 810).checkpoint, "after a soft reset under a snapshot");
  mutate(rec810, "local_src81", (r) => { for (const n of [813, 814]) run.release(r, { ticket: n, observations: { sessions: { [`local_w${n}`]: { state: "archived" } } }, host: SRC, evidence: "its session was archived" }); });
  cp.autoCheckpoint(rec810, { coordinator: "local_src81", transition: "two releases", github, host: SRC });
  // A review checkpoint decision read back as published on its PR is linked
  // from the state branch beside a hand-recorded reference; an unpublished
  // one is not, and a takeover keeps each link once.
  const pubUrl = "https://github.com/acme/widgets/pull/911#issuecomment-5001";
  mutate(rec810, "local_src81", (r) => {
    r.tickets[811].checkpoints = [
      { id: "d1", kind: "extend", pr: 911, round: 3, head: "a".repeat(40), state: "published", published: { comment: 5001, time: "2026-10-13T00:00:00.000Z" } },
      { id: "d2", kind: "accept-unreviewed", pr: 911, round: 4, head: "b".repeat(40), state: "intent" },
    ];
    cp.reference(r, { pr: 912, url: "https://github.com/acme/widgets/pull/912#issuecomment-6001", kind: "maintainer answer" });
  });
  cp.autoCheckpoint(rec810, { coordinator: "local_src81", transition: "a published decision", github, host: SRC });
  const decisionLinked = (c) => c.decisions.map((l) => `${l.url} ${l.kind}${l.id ? ` ${l.id}` : ""}`).sort();
  const links810 = [`${pubUrl} review-checkpoint extend d1`, "https://github.com/acme/widgets/pull/912#issuecomment-6001 maintainer answer"].sort();
  assert.deepEqual(decisionLinked(cp.fetchState(src, "origin", "acme/widgets", 810).checkpoint), links810, "the published decision is linked; the intent is not");
  // Another host takes over, retrieves #813 and adopts its work there.
  const dst7 = clone("dst7"), dst8 = clone("dst8");
  const rec810b = path.join(dstPrivate, "run-810.json");
  const resume810 = (record, checkout, coordinator, host) => cp.resume({ record, checkout, repository: "acme/widgets", issue: 810, coordinator, harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #810.", evidence: "the previous coordinator is out of usage" }, { github, host, defaults, totalMemory: 64 * GB });
  resume810(rec810b, dst7, "local_dst81", DST);
  const wt813b = path.join(tmp, "dst7-wt-813");
  cp.retrieve({ repository: "acme/widgets", issue: 810, checkout: dst7, ticket: 813, worktree: wt813b });
  const planB = write("plan-810b.json", run.planDispatch({ record: run.readRecord(rec810b), snapshot: { ...snap810, tickets: snap810.tickets.map((t) => (t.number === 813 ? { ...t, worktrees: [{ path: wt813b, branch: "feat/813-adopted", head: "x" }] } : t)) }, preflights: [], freeBytes: 100 * GB, defaults, host: DST }));
  mutate(rec810b, "local_dst81", (r) => run.adopt(r, { plan: planB, ticket: 813, handleKind: "session", handle: "local_b813", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: wt813b, host: DST }));
  assert.equal(cp.autoCheckpoint(rec810b, { coordinator: "local_dst81", transition: "the adoption", github, host: DST }).saved, true);
  const adopted810 = cp.fetchState(dst8, "origin", "acme/widgets", 810).checkpoint;
  assert.deepEqual(decisionLinked(adopted810), links810, "the takeover keeps each decision link once");
  assert.equal(adopted810.tickets[811].checkpoints.length, 2, "the decisions themselves stay in the ticket for review-checkpoint.mjs to verify");
  const row811 = github.get(JSON.parse(fs.readFileSync(cp.sidecarOf(rec810b), "utf8")).summary.commentId).body.split("\n").find((line) => line.startsWith("| #811 "));
  assert.match(row811, new RegExp(`src-host: as of ${at(adopted810, 811).observedAt.replace(/\./g, "\\.")}, `), "the destination's summary shows the source's observation at its own time");
  assert.equal(adopted810.snapshots[813]?.commit, h810.snapshots[813].commit, "the adopted work keeps its snapshot");
  assert.deepEqual(cp.workFor(adopted810, 813).map((w) => w.host).sort(), [DST, SRC], "the adopting host records its own location, and the source's draft stays reported");
  assert.ok(cp.limitations(adopted810, { host: THIRD }).some((l) => l.ticket === 813 && l.kind === "unpublished" && /dst-host held unfinished files/.test(l.detail)), "the adopted work is reported where it now is, beside its snapshot");
  assertNoCoverage(adopted810, "after another host adopts retrieved work");
  assert.equal(fs.readFileSync(path.join(cp.retrieve({ repository: "acme/widgets", issue: 810, checkout: dst8, ticket: 813, worktree: path.join(tmp, "dst8-wt-813") }).worktree, "draft.txt"), "utf8"), "adopted draft\n");
  // #814's work is committed and pushed on the source, which takes the run back.
  git(wt814, "add", "-A");
  git(wt814, "commit", "-q", "-m", "the pending work");
  git(wt814, "push", "-q", "origin", "HEAD:refs/heads/feat/814-pushed");
  const rec810c = path.join(srcPrivate, "run-810-back.json");
  resume810(rec810c, src, "local_src81c", SRC);
  mutate(rec810c, "local_src81c", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  assert.equal(cp.autoCheckpoint(rec810c, { coordinator: "local_src81c", transition: "a later note", github, host: SRC }).saved, true);
  const back810 = cp.fetchState(dst8, "origin", "acme/widgets", 810).checkpoint;
  assert.ok(!cp.limitations(back810, { host: DST }).some((l) => l.ticket === 814 && l.kind === "unpublished"), "a newer observation on the source is not undone by an older one");
  assert.ok(!cp.workFor(back810, 814).some((w) => w.dirty || w.lastObserved?.dirty));

  // A snapshot made offline against a stale branch is scanned again before it
  // is published; a filter-hidden edit counts as unfinished work; and a
  // location's work stays reported once another host replaces the snapshot.
  const rec820 = init(820, "local_src82", { concurrency: 8 });
  cp.enable(rec820, { coordinator: "local_src82", expectRevision: 1, github, host: SRC });
  const snap820 = { repository: "acme/widgets", issue: { number: 820, state: "open" }, originMain: "x", tickets: [821, 822, 823].map((n) => ticket(n, { parent: 820 })) };
  const wt821 = startWriter(rec820, "local_src82", snap820, 821, "stale");
  fs.writeFileSync(path.join(wt821, "config.txt"), `token ${fakeToken}\n`);
  git(wt821, "add", "config.txt");
  git(wt821, "commit", "-q", "-m", "a secret, pushed then deleted");
  git(wt821, "push", "-q", "origin", "HEAD:refs/heads/feat/821-stale");
  git(dst, "push", "-q", "origin", "--delete", "feat/821-stale");
  assert.ok(git(src, "for-each-ref", "refs/remotes/origin/feat/821-stale"), "the source still has the deleted branch's tracking ref");
  fs.writeFileSync(path.join(wt821, "config.txt"), "no secret\n");
  git(wt821, "commit", "-q", "-am", "secret removed");
  fs.writeFileSync(path.join(wt821, "draft.txt"), "draft\n");
  git(src, "config", "filter.lower.clean", "tr A-Z a-z");
  const wt822 = startWriter(rec820, "local_src82", snap820, 822, "filtered");
  fs.writeFileSync(path.join(wt822, ".gitattributes"), "filtered.txt filter=lower\n");
  fs.writeFileSync(path.join(wt822, "filtered.txt"), "lower case\n");
  git(wt822, "add", "-A");
  git(wt822, "commit", "-q", "-m", "a filtered file");
  git(wt822, "push", "-q", "origin", "HEAD:refs/heads/feat/822-filtered");
  const wt823 = startWriter(rec820, "local_src82", snap820, 823, "replaced");
  fs.writeFileSync(path.join(wt823, "draft.txt"), "snapshot A\n");
  cp.prepareHandoff(rec820, { coordinator: "local_src82", expectRevision: rev(rec820), step: "stop", github, host: SRC });
  const offline820 = path.join(tmp, "remote-offline-820.git");
  fs.renameSync(remote, offline820);
  let h820;
  try { h820 = cp.prepareHandoff(rec820, { coordinator: "local_src82", expectRevision: rev(rec820), step: "publish", observations: { sessions: Object.fromEntries([821, 822, 823].map((n) => [`local_w${n}`, { state: "running" }])) }, github, host: SRC }); }
  finally { fs.renameSync(offline820, remote); }
  assert.deepEqual([h820.checkpoint.saved, h820.snapshots[821]?.clean, h820.snapshots[823]?.clean], [false, false, false], "offline, the stale branch let the snapshot through");
  fs.writeFileSync(path.join(wt822, "filtered.txt"), "LOWER CASE\n");
  fs.utimesSync(path.join(wt822, "filtered.txt"), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  assert.equal(git(wt822, "--no-optional-locks", "status", "--porcelain"), "", "the filter hides the edit from Git's status");
  const online820 = cp.publish(rec820, { coordinator: "local_src82", transition: "the handoff online", github, host: SRC });
  assert.equal(online820.saved, true);
  assert.match(online820.refusedSnapshots?.[821]?.join(" ") ?? "", /config\.txt holds a GitHub token/, "the snapshot is scanned again against the remote as it is now");
  const c820 = cp.fetchState(dst, "origin", "acme/widgets", 820);
  assert.deepEqual([c820.checkpoint.snapshots[821], Boolean(c820.checkpoint.snapshots[823])], [undefined, true]);
  assert.ok(!git(dst, "rev-list", c820.commit).split(/\r?\n/).includes(git(wt821, "rev-parse", "HEAD~1")), "the credential-bearing commit is not reachable from the state branch");
  const lim820 = (c) => (n, host = DST) => cp.limitations(c, { host }).filter((l) => l.ticket === n && l.kind === "unpublished").map((l) => l.detail).join(" | ");
  assert.match(lim820(c820.checkpoint)(821), /src-host held/, "the refused snapshot's work is reported as existing only on its host");
  assert.match(lim820(c820.checkpoint)(822), /src-host held unfinished files/, "a filter-hidden edit is unfinished work");
  mutate(rec820, "local_src82", (r) => run.release(r, { ticket: 822, observations: { sessions: { local_w822: { state: "archived" } } }, host: SRC, evidence: "its session was archived" }));
  cp.autoCheckpoint(rec820, { coordinator: "local_src82", transition: "the release", github, host: SRC });
  assert.match(lim820(cp.fetchState(dst, "origin", "acme/widgets", 820).checkpoint)(822), /src-host held unfinished files/, "and it survives the release");
  // Another host adopts #823's work, changes it and snapshots it again.
  const dst9 = clone("dst9");
  const rec820b = path.join(dstPrivate, "run-820.json");
  cp.resume({ record: rec820b, checkout: dst9, repository: "acme/widgets", issue: 820, coordinator: "local_dst82", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #820.", evidence: "the source account is out of usage" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  mutate(rec820b, "local_dst82", (r) => run.release(r, { ticket: 823, observations: { sessions: { local_w823: { state: "archived", host: SRC } } }, host: DST, evidence: "the maintainer archived it on the source" }));
  const wt823b = path.join(tmp, "dst9-wt-823");
  cp.retrieve({ repository: "acme/widgets", issue: 820, checkout: dst9, ticket: 823, worktree: wt823b });
  const plan820 = write("plan-820b.json", run.planDispatch({ record: run.readRecord(rec820b), snapshot: { ...snap820, tickets: snap820.tickets.map((t) => (t.number === 823 ? { ...t, worktrees: [{ path: wt823b, branch: "feat/823-replaced", head: "x" }] } : t)) }, preflights: [], freeBytes: 100 * GB, defaults, host: DST }));
  mutate(rec820b, "local_dst82", (r) => run.adopt(r, { plan: plan820, ticket: 823, handleKind: "session", handle: "local_b823", route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree: wt823b, host: DST }));
  fs.writeFileSync(path.join(wt823b, "draft.txt"), "snapshot B\n");
  cp.prepareHandoff(rec820b, { coordinator: "local_dst82", expectRevision: rev(rec820b), step: "stop", github, host: DST });
  const h820b = cp.prepareHandoff(rec820b, { coordinator: "local_dst82", expectRevision: rev(rec820b), step: "publish", observations: { sessions: { local_b823: { state: "running" } } }, github, host: DST });
  assert.notEqual(h820b.snapshots[823]?.commit, h820.snapshots[823].commit, "the ticket has a new snapshot");
  assert.match(lim820(cp.fetchState(dst9, "origin", "acme/widgets", 820).checkpoint)(823, THIRD), /src-host held unfinished files.* in .*src-wt-823/, "the source's work is still reported once the snapshot is replaced");
  assertNoCoverage(cp.fetchState(dst9, "origin", "acme/widgets", 820).checkpoint, "after a snapshot is replaced");

  // A run whose first checkpoint never saved hands off while offline; the
  // first saved checkpoint then carries the snapshot with no previous one,
  // and a fresh destination still reads it.
  const rec760 = init(760, "local_src76");
  mutate(rec760, "local_src76", (r) => { r.checkpoints = { remote: "origin", branch: cp.stateBranch(760) }; });
  const wt761 = startWriter(rec760, "local_src76", { repository: "acme/widgets", issue: { number: 760, state: "open" }, originMain: "x", tickets: [ticket(761, { parent: 760 })] }, 761, "first");
  fs.writeFileSync(path.join(wt761, "draft.txt"), "first draft\n");
  const offline760 = path.join(tmp, "remote-offline-760.git");
  fs.renameSync(remote, offline760);
  try {
    assert.equal(cp.prepareHandoff(rec760, { coordinator: "local_src76", expectRevision: rev(rec760), step: "stop", github, host: SRC }).checkpoint.saved, false);
    assert.equal(cp.prepareHandoff(rec760, { coordinator: "local_src76", expectRevision: rev(rec760), step: "publish", observations: { sessions: { local_w761: { state: "archived" } } }, github, host: SRC }).checkpoint.saved, false);
  } finally { fs.renameSync(offline760, remote); }
  const first760 = cp.publish(rec760, { coordinator: "local_src76", transition: "the first save", github, host: SRC });
  assert.deepEqual([first760.saved, first760.seq], [true, 1]);
  const found760 = cp.discover({ repository: "acme/widgets", issue: 760, checkout: dst3, github });
  assert.deepEqual([found760.found, found760.checkpoint.previous, found760.checkpoint.snapshotParents.length], [true, null, 1], "the first checkpoint names its snapshot parent");
  assert.equal(fs.readFileSync(path.join(cp.retrieve({ repository: "acme/widgets", issue: 760, checkout: dst3, ticket: 761, worktree: path.join(tmp, "dst3-wt-761") }).worktree, "draft.txt"), "utf8"), "first draft\n");
  mutate(rec760, "local_src76", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  assert.equal(cp.autoCheckpoint(rec760, { coordinator: "local_src76", transition: "a later note", github, host: SRC }).saved, true, "the chain continues after a first checkpoint with a snapshot parent");
  assert.deepEqual(cp.fetchState(dst3, "origin", "acme/widgets", 760).checkpoint.snapshotParents, [], "a snapshot already in the history is not added again");

  // A destination machine retrieves the unfinished work from the snapshot.
  const dst2 = clone("dst2");
  // The destination checks text out with CRLF; the retrieved bytes are still
  // the source's.
  git(dst2, "config", "core.autocrlf", "true");
  const retrieved = cp.retrieve({ repository: "acme/widgets", issue: 700, checkout: dst2, ticket: 702, worktree: path.join(tmp, "dst2-wt-702") });
  assert.equal(retrieved.verified, true);
  assert.deepEqual(bytes(retrieved.worktree), sourceBytes, "the unfinished file bytes arrive");
  assert.equal(git(retrieved.worktree, "diff", "--cached", "--name-only"), staged, "the staged state arrives");
  assert.ok(!fs.existsSync(path.join(retrieved.worktree, "trace.log")), "ignored files are not part of the snapshot");
  assert.throws(() => cp.retrieve({ repository: "acme/widgets", issue: 700, checkout: dst2, ticket: 701, worktree: path.join(tmp, "dst2-wt-701") }), /holds no snapshot for #701/);

  // The takeover keeps the explicit writer override, which a new override
  // still replaces.
  const rec700d = path.join(tmp, "dst2-private", "run-700.json");
  fs.mkdirSync(path.dirname(rec700d));
  const taken700 = cp.resume({ record: rec700d, checkout: dst2, repository: "acme/widgets", issue: 700, coordinator: "local_dst7", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #700.", evidence: "planned handoff" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(run.readRecord(rec700d).writer.model, "gpt-6-astra");
  assert.match(run.readRecord(rec700d).writer.source, /carried from local_src7/);
  assert.ok(taken700.limitations.some((l) => l.ticket === 702 && l.kind === "snapshot"));
  assert.deepEqual([at(cp.fetchState(dst2, "origin", "acme/widgets", 700).checkpoint, 702).host, at(cp.fetchState(dst2, "origin", "acme/widgets", 700).checkpoint, 702).worktree], [SRC, wt702], "another host's snapshot keeps the entry that describes its host");
  assert.ok(taken700.limitations.some((l) => l.ticket === 702 && l.kind === "unpublished" && /src-host held unfinished files/.test(l.detail)), "snapshotted work is still reported as possibly existing only on its host");
  assert.equal(run.planDispatch({ record: run.readRecord(rec700d), snapshot: snap700, preflights: [astra([703])], freeBytes: 100 * GB, defaults, host: DST }).tickets.find((t) => t.number === 703).action, "dispatch", "the new coordinator admits work again");

  // --- Credentials and network failure ------------------------------------

  mutate(rec700d, "local_dst7", (r) => { r.log.push({ time: new Date().toISOString(), event: "note", text: `pasted ${fakeToken}` }); });
  const before700 = git(dst2, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-700");
  assert.throws(() => cp.publish(rec700d, { coordinator: "local_dst7", github, host: DST }), /would publish credentials: \$\.log\[\d+\]\.text holds a GitHub token/);
  assert.equal(git(dst2, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-700"), before700, "nothing was pushed");
  assert.deepEqual(cp.credentialFindings({ url: "https://user:secret@example.com/x", q: "https://h/x?token=abc" }).length, 2);

  // A takeover interrupted after its push, before the local pointer was
  // written, is repaired by resuming again in the same session.
  const pointer700 = run.pointerFile(dst2, "acme/widgets", 700);
  fs.unlinkSync(pointer700);
  assert.throws(() => mutate(rec700d, "local_dst7", () => {}), /no longer coordinates the parent issue/);
  const repairedTakeover = cp.resume({ record: rec700d, checkout: dst2, repository: "acme/widgets", issue: 700, coordinator: "local_dst7", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #700.", evidence: "planned handoff" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(repairedTakeover.action, "resume");
  mutate(rec700d, "local_dst7", (r) => { r.log.pop(); });
  // A second takeover still carries the first invocation's explicit override.
  const rec700e = path.join(tmp, "dst2-private", "run-700-second.json");
  cp.resume({ record: rec700e, checkout: dst2, repository: "acme/widgets", issue: 700, coordinator: "local_dst7b", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #700.", evidence: "the second account is out of usage" }, { github, host: DST, defaults, totalMemory: 64 * GB });
  assert.deepEqual([run.readRecord(rec700e).writer.model, run.readRecord(rec700e).invocation.writerModel], ["gpt-6-astra", "gpt-6-astra"], "an explicit writer override survives every takeover");
  assert.match(run.readRecord(rec700e).writer.source, /carried from local_src7/);

  // The command line: an automatic checkpoint follows each transition, and an
  // unreachable remote leaves the change local, reported as unsaved, and
  // blocks any writer start until a checkpoint is saved.
  const rec800 = path.join(dstPrivate, "run-800.json");
  run.initRecord({ record: rec800, checkout: dst, repository: "acme/widgets", issue: 800, coordinator: "local_cli", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #800." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
  cp.main(["enable", "--record", rec800, "--coordinator", "local_cli", "--expect-revision", "1"], { github });
  // Like init, resume from the command line takes the title slug, so a takeover
  // of a checkpoint made before titles were recorded still gets its title.
  assert.throws(() => cp.main(["resume", "--record", path.join(dstPrivate, "run-800b.json"), "--checkout", dst, "--repo", "acme/widgets", "--issue", "800", "--harness", "claude", "--coordinator", "local_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "--coordinator-mode", "bypassPermissions", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--invocation", "Use orchestrate-issues for #800."], { github }), /--slug must be two to four lowercase words/);
  const snap800 = { repository: "acme/widgets", issue: { number: 800, state: "open" }, originMain: "x", tickets: [ticket(801, { parent: 800 })] };
  const plan800 = write("plan-800.json", run.planDispatch({ record: run.readRecord(rec800), snapshot: snap800, preflights: [available("claude-cli", [801])], freeBytes: 100 * GB, defaults }));
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

  // A takeover whose push lands but whose read-back fails keeps its record;
  // resuming again in the same session finds the landed takeover and finishes
  // it. The remote becomes unreachable when the push updates the tracking ref.
  const rec740 = init(740, "local_src74");
  cp.enable(rec740, { coordinator: "local_src74", expectRevision: 1, github, host: SRC });
  const hooks3 = path.join(tmp, "race-hooks-3"), cut = path.join(tmp, "takeover-cut");
  fs.mkdirSync(hooks3);
  const realUrl = git(dst, "config", "remote.origin.url");
  // A fetch also updates that ref, so the hook acts only when it moves to a
  // checkpoint naming the destination, which only the takeover's push does.
  const posix = (p) => p.replace(/\\/g, "/");
  fs.writeFileSync(path.join(hooks3, "reference-transaction"), `#!/bin/sh\n[ "$1" = committed ] || { cat > /dev/null; exit 0; }\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR\nwhile read old new ref; do\n  [ "$ref" = refs/remotes/origin/orchestrate-state/issue-740 ] || continue\n  [ -e "${posix(cut)}" ] && continue\n  git -C "${posix(dst)}" show "$new:checkpoint.json" 2>/dev/null | grep -q '"session": "local_dst74"' || continue\n  : > "${posix(cut)}"\n  git -C "${posix(dst)}" config remote.origin.url "${posix(path.join(tmp, "unreachable.git"))}"\ndone\nexit 0\n`);
  fs.chmodSync(path.join(hooks3, "reference-transaction"), 0o755);
  const rec740d = path.join(dstPrivate, "run-740.json");
  const takeover740 = { record: rec740d, checkout: dst, repository: "acme/widgets", issue: 740, coordinator: "local_dst74", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #740.", evidence: "the source account is out of usage" };
  git(dst, "config", "core.hooksPath", hooks3.replace(/\\/g, "/"));
  try { assert.throws(() => cp.resume(takeover740, { github, host: DST, defaults, totalMemory: 64 * GB }), /outcome is uncertain/); }
  finally { git(dst, "config", "--unset", "core.hooksPath"); git(dst, "config", "remote.origin.url", realUrl); }
  assert.ok(fs.existsSync(cut), "the remote became unreachable right after the push");
  assert.ok(fs.existsSync(rec740d), "the record of a takeover that may have landed is kept");
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 740).checkpoint.coordinator.session, "local_dst74", "the takeover did land");
  assert.equal(cp.resume(takeover740, { github, host: DST, defaults, totalMemory: 64 * GB }).action, "resume", "resuming again finishes the landed takeover");
  mutate(rec740d, "local_dst74", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  // The remote becomes unreachable after discovery, before the takeover's
  // push: the record is kept, and the retry publishes the same takeover.
  const rec750 = init(750, "local_src75");
  cp.enable(rec750, { coordinator: "local_src75", expectRevision: 1, github, host: SRC });
  const hooks4 = path.join(tmp, "race-hooks-4"), cut750 = path.join(tmp, "takeover-cut-750");
  fs.mkdirSync(hooks4);
  fs.writeFileSync(path.join(hooks4, "reference-transaction"), `#!/bin/sh\n[ "$1" = committed ] || { cat > /dev/null; exit 0; }\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR\nwhile read old new ref; do\n  [ "$ref" = refs/orchestrate-issues/orchestrate-state/issue-750 ] || continue\n  [ -e "${posix(cut750)}" ] && continue\n  : > "${posix(cut750)}"\n  git -C "${posix(dst)}" config remote.origin.url "${posix(path.join(tmp, "unreachable.git"))}"\ndone\nexit 0\n`);
  fs.chmodSync(path.join(hooks4, "reference-transaction"), 0o755);
  const rec750d = path.join(dstPrivate, "run-750.json");
  const takeover750 = { ...takeover740, record: rec750d, issue: 750, coordinator: "local_dst75", invocation: "Use orchestrate-issues for #750." };
  git(dst, "config", "core.hooksPath", hooks4.replace(/\\/g, "/"));
  try { assert.throws(() => cp.resume(takeover750, { github, host: DST, defaults, totalMemory: 64 * GB }), /outcome is uncertain/); }
  finally { git(dst, "config", "--unset", "core.hooksPath"); git(dst, "config", "remote.origin.url", realUrl); }
  assert.ok(fs.existsSync(cut750) && fs.existsSync(rec750d), "the record is kept when the push never ran");
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 750).checkpoint.coordinator.session, "local_src75", "nothing landed");
  const runId750 = run.readRecord(rec750d).runId;
  assert.equal(cp.resume(takeover750, { github, host: DST, defaults, totalMemory: 64 * GB }).action, "takeover", "the retry publishes the kept takeover");
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 750).checkpoint.run.runId, runId750, "the retry is the same takeover, not a second one");

  // Opening an idle CLI writer's session in the app has its intent on the
  // remote before the handoff runs; when the intent cannot be saved, the open
  // is recorded as not run.
  const snap800b = { ...snap800, tickets: [ticket(802, { parent: 800 }), ticket(803, { parent: 800 })] };
  const cliPlan = () => write(`plan-800-${rev(rec800)}.json`, run.planDispatch({ record: run.readRecord(rec800), snapshot: snap800b, preflights: [available("claude-cli", [802, 803])], freeBytes: 100 * GB, defaults, census: () => [] }));
  const cli = (...args) => run.main([args[0], "--record", rec800, "--coordinator", "local_cli", "--expect-revision", String(rev(rec800)), ...args.slice(1)], { defaults, github, runners });
  let seenAtOpen = null;
  const runners = { open: () => { seenAtOpen = cp.fetchState(dst, "origin", "acme/widgets", 800).checkpoint.tickets[802].owner.opened.steps.at(-1); return { requested: true, pid: 1 }; } };
  // A CLI writer whose turn has ended: its stream names its session, and no
  // process runs under its recorded pid or names its launch directory.
  const endedWriter = (n) => {
    cli("claim", "--plan", cliPlan(), "--ticket", String(n), "--worktree", path.join(tmp, `dst-wt-${n}`), "--branch", `feat/${n}-ended`, "--artifact-parent", dstPrivate);
    const launchDir = run.launchDirOf(run.readRecord(rec800).tickets[n].pending, n);
    const spawner = () => { fs.writeFileSync(path.join(launchDir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: `00000000-0000-4000-8000-000000000${n}` })}\n`); return { started: true, pid: 2 ** 24 + n * 4 }; };
    mutate(rec800, "local_cli", (r) => run.launch(r, { ticket: n, executable: process.execPath, args: ["-p", "--model", "claude-opus-5-5", "--effort", "medium", "--permission-mode", "bypassPermissions"], prompt: plan800, spawner }));
  };
  endedWriter(802);
  assert.equal(cli("open", "--ticket", "802", "--executable", process.execPath).checkpoint.saved, true);
  assert.deepEqual([seenAtOpen.step, seenAtOpen.state], ["open", "intent"], "the open's intent is saved remotely before the handoff runs");
  cli("opened", "--ticket", "802", "--session", "local_00000000-0000-4000-8000-000000000802");
  endedWriter(803);
  let ran803 = false;
  assert.throws(() => run.openWriter(rec800, { coordinator: "local_cli", expectRevision: rev(rec800), ticket: 803, executable: process.execPath, runner: () => { ran803 = true; return { requested: true, pid: 1 }; }, afterIntent: () => { throw new Error("the remote is unreachable"); } }), /the remote is unreachable/);
  assert.equal(ran803, false);
  const notRun = run.readRecord(rec800).tickets[803].owner.opened.steps.at(-1);
  assert.deepEqual([notRun.state, notRun.reason], ["failed", "not run: the remote is unreachable"]);

  // The last plan's summary stays in later checkpoints made without a plan.
  cp.publish(rec800, { coordinator: "local_cli", github, transition: "a plan", plan: JSON.parse(fs.readFileSync(cliPlan(), "utf8")) });
  mutate(rec800, "local_cli", (r) => { r.log.push({ time: new Date().toISOString(), event: "note" }); });
  cp.autoCheckpoint(rec800, { coordinator: "local_cli", transition: "a note", github });
  assert.ok(cp.fetchState(dst, "origin", "acme/widgets", 800).checkpoint.observed?.tickets.some((t) => t.number === 803), "the summary keeps the last plan");
  assert.match(github.get(JSON.parse(fs.readFileSync(cp.sidecarOf(rec800), "utf8")).summary.commentId).body, /\| #803 \| collect-report \|/);

  // The ordinary plan command publishes its summary: every ticket, done and
  // waiting ones too, with its action. An unchanged plan publishes nothing.
  const snap800c = { ...snap800, observedAt: "now", tickets: [...snap800b.tickets, ticket(804, { parent: 800, state: "closed", delivered: true }), ticket(805, { parent: 800, blockers: [{ number: 803, state: "open", delivered: false }] })] };
  const planCli = () => run.main(["plan", "--record", rec800, "--snapshot", write("snap-800c.json", snap800c), "--preflight", write("pf-800.json", available("claude-cli", [802, 803, 805])), "--out", path.join(tmp, "plan-800c.json")], { defaults, github });
  const planned = planCli();
  assert.equal(planned.checkpoint.saved, true);
  const statusBody = github.get(JSON.parse(fs.readFileSync(cp.sidecarOf(rec800), "utf8")).summary.commentId).body;
  assert.match(statusBody, /\| #804 \| done \|/);
  assert.match(statusBody, /\| #805 \| wait-dependency \|/);
  assert.equal(planCli().checkpoint.unchanged, true, "an unchanged plan adds no checkpoint");

  // An outdated copy of the record never publishes over newer state.
  const staleCopy = path.join(dstPrivate, "run-800-stale.json");
  fs.copyFileSync(rec800, staleCopy);
  fs.copyFileSync(cp.sidecarOf(rec800), cp.sidecarOf(staleCopy));
  mutate(rec800, "local_cli", (r) => cp.intent(r, { kind: "merge", ticket: 802, pr: 882, expectHead: "f".repeat(40) }));
  assert.equal(cp.autoCheckpoint(rec800, { coordinator: "local_cli", transition: "intent to merge PR #882", github }).saved, true);
  assert.throws(() => cp.publish(staleCopy, { coordinator: "local_cli", github }), /outdated|another copy/);
  assert.equal(cp.fetchState(dst, "origin", "acme/widgets", 800).checkpoint.operations.at(-1).pr, 882, "the newer intent stays on the state branch");

  // A planned handoff stops new dispatch, and neither an open nor a resent
  // brief proceeds.
  cp.prepareHandoff(rec800, { coordinator: "local_cli", expectRevision: rev(rec800), step: "stop", github });
  const stopped = Object.fromEntries(run.planDispatch({ record: run.readRecord(rec800), snapshot: { ...snap800, tickets: [...snap800b.tickets, ticket(806, { parent: 800 })] }, preflights: [available("claude-cli", [806])], freeBytes: 100 * GB, defaults, census: () => [] }).tickets.map((t) => [t.number, t.action]));
  assert.equal(stopped[806], "wait-handoff", "new work waits for the next coordinator");
  assert.throws(() => run.openWriter(rec800, { coordinator: "local_cli", expectRevision: rev(rec800), ticket: 803, executable: process.execPath, runner: () => ({ requested: true, pid: 1 }) }), /planned handoff stopped new work/);
  assert.throws(() => run.deliver(structuredClone(run.readRecord(rec800)), { ticket: 802, retry: true }), /planned handoff stopped new starts/);

  // --- Parent issue 900: tickets apart from the code -----------------------------
  // With the cutover switch on (pinned from a copy of the repos file), the
  // state branch, the run record it carries, the writers' snapshots and the
  // status comment go to the tickets repository; the writers' branches stay
  // on the code repository, whose state branches are left as they were.
  {
    const committedRepos = readRepos(), CODE = "acme/widgets", INTERNAL = "acme/widgets-internal";
    const pinRepos = (cutover) => { const file = path.join(tmp, `repos-${cutover ? "on" : "off"}.json`); fs.writeFileSync(file, JSON.stringify({ ...committedRepos, code: CODE, internal: INTERNAL, cutover })); return readRepos(file); };
    const ON = pinRepos(true), OFF = pinRepos(false);
    const split = path.join(tmp, "split");
    const codeRemote = path.join(split, "acme", "widgets.git"), internalRemote = path.join(split, "acme", "widgets-internal.git");
    for (const r of [codeRemote, internalRemote]) { fs.mkdirSync(r, { recursive: true }); git(r, "init", "-q", "--bare", "-b", "main"); }
    const checkout = path.join(split, "checkout");
    git(tmp, "clone", "-q", codeRemote, checkout);
    for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["core.autocrlf", "false"]]) git(checkout, "config", k, v);
    fs.writeFileSync(path.join(checkout, "README.md"), "base\n");
    git(checkout, "add", "-A");
    git(checkout, "commit", "-q", "-m", "base");
    git(checkout, "push", "-q", "origin", "main", "main:refs/heads/orchestrate-state/issue-1");
    // History the public code repository already shows: a fixture that looks
    // like a token, which a snapshot may carry to the private repository.
    const token = ["gh", "p_", "Q".repeat(36)].join("");
    fs.writeFileSync(path.join(checkout, "fixture.txt"), `${token}\n`);
    git(checkout, "add", "fixture.txt");
    git(checkout, "commit", "-q", "-m", "a public fixture");
    git(checkout, "push", "-q", "origin", "main");
    const publicStates = () => git(checkout, "ls-remote", "origin", "refs/heads/orchestrate-state/*");
    const publicBefore = publicStates();
    const stores = { [CODE]: fakeGithub(), [INTERNAL]: fakeGithub() };
    const commentsFor = (repository) => stores[repository];
    const record = path.join(split, "run-900.json");
    run.initRecord({ record, checkout, repository: CODE, ...run.startRepositories(CODE, ON), issue: 900, coordinator: "local_split", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #900." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
    const enableCli = (...more) => cp.main(["enable", "--record", record, "--coordinator", "local_split", "--expect-revision", String(rev(record)), ...more], { commentsFor });
    assert.throws(() => enableCli(), new RegExp(`No remote of .* names only the tickets repository ${INTERNAL}.*git remote add internal https://github\\.com/${INTERNAL}\\.git`), "without a remote of the tickets repository nothing is published");
    git(checkout, "remote", "add", "internal", internalRemote);
    assert.throws(() => enableCli("--remote", "origin"), new RegExp(`Remote origin reaches .*acme.widgets\\.git, not only the tickets repository ${INTERNAL}`), "the code repository's remote is refused for the state branch");
    // A push goes to every push URL, so a remote that fetches the tickets
    // repository but also pushes elsewhere is refused, named or found.
    git(checkout, "config", "--add", "remote.internal.pushurl", internalRemote);
    git(checkout, "config", "--add", "remote.internal.pushurl", codeRemote);
    assert.throws(() => enableCli("--remote", "internal"), new RegExp(`Remote internal reaches .*acme.widgets\\.git, not only the tickets repository ${INTERNAL}`));
    assert.throws(() => enableCli(), /No remote of .* names only the tickets repository/);
    git(checkout, "config", "--unset-all", "remote.internal.pushurl");
    const enabled = enableCli();
    assert.equal(enabled.checkpoint.saved, true, enabled.checkpoint.reason);
    assert.deepEqual(run.readRecord(record).checkpoints, { remote: "internal", branch: "orchestrate-state/issue-900", codeRemote: "origin" });
    assert.equal(git(checkout, "ls-remote", "internal", "refs/heads/orchestrate-state/issue-900").split("\t")[0], enabled.checkpoint.commit, "the state branch is on the tickets repository");
    assert.equal(enabled.checkpoint.url, `https://github.com/${INTERNAL}/tree/${enabled.checkpoint.commit}`);
    const status900 = [...stores[INTERNAL].comments.values()].find((c) => c.issue === 900);
    assert.ok(status900, "the status comment is created on the internal issue");
    assert.match(status900.body, new RegExp(`\\(https://github\\.com/${INTERNAL}/tree/${enabled.checkpoint.commit}\\)`), "and links the internal state branch");
    assert.equal(stores[CODE].comments.size, 0, "nothing is posted on the code repository");
    // A push URL added after enable is caught before the next publication,
    // which then pushes nowhere.
    git(checkout, "config", "--add", "remote.internal.pushurl", internalRemote);
    git(checkout, "config", "--add", "remote.internal.pushurl", codeRemote);
    assert.throws(() => cp.publish(record, { coordinator: "local_split", transition: "a leak probe", github: stores[INTERNAL] }), /Remote internal reaches .*acme.widgets\.git, not only the tickets repository/);
    assert.equal(git(checkout, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-900"), "", "the code repository received no state branch");
    git(checkout, "config", "--unset-all", "remote.internal.pushurl");
    const state900 = cp.fetchState(checkout, "internal", CODE, 900, INTERNAL);
    assert.deepEqual([state900.checkpoint.repository, state900.checkpoint.ticketsRepository, state900.checkpoint.run.runId], [CODE, INTERNAL, run.readRecord(record).runId], "the checkpoint carries the run record and names both repositories");
    // A reader of the code repository's issue #900, a run of one repository,
    // never takes this checkpoint for its own, wherever it was fetched from:
    // nothing renders or publishes another tracker's state.
    assert.throws(() => cp.fetchState(checkout, "internal", CODE, 900), new RegExp(`tickets live in ${INTERNAL}, not ${CODE}; it is another tracker's issue #900`));
    assert.throws(() => cp.syncSummary({ repository: CODE, issue: 900, checkout, remote: "internal", github: stores[CODE] }), /another tracker's issue #900/);
    assert.equal(stores[CODE].comments.size, 0, "so no status reaches the code repository's issue");
    assert.equal(cp.fetchState(checkout, "internal", CODE, 900, INTERNAL).commit, git(checkout, "ls-remote", "internal", "refs/heads/orchestrate-state/issue-900").split("\t")[0], "the checkpoint read is the commit the remote reported");
    // A writer's branch is pushed to the code repository and observed there;
    // its unfinished files are snapshotted onto the internal state branch,
    // whose history the public code repository already holds.
    const worktree = path.join(split, "wt-901"), branch = "feat/901-split";
    git(checkout, "worktree", "add", "-q", "-b", branch, worktree, "main");
    git(worktree, "push", "-q", "origin", branch);
    fs.writeFileSync(path.join(worktree, "work.txt"), "unfinished\n");
    mutate(record, "local_split", (r) => { r.tickets[901] = { owner: { route: "claude-desktop", model: "claude-opus-5-5", effort: "medium", worktree, branch, handle: { kind: "session", id: "local_w901", host: SRC }, since: new Date().toISOString() }, pending: null, history: [], results: [] }; });
    assert.equal(cp.snapshotCredentials(worktree, git(worktree, "rev-parse", "HEAD"), [], "internal", { live: true }).length, 1, "measured against the internal repository alone, the public fixture would refuse the snapshot");
    cp.prepareHandoff(record, { coordinator: "local_split", expectRevision: rev(record), step: "stop", github: stores[INTERNAL], host: SRC });
    const handed = cp.prepareHandoff(record, { coordinator: "local_split", expectRevision: rev(record), step: "publish", observations: { sessions: { local_w901: { state: "running", host: SRC } } }, github: stores[INTERNAL], host: SRC });
    assert.equal(handed.checkpoint.saved, true, handed.checkpoint.reason);
    const snap901 = handed.snapshots[901];
    assert.ok(snap901 && !snap901.clean, "the unfinished work is snapshotted");
    const handedState = cp.fetchState(checkout, "internal", CODE, 900, INTERNAL);
    assert.ok(handedState.checkpoint.snapshots[901].commit === snap901.commit && git(checkout, "merge-base", "--is-ancestor", snap901.commit, handedState.commit) === "", "the snapshot travels on the internal state branch");
    const work901 = cp.workFor(handedState.checkpoint, 901)[0];
    assert.deepEqual([work901.remoteHead, work901.unpushed], [git(worktree, "rev-parse", "HEAD"), false], "the writer's branch is observed on the code repository's remote");
    assert.equal(publicStates(), publicBefore, "git ls-remote origin refs/heads/orchestrate-state/* is unchanged");
    assert.equal(git(checkout, "ls-remote", "origin", branch).split("\t")[0], git(worktree, "rev-parse", "HEAD"), "the writer's branch stays where it was pushed");
    // Discovery from the parent issue number follows the switch: on, it finds the
    // run on the tickets repository; off, the code repository holds none.
    const discovered = cp.main(["discover", "--repo", CODE, "--issue", "900", "--checkout", checkout], { repos: ON, commentsFor });
    assert.deepEqual([discovered.found, discovered.commit, discovered.summary.stale], [true, handedState.commit, false]);
    assert.equal(cp.main(["discover", "--repo", CODE, "--issue", "900", "--checkout", checkout], { repos: OFF, commentsFor }).found, false, "with the switch off the code repository holds no state branch for the parent issue");
    // The status comment is on the internal issue, where a bare #77 names
    // a ticket: a pull request in its table and reasons names the code
    // repository, while with one repository it stays as it was.
    const observed = { at: "2026-10-17T00:00:00.000Z", tickets: [{ number: 901, action: "adopt-pr", pr: 77, reason: "draft PR #77 at h has started 0 review rounds; open PRs #77, #78 and #79" }], remaining: [] };
    const splitSummary = cp.renderSummary({ checkpoint: { ...state900.checkpoint, observed }, commit: state900.commit }, INTERNAL);
    assert.match(splitSummary, new RegExp(`\\| #901 \\| adopt-pr \\| ${CODE}#77 \\|`));
    assert.ok(splitSummary.includes(`draft PR ${CODE}#77 at h has started 0 review rounds; open PRs ${CODE}#77, ${CODE}#78 and ${CODE}#79`), splitSummary);
    const { ticketsRepository, ...oneRepository } = state900.checkpoint;
    const oneSummary = cp.renderSummary({ checkpoint: { ...oneRepository, observed }, commit: state900.commit }, CODE);
    assert.ok(oneSummary.includes("| #901 | adopt-pr | #77 |") && oneSummary.includes("draft PR #77 at h has started 0 review rounds; open PRs #77, #78 and #79"));
    // From the command line with the switch on, a snapshot is retrieved from
    // the internal state branch and the run is taken over there, keeping its
    // two repositories; with the switch off the same takeover finds no run.
    // Both run from another clone, as a destination machine's would.
    const destination = path.join(split, "destination");
    git(tmp, "clone", "-q", codeRemote, destination);
    for (const [k, v] of [["user.name", "t"], ["user.email", "t@example.invalid"], ["core.autocrlf", "false"]]) git(destination, "config", k, v);
    git(destination, "remote", "add", "internal", internalRemote);
    const retrieved = cp.main(["retrieve", "--repo", CODE, "--issue", "900", "--checkout", destination, "--ticket", "901", "--worktree", path.join(split, "wt-901-retrieved")], { repos: ON });
    assert.equal(retrieved.verified, true);
    assert.equal(fs.readFileSync(path.join(split, "wt-901-retrieved", "work.txt"), "utf8"), "unfinished\n");
    const takeoverArgs = (file) => ["resume", "--record", file, "--checkout", destination, "--repo", CODE, "--issue", "900", "--harness", "claude", "--coordinator", "local_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c90", "--coordinator-mode", "bypassPermissions", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--slug", "split-run", "--invocation", "Use orchestrate-issues for #900.", "--merging", "maintainer", "--evidence", "the previous coordinator's session was archived"];
    assert.throws(() => cp.main(takeoverArgs(path.join(split, "run-900-off.json")), { repos: OFF, commentsFor }), /has no checkpoint on orchestrate-state\/issue-900/);
    const taken900 = cp.main(takeoverArgs(path.join(split, "run-900b.json")), { repos: ON, commentsFor });
    assert.equal(taken900.action, "takeover");
    const record900b = run.readRecord(path.join(split, "run-900b.json"));
    assert.deepEqual([record900b.ticketsRepository, record900b.checkpoints], [INTERNAL, { remote: "internal", branch: "orchestrate-state/issue-900", codeRemote: "origin" }]);
    assert.equal(git(checkout, "ls-remote", "internal", "refs/heads/orchestrate-state/issue-900").split("\t")[0], taken900.commit, "the takeover's checkpoint is on the tickets repository");
    assert.equal(publicStates(), publicBefore, "and the code repository's state branches are still unchanged");
    // Review checkpoint decisions link to the ticket's review thread.
    const published = { tickets: { 901: { checkpoints: [{ state: "published", pr: 77, id: "d1", kind: "finish", round: 3, head: "h", published: { comment: 123, time: "t" } }] } } };
    assert.equal(cp.decisionLinks({ repository: CODE, ticketsRepository: INTERNAL, ...published })[0].url, `https://github.com/${INTERNAL}/issues/901#issuecomment-123`);
    assert.equal(cp.decisionLinks({ repository: CODE, ...published })[0].url, `https://github.com/${CODE}/pull/77#issuecomment-123`, "with one repository the link is the PR's, as before");
    // Two interleavings fetchState must survive, each forced by running a
    // step right after one of its own Git calls.
    const childProcess = createRequire(import.meta.url)("node:child_process"), originalExec = childProcess.execFileSync;
    const interleave = (when, then) => {
      let fired = false;
      childProcess.execFileSync = function (command, args, options) { const result = originalExec.call(this, command, args, options); if (!fired && command === "git" && when(args)) { fired = true; then(); } return result; };
      syncBuiltinESMExports();
      return () => { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); return fired; };
    };
    // First, a takeover pushed after the branch was listed and before it was
    // fetched is the checkpoint read, so no coordinator acts on ownership it
    // has lost; this holds for a run of one repository too.
    const listed = cp.fetchState(checkout, "internal", CODE, 900, INTERNAL);
    const successor = cp.writeCommit(checkout, { "checkpoint.json": `${JSON.stringify({ ...listed.checkpoint, seq: listed.checkpoint.seq + 1, previous: listed.commit, snapshotParents: [], coordinator: { ...listed.checkpoint.coordinator, session: "local_successor" } }, null, 2)}\n`, "brief.md": "successor\n" }, [listed.commit], "a takeover pushed between the listing and the fetch\n");
    const afterListing = interleave((args) => args[0] === "ls-remote" && args[1] === "internal", () => originalExec("git", ["push", "-q", "internal", `${successor}:refs/heads/orchestrate-state/issue-900`], { cwd: checkout, windowsHide: true }));
    let raced;
    try { raced = cp.fetchState(checkout, "internal", CODE, 900, INTERNAL); } finally { assert.equal(afterListing(), true, "the takeover was pushed between the listing and the fetch"); }
    assert.deepEqual([raced.commit, raced.checkpoint.coordinator.session], [successor, "local_successor"], "the fetched takeover is read, not the listed checkpoint");
    // Second, the code repository's issue #900, a run of one repository in
    // this same checkout, reads its own state even when the internal run's is
    // fetched between its fetch and its read.
    const public900 = path.join(split, "run-900-public.json");
    run.initRecord({ record: public900, checkout, repository: CODE, issue: 900, coordinator: "local_public900", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: "Use orchestrate-issues for #900." }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB });
    assert.equal(cp.enable(public900, { coordinator: "local_public900", expectRevision: 1, github: stores[CODE] }).checkpoint.saved, true);
    const publicCommit = git(checkout, "ls-remote", "origin", "refs/heads/orchestrate-state/issue-900").split("\t")[0];
    const afterFetch = interleave((args) => args[0] === "fetch" && args.includes("origin") && args.some((a) => String(a).includes("refs/orchestrate-issues/")), () => cp.fetchState(checkout, "internal", CODE, 900, INTERNAL));
    let own;
    try { own = cp.fetchState(checkout, "origin", CODE, 900); } finally { assert.equal(afterFetch(), true, "the internal state was fetched between the public fetch and its read"); }
    assert.deepEqual([own.commit, own.checkpoint.ticketsRepository, own.checkpoint.coordinator.session], [publicCommit, undefined, "local_public900"], "each tracker's issue #900 reads its own checkpoint");
  }

  // --- Runs from before the rename ------------------------------------------
  // A state branch named for a Feature, and a version 1 checkpoint, belong to
  // runs the skill's previous name started. Both are refused with the last
  // commit before the rename, whose helpers still read them, so a run in
  // flight at the rename is finished from that commit and never half-read.
  {
    const expected = (issue, what) => (error) => error.message.includes(`Issue #${issue} was orchestrated under ${run.BEFORE_RENAME.skill}: ${what}`) && error.message.includes(run.BEFORE_RENAME.commit) && error.message.includes(`.agents/skills/${run.BEFORE_RENAME.skill}`);
    const takeover = (issue) => cp.main(["resume", "--record", path.join(dstPrivate, `run-${issue}.json`), "--checkout", dst, "--repo", "acme/widgets", "--issue", String(issue), "--harness", "claude", "--coordinator", "local_0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "--coordinator-mode", "bypassPermissions", "--coordinator-model", "claude-opus-5-5", "--coordinator-effort", "high", "--slug", "old-run", "--invocation", `Use orchestrate-issues for #${issue}.`, "--merging", "maintainer", "--evidence", "the previous coordinator ended"], { github });
    const v1 = (issue) => `${JSON.stringify({ version: 1, repository: "acme/widgets", feature: issue, seq: 1, previous: null, snapshotParents: [], time: "2026-10-17T00:00:00.000Z", kind: "automatic", transition: "init", coordinator: { session: "local_old", host: SRC }, tickets: {} })}\n`;
    const oldBranch = run.BEFORE_RENAME.stateBranch(5000);
    git(src, "push", "-q", "origin", `${cp.writeCommit(src, { "checkpoint.json": v1(5000), "brief.md": "old\n" }, [], "checkpoint 1 of acme/widgets#5000: init\n")}:refs/heads/${oldBranch}`);
    assert.throws(() => cp.discover({ repository: "acme/widgets", issue: 5000, checkout: dst, github }), expected(5000, `its state branch on origin is ${oldBranch}`), "discover names the old branch and the commit to continue from");
    assert.throws(() => takeover(5000), expected(5000, `its state branch on origin is ${oldBranch}`), "resume refuses the same way");
    assert.ok(!fs.existsSync(path.join(dstPrivate, "run-5000.json")), "no record is written for a refused run");
    const v1Commit = cp.writeCommit(src, { "checkpoint.json": v1(5001), "brief.md": "old\n" }, [], "checkpoint 1 of acme/widgets#5001: init\n");
    git(src, "push", "-q", "origin", `${v1Commit}:refs/heads/${cp.stateBranch(5001)}`);
    assert.throws(() => cp.discover({ repository: "acme/widgets", issue: 5001, checkout: dst, github }), expected(5001, `commit ${v1Commit} holds a version 1 checkpoint`), "a version 1 checkpoint is refused wherever it sits");
    assert.throws(() => takeover(5001), expected(5001, `commit ${v1Commit} holds a version 1 checkpoint`));
    assert.ok(!fs.existsSync(path.join(dstPrivate, "run-5001.json")));
    // A version 1 run record on this machine is refused the same way.
    const oldRecord = write("old-record.json", { version: 1, revision: 3, feature: 5000, coordinator: { session: "local_old" } });
    assert.throws(() => run.readRecord(oldRecord), (error) => error.message.includes(`is a version 1 run record of ${run.BEFORE_RENAME.skill}`) && error.message.includes(run.BEFORE_RENAME.commit));
  }

  console.log("PASS: discovery from the parent issue number, takeover with fresh authority, stale and competing updates, interrupted summary repair, uncertain launch and merge outcomes, foreign-host evidence, planned handoff snapshot beside a review freeze, abrupt loss of unpublished work, credential refusal and automatic checkpoints");
} finally {
  // The scratch tree holds only this check's clones and remote.
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (error) { console.log(`scratch kept: ${error.message}`); }
}

function markerCount(github, issue) { return [...github.comments.values()].filter((c) => c.issue === issue && c.body.includes(cp.statusMarker(issue))).length; }
function pick(r) { return [r.state, r.retry]; }
