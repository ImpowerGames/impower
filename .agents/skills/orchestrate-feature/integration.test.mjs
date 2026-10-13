// agent-tooling-timeout-ms: 900000
// Measured at 115 s on a loaded Windows machine; like the checkpoint check,
// it drives real clones of a scratch remote, so the default five-minute bound
// leaves too little headroom on a slower runner.
// Exercises the merge gate, the expected-head merge and the Feature's
// acceptance verification through one bounded run of a three-slice Feature
// against a scratch remote. A fake GitHub adapter holds the PRs, comments,
// issues and protection, and performs merges in the scratch remote; review
// journals are written as the launcher writes them. The run covers dispatch,
// writers' work and reports, a review checkpoint acceptance, merges under the
// gate (normal, accepted-unreviewed, changed head, failed CI, refused and
// interrupted), a takeover on a second clone that settles the interrupted
// merge from GitHub, the Feature's verification and its closure. The gate's
// results and the final report are written out as a trace when
// INTEGRATION_TRACE names a directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as run from "./feature-run.mjs";
import * as cp from "./checkpoint.mjs";
import * as rc from "./review-checkpoint.mjs";
import * as ig from "./integration.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "integration-")));
console.log(`scratch: ${tmp}`);
const traceDir = process.env.INTEGRATION_TRACE;
if (traceDir) fs.mkdirSync(traceDir, { recursive: true });
const traces = [];
const trace = (name, value) => { traces.push(name); if (traceDir) fs.writeFileSync(path.join(traceDir, `${String(traces.length).padStart(2, "0")}-${name}.${typeof value === "string" ? "md" : "json"}`), typeof value === "string" ? `${value}\n` : `${JSON.stringify(value, null, 2)}\n`); };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const defaults = run.readWriterDefaults();
const GB = 2 ** 30;
const REPO = "acme/widgets", FEATURE = 40, SRC = "src-host", DST = "dst-host";
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };

try {
  // --- A scratch remote, the coordinator's clone and GitHub's own clone ------
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
  git(src, "add", "-A");
  git(src, "commit", "-q", "-m", "base");
  git(src, "push", "-q", "origin", "main");
  const server = clone("github");
  const commitIn = (dir, file, text, message) => { fs.appendFileSync(path.join(dir, file), text); git(dir, "add", file); git(dir, "commit", "-q", "-m", message); return git(dir, "rev-parse", "HEAD"); };
  const originMain = (dir = src) => { git(dir, "fetch", "-q", "origin", "+refs/heads/*:refs/remotes/origin/*"); return git(dir, "rev-parse", "origin/main"); };
  // Main moves on GitHub, as another PR's merge would move it.
  const advanceMain = (file, text, message) => { git(server, "fetch", "-q", "origin"); git(server, "checkout", "-q", "-B", "main", "origin/main"); commitIn(server, file, text, message); git(server, "push", "-q", "origin", "main"); return originMain(); };

  // --- GitHub as the adapters see it ------------------------------------------
  let clock = 0;
  const at = () => new Date(Date.UTC(2026, 9, 13, 0, clock++)).toISOString();
  const gh = { pulls: new Map(), comments: new Map(), issues: new Map(), protection: { required: [], mergeQueue: false, source: "branch protection (no required checks); rulesets" }, mergeCalls: [], mode: "ok", readFail: 0, closeFail: 0 };
  let nextId = 5000;
  const post = (n, body) => { const time = at(); const c = { id: nextId++, created_at: time, updated_at: time, body, html_url: `https://github.com/${REPO}/issues/${n}#issuecomment-${nextId - 1}`, issue: n }; (gh.comments.get(n) ?? gh.comments.set(n, []).get(n)).push(c); return c; };
  const allComments = () => [...gh.comments.values()].flat();
  // GitHub merges a PR into main with a merge commit, closes the issues it
  // closes, and reports the PR merged at its head.
  const githubMerge = (pr) => {
    const p = gh.pulls.get(pr);
    git(server, "fetch", "-q", "origin");
    git(server, "checkout", "-q", "-B", "main", "origin/main");
    git(server, "merge", "-q", "--no-ff", "-m", `Merge pull request #${pr} from ${p.branch}`, p.head);
    git(server, "push", "-q", "origin", "main");
    Object.assign(p, { state: "MERGED", mergeCommit: git(server, "rev-parse", "HEAD"), mergeState: "UNKNOWN" });
    for (const n of p.closes) gh.issues.get(n).state = "closed";
    return p.mergeCommit;
  };
  const client = {
    pull: (pr) => { if (gh.readFail > 0) { gh.readFail--; throw new Error("HTTP 502 while reading the PR"); } return structuredClone(gh.pulls.get(pr)); },
    comments: (n) => structuredClone(gh.comments.get(n) ?? []),
    protection: () => structuredClone(gh.protection),
    merge: (pr, head) => {
      gh.mergeCalls.push(ig.mergeArgs(REPO, pr, head));
      const p = gh.pulls.get(pr);
      if (gh.mode === "refuse") return { ok: false, message: "GraphQL: Pull request is not mergeable: the base branch policy prohibits the merge" };
      if (gh.mode === "throw") throw new Error("connection reset before GitHub answered");
      if (p.head !== head) return { ok: false, message: "GraphQL: Head branch was modified. Review and try the merge again." };
      githubMerge(pr);
      // The merge lands, then the answer and the next read are lost.
      if (gh.mode === "merge-then-throw") { gh.readFail = 1; throw new Error("connection reset after the request was sent"); }
      return { ok: true, message: "" };
    },
    issue: (n) => structuredClone(gh.issues.get(n)),
    createComment: (n, body) => { const c = post(n, body); return { id: c.id, body: c.body, url: c.html_url }; },
    getComment: (id) => { const c = allComments().find((x) => x.id === id); if (!c) throw new Error("HTTP 404"); return { id: c.id, body: c.body, url: c.html_url }; },
    closeIssue: (n) => { if (gh.closeFail > 0) { gh.closeFail--; throw new Error("HTTP 502 while closing"); } gh.issues.get(n).state = "closed"; },
  };
  // The status comment store for checkpoints shares GitHub's comments.
  const statusGithub = {
    list: (n) => (gh.comments.get(n) ?? []).map((c) => ({ id: c.id, body: c.body, url: c.html_url })),
    get: (id) => client.getComment(id),
    create: (n, body) => client.createComment(n, body),
    update: (id, body) => { const c = allComments().find((x) => x.id === id); c.body = body; c.updated_at = at(); return { id, body, url: c.html_url }; },
  };
  const gitOf = (dir) => ig.integrationGit(dir, { fetch: () => originMain(dir), main: () => git(dir, "rev-parse", "origin/main") });
  const rcGit = (dir) => rc.localGit(dir, { fetch: () => originMain(dir), base: () => git(dir, "rev-parse", "origin/main") });

  // The Feature and its three slices: #42 is blocked by #41.
  const criteria = ["Each slice merges only through the gate.", "An accepted unreviewed correction is named in the final report.", "The Feature closes only with evidence for every criterion."];
  gh.issues.set(FEATURE, { state: "open", title: "Widgets", body: `## Problem\n\nx\n\n## Acceptance criteria\n\n${criteria.map((c) => `- [ ] ${c}`).join("\n")}\n\n## Additional context\n\n- [ ] not a criterion\n` });
  const slices = { 41: "alpha", 42: "beta", 43: "gamma" };
  for (const n of Object.keys(slices)) gh.issues.set(Number(n), { state: "open", title: `slice ${n}`, body: "" });
  const snapClient = (dir) => ({
    fetchMain: () => originMain(dir), worktrees: () => [],
    issue: (n) => ({ ...gh.issues.get(n), number: n }),
    subIssues: (n) => (n === FEATURE ? Object.keys(slices).map((k) => ({ number: Number(k), title: `slice ${k}`, state: gh.issues.get(Number(k)).state })) : []),
    blockedBy: (n) => (n === 42 ? [{ number: 41, state: gh.issues.get(41).state }] : []),
    effort: () => "High",
    pulls: (n) => [...gh.pulls.values()].filter((p) => p.closes.includes(n)).map((p) => ({ number: p.number, state: p.state, isDraft: p.isDraft, headRefName: p.branch, headRefOid: p.head, baseRefName: p.base, closingIssuesReferences: p.closes.map((c) => ({ number: c })), mergeCommit: p.mergeCommit ? { oid: p.mergeCommit } : null })),
    comments: (pr) => client.comments(pr),
    checks: (pr) => gh.pulls.get(pr).checks.map((c) => ({ name: c.name, state: c.state })),
    onMain: (sha) => { try { execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: dir, stdio: "ignore", windowsHide: true }); return true; } catch { return false; } },
  });
  const snapshotNow = (dir = src) => run.takeSnapshot({ repository: REPO, feature: FEATURE }, snapClient(dir));

  // --- The coordinator starts: invocation, record, checkpoints ---------------
  const srcPrivate = path.join(tmp, "src-private");
  fs.mkdirSync(srcPrivate);
  const recordFile = path.join(srcPrivate, "run.json");
  const invocation = `Use orchestrate-feature for #${FEATURE}.`;
  run.initRecord({ record: recordFile, checkout: src, repository: REPO, feature: FEATURE, coordinator: "local_coord", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
  assert.equal(run.readRecord(recordFile).authority.merge, run.AUTHORITY.merge, "an explicit invocation grants the coordinator the scoped merge");
  assert.equal(run.coordinatorMerges(run.readRecord(recordFile)), true);
  assert.equal(cp.enable(recordFile, { coordinator: "local_coord", expectRevision: 1, github: statusGithub, host: SRC }).checkpoint.saved, true);
  const record = () => run.readRecord(recordFile);
  const change = (fn, file = recordFile, coordinator = "local_coord") => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator }, fn).output;

  // A stop-at-ready invocation records the maintainer's merge instead.
  const stopFile = path.join(tmp, "stop-checkout");
  git(tmp, "clone", "-q", remote, stopFile);
  const stopRecordFile = path.join(srcPrivate, "stop.json");
  run.initRecord({ record: stopRecordFile, checkout: stopFile, repository: REPO, feature: FEATURE, coordinator: "local_stop", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: `${invocation} Stop at ready PRs.`, stopAtReady: true }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
  const stopRecord = run.readRecord(stopRecordFile);
  assert.deepEqual([stopRecord.invocation.stopAtReady, stopRecord.authority.merge, run.coordinatorMerges(stopRecord)], [true, run.STOP_AT_READY_MERGE, false]);
  assert.equal(run.parseArgs(["init", "--stop-at-ready"]).options.stopAtReady, true, "--stop-at-ready is a flag");

  // --- Dispatch: plan, claim and confirm the writers --------------------------
  const preflights = [{ route: "claude-desktop", model: "claude-opus-5-5", verdicts: [41, 42, 43].map((n) => ({ ticket: n, effort: "high", verdict: "available" })) }];
  const plan = (rec = record(), snapshot = snapshotNow()) => run.planDispatch({ record: rec, snapshot, turn: "user", preflights, freeBytes: 100 * GB, defaults, host: SRC });
  const actions = (p) => Object.fromEntries(p.tickets.map((t) => [t.number, t.action]));
  let p = plan();
  assert.deepEqual(actions(p), { 41: "dispatch", 42: "wait-dependency", 43: "dispatch" });
  assert.equal(p.complete, false);
  assert.match(p.remaining.join(" "), /merges only through integration\.mjs's merge gate/);
  const worktrees = {};
  for (const n of [41, 43]) {
    const planFile = write(`plan-${n}.json`, plan());
    worktrees[n] = path.join(tmp, `wt-${n}`);
    change((r) => run.claim(r, { plan: planFile, ticket: n, worktree: worktrees[n], branch: `feat/${n}-${slices[n]}`, artifactParent: srcPrivate, host: SRC }));
    change((r) => run.launched(r, { ticket: n, handleKind: "session", handle: `local_w${n}`, host: SRC }));
  }

  // --- Writers' work: branches, PRs, review journals --------------------------
  const startBranch = (n) => { git(src, "worktree", "add", "-q", "-b", `feat/${n}-${slices[n]}`, worktrees[n] ?? (worktrees[n] = path.join(tmp, `wt-${n}`)), "origin/main"); };
  const push = (n) => { git(worktrees[n], "push", "-q", "-f", "origin", `feat/${n}-${slices[n]}`); return git(worktrees[n], "rev-parse", "HEAD"); };
  const passing = () => [{ name: "test-suite", workflow: "Test Suite", state: "SUCCESS", startedAt: at() }, { name: "packages (sparkdown)", workflow: "Test Suite", state: "SKIPPED", startedAt: at() }, { name: "hook-tests", workflow: "Hook Tests", state: "SUCCESS", startedAt: at() }];
  const openPr = (n, head) => { gh.pulls.set(100 + n, { number: 100 + n, state: "OPEN", isDraft: false, head, branch: `feat/${n}-${slices[n]}`, base: "main", mergeable: "MERGEABLE", mergeState: "CLEAN", mergeCommit: null, closes: [n], checks: passing() }); gh.comments.set(100 + n, gh.comments.get(100 + n) ?? []); };
  const setHead = (n, head, checks = passing()) => Object.assign(gh.pulls.get(100 + n), { head, checks });
  // One reviewer's launch journal, as the launcher writes it.
  const journal = (pr, round, reviewerId, planned, { head, pending = [], completed = {}, exited = true, finished = true, attempt = 1 } = {}) => {
    const dir = path.join(`${src}.review-jobs`, `pr-${pr}`, `round-${round}`, `launch-${reviewerId}-${attempt}`);
    fs.mkdirSync(dir, { recursive: true });
    if (!(gh.comments.get(pr) ?? []).some((x) => x.body.startsWith(`### Review round ${round} state`))) post(pr, `### Review round ${round} state\n\nplanned: ${planned.join(", ")}`);
    const launchedAt = at();
    const report = exited ? post(pr, `### Adversarial review: ${reviewerId}\n\nRound ${round} report on ${head}.`) : null;
    const rows = [
      { time: launchedAt, event: "coordinator", pid: 1 },
      { time: launchedAt, event: "launching", index: 0, step: reviewerId, role: "review", round, reviewerId, attempt, plannedReviewers: planned },
      { time: launchedAt, event: "running", index: 0, step: reviewerId, pid: 2, head },
      ...(exited ? [{ time: at(), event: "exited", index: 0, step: reviewerId, code: 0, signal: null }] : []),
      ...(exited ? [{ time: at(), event: "completed", index: 0, step: reviewerId, reviewerId, attempt, head, commentIds: [report.id], completedRound: round, reviewedHead: head, plannedRoundReviewers: planned, pendingReviewers: pending, completedRoundReviewers: completed, completedRoundReviews: Object.keys(completed).length }] : []),
      ...(finished ? [{ time: at(), event: "finished" }] : []),
    ];
    fs.writeFileSync(path.join(dir, "journal.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ pr, journal: path.join(dir, "journal.jsonl"), steps: { [reviewerId]: { role: "review", round, reviewers: planned, reviewerId } } }));
    return { dir, report };
  };
  const reviewed = (pr, round, head) => { const j = journal(pr, round, "undirected", ["undirected"], { head, completed: { undirected: 1 } }); post(pr, `### Adjudication of review ${j.report.id}\n\nEvery finding accepted and fixed, or rejected with evidence.`); return j; };
  const report = (n, reviewedHead, findings = "None") => change((r) => run.result(r, { ticket: n, report: write(`report-${n}-${clock}.json`, { model: "claude-opus-5-5", effort: "high", pr: 100 + n, reviewedHead, rounds: { "gpt-6.1-sol": 1 }, findings, verification: "red/green regression and tooling checks", ci: "all passed", next: "await the coordinator's merge" }) }));
  const snapshotFile = (s = snapshotNow()) => write(`snapshot-${clock}.json`, s);
  const gate = (n, rec = record(), facts) => {
    const pr = 100 + n, g = gitOf(src);
    return ig.admission(rec, { ticket: n, pr, snapshot: snapshotNow(), facts: facts ?? ig.gatherFacts({ record: rec, pr, client, git: g }), git: g });
  };
  const blocked = (result, pattern, why) => assert.ok(!result.admitted && result.blockers.some((b) => pattern.test(b)), `${why}: ${result.blockers.join(" | ")}`);
  const merge = (n, file = recordFile, coordinator = "local_coord", dir = src) => ig.mergeAdmitted(file, { coordinator, expectRevision: run.readRecord(file).revision, ticket: n, pr: 100 + n, snapshot: snapshotNow(dir), client, git: gitOf(dir), afterIntent: () => cp.ensureSaved(file, { coordinator, github: statusGithub, host: dir === src ? SRC : DST }) });

  // --- #41: normal reviewed completion ----------------------------------------
  startBranch(41);
  commitIn(worktrees[41], "alpha.txt", "alpha\n", "feat: alpha (#41)");
  let h41 = push(41);
  openPr(41, h41);
  reviewed(141, 1, h41);
  report(41, h41);
  let g41 = gate(41);
  trace("gate-41-normal", g41);
  assert.deepEqual(g41.blockers, [], "a reviewed head with passed CI, current main, every reviewer exited and nothing outstanding is admitted");
  assert.deepEqual([g41.admitted, g41.disposition, g41.reviewedHead, g41.mergedSince], [true, "reviewed", h41, []]);
  assert.deepEqual(g41.checks.map((c) => [c.name, c.result, c.required]), [["test-suite", "passed", true], ["packages (sparkdown)", "skipped", false], ["hook-tests", "passed", false]], "a skipped package job is reported as skipped, not as a check that ran");

  // Authority: stop-at-ready, a discussion, and a coordinator that wrote for
  // the ticket are refused; so is any session other than the coordinator.
  const stopped = { ...record(), invocation: { ...record().invocation, stopAtReady: true }, authority: run.authorityFor({ stopAtReady: true }) };
  blocked(gate(41, stopped), /stops at ready PRs, so the maintainer merges/, "stop-at-ready disables merging");
  blocked(gate(41, { ...record(), authority: { ...record().authority, merge: "the maintainer merges ready PRs" } }), /leaves merging to the maintainer/, "a record made under another grant does not merge");
  blocked(gate(41, { ...record(), invocation: { text: "Can you explain how orchestrate-feature merges PRs?" } }), /does not name orchestrate-feature and Feature #40/, "a discussion of the skill grants nothing");
  const selfWritten = structuredClone(record());
  selfWritten.tickets[41].history.push({ owner: { handle: { kind: "session", id: "local_coord" } }, released: "x" });
  blocked(gate(41, selfWritten), /local_coord wrote for #41, and a writer never merges its own work/, "a coordinator that wrote for the ticket");
  assert.throws(() => ig.mergeAdmitted(recordFile, { coordinator: "local_w41", expectRevision: record().revision, ticket: 41, pr: 141, snapshot: snapshotNow(), client, git: gitOf(src) }), /coordinated by local_coord; local_w41 may not merge/, "a writer session cannot use the coordinator's exception");

  // CI: pending, failed, cancelled and a skipped required gate all refuse.
  for (const [state, pattern] of [["IN_PROGRESS", /still pending .* a merge may not/], ["FAILURE", /test-suite concluded FAILURE/], ["CANCELLED", /test-suite concluded CANCELLED/], ["SKIPPED", /required check Test Suite \/ test-suite was skipped/]]) {
    setHead(41, h41, passing().map((c) => (c.name === "test-suite" ? { ...c, state } : c)));
    blocked(gate(41), pattern, `required CI ${state}`);
  }
  setHead(41, h41, []);
  blocked(gate(41), /no CI check has run/, "no CI at all");
  setHead(41, h41, [...passing(), { name: "test-suite", workflow: "Test Suite", state: "FAILURE", startedAt: "2026-10-12T00:00:00Z" }]);
  assert.ok(gate(41).admitted, "an earlier failed run of a check that later passed does not count");
  gh.protection.required = ["typecheck"];
  blocked(gate(41), /required check typecheck has not run/, "a check branch protection requires");
  gh.protection.required = [];
  setHead(41, h41);

  // The PR and GitHub's merge state.
  Object.assign(gh.pulls.get(141), { isDraft: true });
  blocked(gate(41), /is a draft/, "a draft");
  Object.assign(gh.pulls.get(141), { isDraft: false, closes: [] });
  blocked(gate(41), /does not close #41/, "a PR without Closes");
  Object.assign(gh.pulls.get(141), { closes: [41], mergeState: "BLOCKED" });
  blocked(gate(41), /blocked \(BLOCKED\).*never bypassed/, "branch protection blocks it");
  Object.assign(gh.pulls.get(141), { mergeState: "UNKNOWN" });
  blocked(gate(41), /has not settled whether the PR can merge/, "mergeability not computed yet");
  Object.assign(gh.pulls.get(141), { mergeState: "CLEAN" });
  gh.protection.mergeQueue = true;
  blocked(gate(41), /requires a merge queue/, "a merge queue is honoured, not bypassed");
  gh.protection.mergeQueue = false;

  // Review state: a live reviewer, an unadjudicated report, a writer's report
  // with an outstanding gap, and no report.
  const live = journal(141, 2, "undirected", ["undirected"], { head: h41, exited: false, finished: false });
  blocked(gate(41), /launcher has not finished/, "a reviewer that may still run");
  fs.rmSync(live.dir, { recursive: true });
  gh.comments.set(141, gh.comments.get(141).filter((c) => !c.body.startsWith("### Review round 2")));
  const unadjudicated = journal(141, 2, "undirected", ["undirected"], { head: h41, completed: { undirected: 1 } });
  blocked(gate(41), new RegExp(`report ${unadjudicated.report.id} .* has no adjudication`), "an unadjudicated report");
  post(141, `### Adjudication of review ${unadjudicated.report.id}\n\nNo findings.`);
  report(41, h41, "one material verification gap: the Windows path was not exercised");
  blocked(gate(41), /outstanding findings or verification gaps/, "a material verification gap");
  report(41, h41);
  const noReport = structuredClone(record());
  noReport.tickets[41].results = [];
  blocked(gate(41, noReport), /holds no writer report for PR #141/, "no writer report");
  assert.ok(gate(41).admitted);

  // Main advances: the head no longer contains it, so integration is checked
  // again on a head that merges it. A clean merge of main keeps the review.
  advanceMain("other.txt", "another PR\n", "feat: another PR");
  blocked(gate(41), /main has moved to .* which head .* does not contain/, "target-branch advancement");
  git(worktrees[41], "fetch", "-q", "origin");
  git(worktrees[41], "merge", "-q", "--no-edit", "origin/main");
  const h41m = push(41);
  setHead(41, h41m);
  g41 = gate(41);
  trace("gate-41-after-main-merge", g41);
  assert.deepEqual([g41.admitted, g41.disposition, g41.reviewedHead, g41.mergedSince], [true, "reviewed", h41, [h41m]], "a clean merge of main on the reviewed head is admitted, and named");

  // The plan: #41 merges through the gate once its writer is settled; #42
  // waits for it. Under stop-at-ready the same PR waits for the maintainer.
  change((r) => run.release(r, { ticket: 41, observations: { sessions: { local_w41: { state: "archived" } } }, evidence: "the writer's session ended", host: SRC }));
  p = plan();
  assert.deepEqual([actions(p)[41], actions(p)[42]], ["merge-gate", "wait-dependency"]);
  const stopPlan = plan(run.readRecord(stopRecordFile));
  assert.deepEqual([actions(stopPlan)[41], actions(stopPlan)[42]], ["await-maintainer", "wait-dependency"], "stop-at-ready leaves the merge to the maintainer and the dependent waiting");
  assert.match(stopPlan.tickets.find((t) => t.number === 41).reason, /the invocation stops at ready, so the maintainer merges it/);
  assert.match(stopPlan.remaining.join(" "), /wait for the maintainer to merge them/);

  // The merge: intent saved first, an expected-head call with no bypass,
  // and the outcome read back from GitHub.
  const merged41 = merge(41);
  trace("merge-41", merged41);
  assert.deepEqual([merged41.merged, merged41.state, merged41.onMain], [true, "confirmed", true]);
  assert.deepEqual(gh.mergeCalls.at(-1), ["pr", "merge", "141", "--repo", REPO, "--merge", "--match-head-commit", h41m]);
  assert.ok(!gh.mergeCalls.flat().some((a) => ["--admin", "--auto", "--rebase", "--squash"].includes(a)), "the merge call never bypasses protection or defers the merge");
  const op41 = record().operations.find((o) => o.id === merged41.operation);
  assert.deepEqual([op41.state, op41.expectHead, op41.gate.disposition, op41.mergeCommit], ["confirmed", h41m, "reviewed", gh.pulls.get(141).mergeCommit]);
  const savedOps = JSON.parse(git(src, "show", `${cp.fetchState(src, "origin", REPO, FEATURE).commit}:checkpoint.json`)).operations;
  assert.ok(savedOps.some((o) => o.id === op41.id && o.state === "intent" && o.expectHead === h41m), "the merge intent reached the shared checkpoint before GitHub was called");
  // Dependency release follows the confirmed integration on main.
  p = plan();
  assert.deepEqual([actions(p)[41], actions(p)[42]], ["done", "dispatch"]);
  assert.deepEqual([actions(plan(run.readRecord(stopRecordFile)))[42]], ["dispatch"], "a dependent is released by the merge on main, whoever merged");

  // --- #42: accepted unreviewed corrections after round 3 ----------------------
  const plan42 = write("plan-42.json", plan());
  worktrees[42] = path.join(tmp, "wt-42");
  change((r) => run.claim(r, { plan: plan42, ticket: 42, worktree: worktrees[42], branch: "feat/42-beta", artifactParent: srcPrivate, host: SRC }));
  change((r) => run.launched(r, { ticket: 42, handleKind: "session", handle: "local_w42", host: SRC }));
  startBranch(42);
  const h42 = {};
  for (const r of [1, 2, 3]) { h42[r] = commitIn(worktrees[42], "beta.txt", `beta ${r}\n`, `feat: beta round ${r} change (#42)`); push(42); if (r === 1) openPr(42, h42[1]); setHead(42, h42[r]); reviewed(142, r, h42[r]); }
  const correction = commitIn(worktrees[42], "beta.txt", "beta correction\n", "fix: round 3 correction (#42)");
  setHead(42, push(42));
  report(42, h42[3], "round 3's correction is unreviewed; the checkpoint decides it");
  blocked(gate(42), new RegExp(`not the last independently reviewed head ${h42[3]}.*unreviewed after it: ${correction.slice(0, 9)}`), "an unreviewed correction without an acceptance");
  // The coordinator decides at round 3's checkpoint and publishes it.
  const e42 = rc.gatherEvidence({ record: record(), ticket: 42, pr: 142, client, git: rcGit(src) });
  assert.equal(e42.due, true, e42.blockers.join("; "));
  const assessment = { mechanisms: "Three rounds found unrelated defects; none share a mechanism.", regressions: "No correction introduced a defect.", repairOptions: "None simpler.", residualRisk: "The one-line correction is unreviewed.", coverage: "Its regression test is red before and green after.", nextRoundValue: "Little: the correction is one line under a direct test.", rationale: "Diminishing benefit.", next: "Merge through the gate.", agreedBehavior: "preserved", architecture: "unchanged", verification: ["the regression test passed on the head", "every CI check passed"], findings: rc.roundState(rc.readJournals(path.join(`${src}.review-jobs`, "pr-142"))).reports.map((r) => ({ comment: r.comment, finding: `round ${r.round}`, disposition: "accepted" })) };
  const decided = change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment, inspected: e42.range.diffSha256, evidence: e42 }));
  blocked(gate(42), /no acceptance covers it/, "an acceptance recorded but not yet read back as published grants nothing");
  const posted = post(142, decided.body);
  change((r) => rc.published(r, { ticket: 42, id: decided.id, comment: posted.id, readBack: decided.body, head: correction }));
  const g42 = gate(42);
  trace("gate-42-accepted", g42);
  assert.deepEqual([g42.admitted, g42.disposition, g42.acceptance?.id, g42.reviewedHead], [true, "accepted-unreviewed", decided.id, h42[3]], g42.blockers.join(" | "));
  // A new push invalidates the acceptance for merging.
  const stale = commitIn(worktrees[42], "beta.txt", "late change\n", "fix: late change (#42)");
  setHead(42, stale);
  blocked(gate(42), /applies to .*but the PR's head is/, "a head pushed after the acceptance");
  git(worktrees[42], "reset", "-q", "--hard", correction);
  setHead(42, push(42));
  change((r) => run.release(r, { ticket: 42, observations: { sessions: { local_w42: { state: "archived" } } }, evidence: "the writer's session ended", host: SRC }));
  const merged42 = merge(42);
  assert.deepEqual([merged42.state, merged42.gate.disposition], ["confirmed", "accepted-unreviewed"]);

  // --- #43: a changed head, a conflicting main merge, failed CI, a refused
  // merge and an interrupted one ----------------------------------------------
  startBranch(43);
  const h43a = commitIn(worktrees[43], "README.md", "gamma\n", "feat: gamma (#43)");
  openPr(43, push(43));
  reviewed(143, 1, h43a);
  const h43b = commitIn(worktrees[43], "README.md", "gamma behaviour fix\n", "fix: behaviour (#43)");
  setHead(43, push(43));
  report(43, h43a);
  blocked(gate(43), new RegExp(`not the last independently reviewed head ${h43a}.*${h43b.slice(0, 9)} fix: behaviour`), "a behaviour change after the reviewed head");
  reviewed(143, 2, h43b);
  report(43, h43b);
  // Main changed the same lines: the conflict resolution is a change no
  // review saw, unlike a clean merge.
  advanceMain("README.md", "main's own line\n", "feat: main edits the README");
  git(worktrees[43], "fetch", "-q", "origin");
  try { git(worktrees[43], "merge", "-q", "--no-edit", "origin/main"); } catch { /* conflict, resolved next */ }
  fs.writeFileSync(path.join(worktrees[43], "README.md"), "base\ngamma\ngamma behaviour fix\nmain's own line\n");
  git(worktrees[43], "add", "README.md");
  git(worktrees[43], "commit", "-q", "--no-edit");
  const h43c = push(43);
  setHead(43, h43c);
  blocked(gate(43), new RegExp(`not the last independently reviewed head ${h43b} or a clean merge of main on top of it`), "a conflict-resolving merge of main");
  reviewed(143, 3, h43c);
  report(43, h43c);
  setHead(43, h43c, passing().map((c) => (c.name === "hook-tests" ? { ...c, state: "FAILURE" } : c)));
  blocked(gate(43), /Hook Tests \/ hook-tests concluded FAILURE/, "a failed check that is not the required gate still refuses");
  setHead(43, h43c);
  change((r) => run.release(r, { ticket: 43, observations: { sessions: { local_w43: { state: "archived" } } }, evidence: "the writer's session ended", host: SRC }));
  // GitHub refuses the merge: recorded as failed, nothing claimed.
  gh.mode = "refuse";
  const refused = merge(43);
  assert.deepEqual([refused.merged, refused.state], [false, "failed"]);
  assert.match(refused.evidence, /was refused .*reads back OPEN at .*nothing was merged/);
  assert.equal(gh.pulls.get(143).state, "OPEN");
  // The merge lands but the answer and the read-back are lost: uncertain,
  // and no further merge until it is settled from GitHub.
  gh.mode = "merge-then-throw";
  const lost = merge(43);
  trace("merge-43-interrupted", lost);
  assert.deepEqual([lost.merged, lost.state], [false, "uncertain"]);
  assert.match(lost.evidence, /was interrupted .*could not be read back/);
  gh.mode = "ok";
  const callsBefore = gh.mergeCalls.length;
  const again = merge(43);
  assert.equal(again.admitted, false);
  assert.equal(gh.mergeCalls.length, callsBefore, "an unsettled merge is never retried blind");
  // A plan made before GitHub's state is read again settles it first.
  const behind = snapshotNow();
  behind.tickets = behind.tickets.map((t) => (t.number === 43 ? { ...t, state: "open", delivered: false, prs: t.prs.map((x) => ({ ...x, state: "OPEN", isDraft: false, mergeCommit: null, rounds: 3, checks: [] })) } : t));
  assert.equal(actions(plan(record(), behind))[43], "reconcile-pending");
  cp.autoCheckpoint(recordFile, { coordinator: "local_coord", transition: "the interrupted merge of PR #143", github: statusGithub, host: SRC });

  // --- Takeover on another machine; the uncertain merge settles from GitHub ---
  const dst = clone("dst");
  const dstPrivate = path.join(tmp, "dst-private");
  fs.mkdirSync(dstPrivate);
  const dstRecord = path.join(dstPrivate, "run.json");
  const found = cp.discover({ repository: REPO, feature: FEATURE, checkout: dst, github: statusGithub });
  assert.ok(cp.limitations(found.checkpoint).some((l) => l.kind === "operation" && l.ticket === 43), "the destination is told the merge is unsettled");
  const taken = cp.resume({ record: dstRecord, checkout: dst, repository: REPO, feature: FEATURE, coordinator: "local_dst", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation: `Use orchestrate-feature for #${FEATURE}; take over from the exhausted account.`, evidence: "the maintainer reports the source account reached its usage limit" }, { github: statusGithub, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(taken.action, "takeover");
  assert.equal(run.coordinatorMerges(run.readRecord(dstRecord)), true, "the new coordinator's own invocation grants the merge");
  const overUnsettled = ig.mergeAdmitted(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, ticket: 43, pr: 143, snapshot: snapshotNow(dst), client, git: gitOf(dst) });
  blocked(overUnsettled.gate, /is uncertain; settle it with checkpoint\.mjs reconcile-operations before any new merge/, "the destination does not merge over an unsettled operation");
  const settled = change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow(dst) }), dstRecord, "local_dst");
  trace("reconcile-43", settled);
  assert.deepEqual(settled.filter((s) => s.pr === 143).map((s) => s.state), ["confirmed"], "GitHub's merged state confirms the merge, with no second call");
  assert.equal(gh.mergeCalls.length, callsBefore);
  assert.equal(actions(plan(run.readRecord(dstRecord), snapshotNow(dst)))[43], "done");
  // A PR merged at a head other than the one an operation expected was not
  // merged by that operation.
  const elsewhere = structuredClone(run.readRecord(dstRecord));
  elsewhere.operations.push({ id: "elsewhere", kind: "merge", ticket: 43, pr: 143, expectHead: h43b, state: "uncertain" });
  assert.equal(cp.reconcileOperations(elsewhere, { snapshot: snapshotNow(dst) }).find((r) => r.id === "elsewhere").state, "superseded", "a merge at another head is not this operation's success");

  // --- The Feature's acceptance on main ---------------------------------------
  assert.deepEqual(ig.parseCriteria(gh.issues.get(FEATURE).body).map((c) => c.text), criteria, "only the checklist under the Acceptance criteria heading");
  const verify = (evidence, snapshot = snapshotNow(dst)) => change((r) => ig.verifyFeature(r, { snapshot, criteria: ig.parseCriteria(gh.issues.get(FEATURE).body), evidence, mainSha: originMain(dst) }), dstRecord, "local_dst");
  const met = (c, evidence) => ({ criterion: c, status: "met", evidence });
  assert.throws(() => verify({ criteria: [met(criteria[0], ["x"])] }), /omits criterion 2/);
  assert.throws(() => verify({ criteria: criteria.map((c, i) => met(c, i === 1 ? [] : ["x"])) }), /Criterion 2 is met only with evidence/);
  assert.throws(() => verify({ criteria: criteria.map((c, i) => (i === 2 ? { criterion: c, status: "unmet" } : met(c, ["x"]))) }), /Criterion 3 is unmet; name the gap/);
  assert.throws(() => verify({ criteria: [...criteria.map((c) => met(c, ["x"])), met("An invented criterion.", ["x"])] }), /criteria the Feature does not list/);
  // Every slice merged, one criterion unmet: the Feature stays open.
  const unmet = verify({ criteria: [met(criteria[0], ["merge operations of PRs #141, #142 and #143 carry the gate's admission"]), met(criteria[1], ["the final report lists decision on PR #142"]), { criterion: criteria[2], status: "unmet", gap: "the closing run has not been exercised" }] });
  assert.equal(unmet.verdict, "incomplete");
  assert.throws(() => ig.closeFeature(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, verification: unmet.id, client, git: gitOf(dst) }), /found the Feature incomplete .*unmet: The Feature closes only/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "merged slices with an unmet criterion are not completion");
  // A slice not delivered keeps it open too, whatever the criteria say.
  const missing = snapshotNow(dst);
  missing.tickets = missing.tickets.map((t) => (t.number === 43 ? { ...t, state: "open", delivered: false, prs: [] } : t));
  const partial = verify({ criteria: criteria.map((c) => met(c, ["evidence"])) }, missing);
  assert.equal(partial.verdict, "incomplete");
  assert.match(partial.report, /#43: open with no merged PR/);
  // Every criterion met on the assembled implementation.
  const done = verify({ criteria: [met(criteria[0], ["merge operations of PRs #141, #142 and #143 carry the gate's admission and read-back"]), met(criteria[1], ["the final report names decision on PR #142 with its range"]), met(criteria[2], ["the unmet run above stayed open; this run closes with evidence"])] });
  trace("final-report", done.report);
  assert.equal(done.verdict, "complete");
  assert.match(done.report, /\| #41 \| delivered \| #141 \| merged by the coordinator as `[0-9a-f]{9}`; independently reviewed through `[0-9a-f]{9}` plus 1 clean merge of main \|/);
  assert.match(done.report, new RegExp(`#42, PR #142: decision \`${decided.id}\` .* accepted \`${h42[3].slice(0, 9)}\\.\\.${correction.slice(0, 9)}\` \\(1 commit\\) unreviewed on head \`${correction.slice(0, 9)}\`; that head merged`));
  assert.match(done.report, new RegExp(`\\| #43 \\| delivered \\| #143 \\| merged by the coordinator as \`[0-9a-f]{9}\`; independently reviewed through \`${h43c.slice(0, 9)}\` \\|`), "the merge the previous coordinator made through the gate, confirmed from GitHub after the takeover");
  // A slice merged without this run's gate (by the maintainer) is reported
  // as such, never as reviewed or accepted by the gate.
  const withoutGate = { ...run.readRecord(dstRecord), operations: [] };
  assert.match(ig.finalReport(withoutGate, snapshotNow(dst), run.readRecord(dstRecord).verifications.at(-1)), /\| #41 \| delivered \| #141 \| merged as `[0-9a-f]{9}` outside this run's merge gate/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, true);
  // Closing: the report is posted and read back, then the issue is closed.
  gh.closeFail = 1;
  const firstClose = ig.closeFeature(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, verification: done.id, client, git: gitOf(dst), afterIntent: () => cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }) });
  assert.deepEqual([firstClose.closed, firstClose.state, gh.issues.get(FEATURE).state], [false, "failed", "open"], "a failed close is not completion");
  const closed = ig.closeFeature(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, verification: done.id, client, git: gitOf(dst) });
  assert.deepEqual([closed.closed, closed.state, closed.comment.reused, gh.issues.get(FEATURE).state], [true, "confirmed", true, "closed"]);
  assert.equal(gh.comments.get(FEATURE).filter((c) => c.body.includes(`final report: verification ${done.id}`)).length, 1, "a retried close reuses the posted report");
  assert.throws(() => ig.closeFeature(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, verification: done.id, client, git: gitOf(dst) }), /already closed/);
  const status = cp.autoCheckpoint(dstRecord, { coordinator: "local_dst", transition: "the Feature closed", github: statusGithub, host: DST });
  assert.match(statusGithub.get(status.summary.commentId).body, new RegExp(`Feature verification ${done.id} on main .*: complete\\.`), "the status comment shows the verification");
  assert.equal(cp.reconcileOperations(structuredClone(run.readRecord(dstRecord)), { snapshot: { observedAt: "now", feature: { number: FEATURE, state: "closed" }, tickets: [] } }).length, 0, "nothing is left unsettled");

  console.log(`PASS: merge gate (normal, clean main merge, accepted unreviewed, stale head, changed head, conflicting main merge, failed and pending CI, skipped jobs, authority, scope, review state, protection), expected-head merges with refused and interrupted outcomes, takeover settling an uncertain merge from GitHub, dependency release, and the Feature's verification and closure${traceDir ? `; ${traces.length} traces in ${traceDir}` : ""}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
