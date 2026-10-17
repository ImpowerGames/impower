// agent-tooling-timeout-ms: 900000
// Measured at 435 s on a Windows machine running a mutation sweep of this
// same check beside it; like the checkpoint check,
// it drives real clones of a scratch remote, so the default five-minute bound
// leaves too little headroom on a slower runner.
// Exercises the merge gate, the expected-head merge and the parent issue's
// acceptance verification through one bounded run of a three-slice parent issue
// against a scratch remote. A fake GitHub adapter holds the PRs, comments,
// issues and protection, and performs merges in the scratch remote; review
// journals are written as the launcher writes them. The run covers dispatch,
// writers' work and reports, a review checkpoint acceptance, merges under the
// gate (normal, accepted-unreviewed, changed head, failed CI, refused and
// interrupted), a takeover on a second clone that settles the interrupted
// merge from GitHub, the parent issue's verification and its closure. The gate's
// results and the final report are written out as a trace when
// INTEGRATION_TRACE names a directory.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as run from "./issue-run.mjs";
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
const REPO = "acme/widgets", ISSUE = 40, SRC = "src-host", DST = "dst-host";
const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };

try {
  // --- The final gate's order -------------------------------------------------
  // Every irreversible call goes through finalGate, which alone orders the
  // reads in front of it: ownership, a fresh snapshot, the premises on that
  // snapshot, the parent issue's scope once more, then main, then the call. The
  // order is checked on the module itself and on every mutant that reorders or
  // removes one of its five reads, each of which must fail the same check.
  const ORDER = ["ownership", "snapshot", "premises", "scope", "fetch", "main", "call"];
  const checkGate = (finalGate) => {
    const drive = ({ owned = [], blockers = [], scope = { slices: ["#41 open"], acceptanceSha256: "h1" }, main = "m1", call = () => "done" } = {}) => {
      const log = [];
      const snap = { observedAt: "now", tickets: [{ number: 41, state: "open", container: false }, { number: 50, state: "open", container: true }], issue: { acceptanceSha256: "h1" } };
      const result = finalGate({
        current: () => ({ revision: 1 }), opId: "op1",
        ownership: (record, opId) => { log.push("ownership"); assert.deepEqual([record.revision, opId], [1, "op1"]); return owned; },
        takeSnapshot: () => { log.push("snapshot"); return snap; },
        premises: (record, snapshot) => { log.push("premises"); assert.equal(snapshot, snap, "the premises are judged on the snapshot the gate just took"); return { blockers }; },
        readScope: () => { log.push("scope"); return scope; },
        git: { fetch: () => log.push("fetch"), main: () => { log.push("main"); return main; } },
        main: "m1", call: () => { log.push("call"); return call(); },
      });
      return { log, result };
    };
    const held = drive();
    assert.deepEqual(held.log, ORDER);
    assert.deepEqual([held.result.called, held.result.value], [true, "done"]);
    for (const [name, options, blocker] of [["ownership", { owned: ["taken over"] }, "taken over"], ["a premise", { blockers: ["head moved"] }, "head moved"], ["a slice that left", { scope: { slices: [], acceptanceSha256: "h1" } }, "the parent issue's slices changed during the final checks, from #41 open to none"], ["a reopened slice", { scope: { slices: ["#41 closed"], acceptanceSha256: "h1" } }, "the parent issue's slices changed during the final checks, from #41 open to #41 closed"], ["a changed criterion", { scope: { slices: ["#41 open"], acceptanceSha256: "h2" } }, "the parent issue's acceptance criteria changed during the final checks"], ["main", { main: "m2" }, `origin/${ig.TARGET} moved from m1 to m2`]]) {
      const stopped = drive(options);
      assert.deepEqual([stopped.result.called, stopped.result.blockers], [false, [blocker]], `${name} stops the call`);
      assert.deepEqual(stopped.log, ORDER.slice(0, -1), `every read still runs, in order, when ${name} stops the call`);
    }
    const thrown = drive({ call: () => { throw new Error("socket closed"); } });
    assert.deepEqual([thrown.result.called, thrown.result.error?.message], [true, "socket closed"], "a call that throws was made");
  };
  checkGate(ig.finalGate);
  const source = fs.readFileSync(new URL("./integration.mjs", import.meta.url), "utf8");
  const readLines = ["    owned = ownership(current(), opId);", "    snapshot = takeSnapshot();", "    held = premises(current(), snapshot);", "    scope = readScope();", "    now = (git.fetch(), git.main());"];
  const block = readLines.join("\n");
  assert.equal(source.split(block).length, 2, "the final gate's five reads appear once, in order");
  const permutations = (items) => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));
  const mutants = [
    ...permutations(readLines).filter((p) => p.join("\n") !== block).map((p) => ({ name: `reads in the order ${p.map((l) => readLines.indexOf(l) + 1).join("")}`, lines: p })),
    ...readLines.map((l, i) => ({ name: `read ${i + 1} removed`, lines: readLines.filter((x) => x !== l) })),
  ];
  const here = new URL(".", import.meta.url).href, scripts = new URL("../../../scripts/", import.meta.url).href;
  const mutantDir = fs.mkdtempSync(path.join(tmp, "gate-mutants-"));
  const load = async (name, lines) => {
    const file = path.join(mutantDir, `${name}.mjs`);
    fs.writeFileSync(file, source.replace(block, lines.join("\n")).replaceAll('from "./', `from "${here}`).replaceAll('from "../../../scripts/', `from "${scripts}`));
    return (await import(pathToFileURL(file).href)).finalGate;
  };
  // An unchanged copy, loaded the same way, passes: a mutant fails for its
  // change, not for how it was loaded.
  checkGate(await load("control", readLines));
  for (const [i, mutant] of mutants.entries()) {
    const gate = await load(`mutant-${i}`, mutant.lines);
    assert.throws(() => checkGate(gate), Error, `the order check catches the mutant with ${mutant.name}`);
  }
  console.log(`final gate: ${mutants.length} reordered or removed reads, each caught`);

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
    comments: (n) => { gh.onComments?.(n); return structuredClone(gh.comments.get(n) ?? []); },
    protection: () => structuredClone(gh.protection),
    mainRuns: () => { if (gh.mainRunsFail) throw new Error(gh.mainRunsFail); return structuredClone(gh.mainRuns ?? []); },
    merge: (pr, head) => {
      gh.mergeCalls.push(ig.mergeArgs(REPO, pr, head));
      gh.beforeMerge?.(pr, head);
      const p = gh.pulls.get(pr);
      // Another PR's merge lands on main just before this one does.
      if (gh.mode === "main-moves") { gh.mode = "ok"; advanceMain("racing.txt", "a racing PR\n", "feat: a racing PR"); }
      if (gh.mode === "main-moves-then-throw") { gh.mode = "merge-then-throw"; advanceMain("racing2.txt", "another racing PR\n", "feat: another racing PR"); }
      if (gh.mode === "refuse") return { ok: false, message: "GraphQL: Pull request is not mergeable: the base branch policy prohibits the merge" };
      if (gh.mode === "throw") throw new Error("connection reset before GitHub answered");
      if (gh.mode === "no-answer") return { ok: false, message: "unexpected EOF" };
      // The writer pushes while the answer to this call is lost.
      if (gh.mode === "push-no-answer") { gh.mode = "ok"; p.head = gh.pushTo; return { ok: false, message: "unexpected EOF" }; }
      if (p.head !== head) return { ok: false, message: "GraphQL: Head branch was modified. Review and try the merge again." };
      githubMerge(pr);
      // The merge lands, then the answer and the next read are lost.
      if (gh.mode === "merge-then-throw") { gh.readFail = 1; throw new Error("connection reset after the request was sent"); }
      return { ok: true, message: "" };
    },
    issue: (n) => structuredClone(gh.issues.get(n)),
    createComment: (n, body) => { gh.onCreateComment?.(); const c = post(n, body); return { id: c.id, body: c.body, url: c.html_url }; },
    getComment: (id) => { const c = allComments().find((x) => x.id === id); if (!c) throw new Error("HTTP 404"); return { id: c.id, body: c.body, url: c.html_url }; },
    closeIssue: (n) => { gh.closeCalls = (gh.closeCalls ?? 0) + 1; gh.beforeClose?.(n); if (gh.closeFail > 0) { gh.closeFail--; throw new Error(gh.closeError); } if (gh.closeSilent > 0) { gh.closeSilent--; return; } gh.issues.get(n).state = "closed"; },
  };
  // The status comment store for checkpoints shares GitHub's comments.
  const statusGithub = {
    list: (n) => (gh.comments.get(n) ?? []).map((c) => ({ id: c.id, body: c.body, url: c.html_url })),
    get: (id) => client.getComment(id),
    create: (n, body) => client.createComment(n, body),
    update: (id, body) => { const c = allComments().find((x) => x.id === id); c.body = body; c.updated_at = at(); return { id, body, url: c.html_url }; },
  };
  const gitOf = (dir) => ig.integrationGit(dir, { fetch: (pr) => { gh.onFetch?.(pr); return originMain(dir); }, main: () => git(dir, "rev-parse", "origin/main") });
  const rcGit = (dir) => rc.localGit(dir, { fetch: () => originMain(dir), base: () => git(dir, "rev-parse", "origin/main") });

  // The parent issue and its three slices: #42 is blocked by #41.
  const criteria = ["Each slice merges only through the gate.", "An accepted unreviewed correction is named in the final report.", "The parent issue closes only with evidence for every criterion."];
  gh.issues.set(ISSUE, { state: "open", title: "Widgets", body: `## Problem\n\nx\n\n## Acceptance criteria\n\n${criteria.map((c) => `- [ ] ${c}`).join("\n")}\n\n## Additional context\n\n- [ ] not a criterion\n` });
  const slices = { 41: "alpha", 42: "beta", 43: "gamma" };
  // The parent issue's sub-issues as GitHub lists them; a slice can leave it.
  gh.slices = new Set(Object.keys(slices).map(Number));
  for (const n of Object.keys(slices)) gh.issues.set(Number(n), { state: "open", title: `slice ${n}`, body: "" });
  const snapClient = (dir) => ({
    fetchMain: () => originMain(dir), worktrees: () => [],
    issue: (n) => ({ ...gh.issues.get(n), number: n }),
    subIssues: (n) => (n === ISSUE && gh.onSubIssues?.(), n === ISSUE ? [...gh.slices].map((k) => ({ number: k, title: `slice ${k}`, state: gh.issues.get(k).state })) : []),
    blockedBy: (n) => (n === 42 ? [{ number: 41, state: gh.issues.get(41).state }] : []),
    effort: () => "High",
    pulls: (n) => [...gh.pulls.values()].filter((p) => p.closes.includes(n)).map((p) => ({ number: p.number, state: p.state, isDraft: p.isDraft, headRefName: p.branch, headRefOid: p.head, baseRefName: p.base, closingIssuesReferences: p.closes.map((c) => ({ number: c })), mergeCommit: p.mergeCommit ? { oid: p.mergeCommit } : null })),
    comments: (pr) => client.comments(pr),
    checks: (pr) => gh.pulls.get(pr).checks.map((c) => ({ name: c.name, state: c.state })),
    onMain: (sha) => { try { execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: dir, stdio: "ignore", windowsHide: true }); return true; } catch { return false; } },
  });
  const snapshotNow = (dir = src) => run.takeSnapshot({ repository: REPO, issue: ISSUE }, snapClient(dir));
  const scopeNow = (dir = src) => run.readIssueScope({ issue: ISSUE }, snapClient(dir));

  // --- The coordinator starts: invocation, record, checkpoints ---------------
  const srcPrivate = path.join(tmp, "src-private");
  fs.mkdirSync(srcPrivate);
  const recordFile = path.join(srcPrivate, "run.json");
  const invocation = `Use orchestrate-issues for #${ISSUE}.`;
  // Who merges is the coordinator's recorded reading of the request: the
  // command line refuses to leave it out, and a request that asks to stop at
  // ready PRs never grants the coordinator the merge.
  assert.throws(() => run.main(["init", "--invocation", invocation]), /--merging must record who merges: coordinator or maintainer/);
  assert.throws(() => run.mergingFor(invocation, "maybe"), /--merging must be coordinator or maintainer/);
  // The authority check reads the quoted request: the skill's name beside the
  // parent's own number admits, whatever the parent's type; another number,
  // a longer one or a discussion of the skill refuses.
  const quoted = (text) => ({ invocation: { text }, issue: ISSUE });
  assert.equal(ig.invokes(quoted(`Use orchestrate-issues for #${ISSUE}`)), true, "an explicit invocation names the skill and the parent");
  assert.equal(ig.invokes(quoted(`Use orchestrate-issues for #${ISSUE}, the Task whose sub-issues are the slices.`)), true, "the parent's type does not matter to the check");
  assert.equal(ig.invokes(quoted(`Use orchestrate-issues for #${ISSUE + 1}`)), false, "another number is not this parent");
  assert.equal(ig.invokes(quoted(`Use orchestrate-issues for #${ISSUE}1`)), false, "a longer number is not this parent");
  assert.equal(ig.invokes(quoted("Can you explain how orchestrate-issues merges PRs?")), false, "a discussion of the skill grants nothing");
  assert.equal(ig.invokes(quoted(`Please orchestrate #${ISSUE} for me.`)), false, "a request that does not name the skill grants nothing");
  for (const text of ["Use orchestrate-issues for #40, but stop at ready PRs.", "Use orchestrate-issues for #40 and do not merge anything.", "Use orchestrate-issues for #40 --stop-at-ready."]) assert.throws(() => run.mergingFor(text, "coordinator"), /asks to stop at ready PRs or not to merge; record --merging maintainer/, text);
  run.initRecord({ record: recordFile, checkout: src, repository: REPO, issue: ISSUE, coordinator: "local_coord", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", writerModel: "gpt-6.1-sol", invocation, merging: "coordinator" }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
  assert.deepEqual([run.readRecord(recordFile).invocation.merging, run.readRecord(recordFile).authority.merge], ["coordinator", run.MERGE_GRANT], "an explicit invocation, recorded as such, grants the coordinator the scoped merge");
  assert.equal(run.coordinatorMerges(run.readRecord(recordFile)), true);
  assert.equal(cp.enable(recordFile, { coordinator: "local_coord", expectRevision: 1, github: statusGithub, host: SRC }).checkpoint.saved, true);
  // Inside every merge call, before GitHub acts, the shared checkpoint must
  // already hold that merge's intent.
  gh.intentsSeen = [];
  // The operation is the one the record holds for this call, by id, so an
  // earlier attempt's intent left on the state branch does not count.
  gh.beforeMerge = (pr, head) => {
    const op = run.readRecord(recordFile).operations.filter((o) => o.kind === "merge" && o.pr === pr).at(-1);
    gh.intentsSeen.push({ pr, head, saved: cp.fetchState(src, "origin", REPO, ISSUE).checkpoint.operations.some((o) => o.id === op?.id && o.expectHead === head && o.state === "intent") });
  };
  const record = () => run.readRecord(recordFile);
  const change = (fn, file = recordFile, coordinator = "local_coord") => run.updateRecord(file, { expectRevision: run.readRecord(file).revision, coordinator }, fn).output;

  // A stop-at-ready invocation records the maintainer's merge instead.
  const stopFile = path.join(tmp, "stop-checkout");
  git(tmp, "clone", "-q", remote, stopFile);
  const stopRecordFile = path.join(srcPrivate, "stop.json");
  run.initRecord({ record: stopRecordFile, checkout: stopFile, repository: REPO, issue: ISSUE, coordinator: "local_stop", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", writerModel: "gpt-6.1-sol", invocation: `${invocation} Stop at ready PRs.`, merging: "maintainer" }, { defaults, freeBytes: 100 * GB, totalMemory: 64 * GB, host: SRC });
  const stopRecord = run.readRecord(stopRecordFile);
  assert.deepEqual([stopRecord.invocation.merging, stopRecord.authority.merge, run.coordinatorMerges(stopRecord)], ["maintainer", run.AUTHORITY.merge, false]);

  // --- Dispatch: plan, claim and confirm the writers --------------------------
  const preflights = [{ route: "codex-cli", model: "gpt-6.1-sol", verdicts: [41, 42, 43].map((n) => ({ ticket: n, effort: "high", verdict: "available" })) }];
  const plan = (rec = record(), snapshot = snapshotNow()) => run.planDispatch({ record: rec, snapshot, preflights, freeBytes: 100 * GB, defaults, host: SRC });
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
  const report = (n, reviewedHead, findings = "None") => change((r) => run.result(r, { ticket: n, report: write(`report-${n}-${clock}.json`, { model: "gpt-6.1-sol", effort: "high", permissionMode: null, pr: 100 + n, reviewedHead, rounds: { "claude-opus-5-5": 1 }, findings, verification: "red/green regression and tooling checks", ci: "all passed", next: "await the coordinator's merge" }) }));
  const snapshotFile = (s = snapshotNow()) => write(`snapshot-${clock}.json`, s);
  const gate = (n, rec = record(), facts) => {
    const pr = 100 + n, g = gitOf(src);
    return ig.admission(rec, { ticket: n, pr, snapshot: snapshotNow(), facts: facts ?? ig.gatherFacts({ record: rec, pr, client, git: g }), git: g });
  };
  const blocked = (result, pattern, why) => assert.ok(!result.admitted && result.blockers.some((b) => pattern.test(b)), `${why}: ${result.blockers.join(" | ")}`);
  // The same gate with the run's tickets apart from its code: a copy of the
  // record naming the tickets repository, and a GitHub whose review thread
  // for the PR is the slice's ticket. With `onTicket` the PR's review
  // conversation is there; without it, only on the PR, which then counts for
  // nothing.
  const INTERNAL = "acme/widgets-internal";
  const threadGate = (n, onTicket) => {
    const rec = { ...record(), ticketsRepository: INTERNAL }, pr = 100 + n, g = gitOf(src), asked = [];
    const routed = { ...client, comments: (m, ticket) => { asked.push([m, ticket]); return ticket === undefined ? client.comments(m) : ticket === n && onTicket ? client.comments(pr) : []; } };
    return { result: ig.admission(rec, { ticket: n, pr, snapshot: snapshotNow(), facts: ig.gatherFacts({ record: rec, ticket: n, pr, client: routed, git: g }), git: g }), asked };
  };
  const merge = (n, file = recordFile, coordinator = "local_coord", dir = src, afterIntent = () => cp.ensureSaved(file, { coordinator, github: statusGithub, host: dir === src ? SRC : DST })) => ig.mergeAdmitted(file, { coordinator, expectRevision: run.readRecord(file).revision, ticket: n, pr: 100 + n, takeSnapshot: () => snapshotNow(dir), readScope: () => scopeNow(dir), client, git: gitOf(dir), afterIntent });

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
  // With tickets apart, the gate reads the report and its adjudication from
  // the ticket's comments, and the PR's own comments do not stand in for them.
  const split41 = threadGate(41, true);
  assert.deepEqual([split41.result.blockers, split41.asked], [[], [[141, 41]]], "the gate asks for PR #141's review thread on ticket #41 and admits the head from it");
  blocked(threadGate(41, false).result, new RegExp(`report \\d+ \\(round 1, undirected\\) is not on review thread ${INTERNAL}#41`), "a report left on the PR alone, once tickets live apart");
  gh.pulls.get(141).closes = [];
  blocked(threadGate(41, true).result, new RegExp(`does not close ${INTERNAL}#41 \\(its body has no Closes ${INTERNAL}#41\\)`), "a PR whose closing references name no internal ticket");
  gh.pulls.get(141).closes = [41];
  // The client behind it: the PR, its checks, protection, main's runs and the
  // merge on the code repository; the parent issue, its comments and closure and
  // the review thread on the tickets repository. A PR closes a ticket only by
  // a reference to the tickets repository's issue of that number; with one
  // repository its references count by number, as before.
  {
    const ref = (slug, number) => ({ number, repository: { name: slug.split("/")[1], owner: { login: slug.split("/")[0] } } });
    const calls = [];
    const exec = (cmd, args) => {
      calls.push(`${cmd} ${args.join(" ")}`);
      if (args[0] === "pr") return JSON.stringify({ state: "OPEN", isDraft: false, headRefOid: "h", headRefName: "feat/41-alpha", baseRefName: "main", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", mergeCommit: null, closingIssuesReferences: [ref(REPO, 41), ref(INTERNAL, 43), ref("acme/other", 41), { number: 42 }], statusCheckRollup: [] });
      if (args[0] === "run") return "[]";
      if (args.includes("--slurp")) return "[[]]";
      if (/protection/.test(args.at(-1))) throw Object.assign(new Error("HTTP 404"), { stderr: "HTTP 404" });
      return JSON.stringify({ id: 9, state: "open", title: "t", body: "b", html_url: "u" });
    };
    const spawn = (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); return { status: 0, stdout: "", stderr: "" }; };
    const exercise = (names) => {
      calls.length = 0;
      const c = ig.integrationClient(names, src, { exec, spawn });
      const closes = c.pull(141).closes;
      c.comments(141, 41); c.comments(ISSUE); c.protection("main"); c.mainRuns("main"); c.merge(141, "h"); c.issue(ISSUE); c.createComment(ISSUE, "report"); c.getComment(9); c.closeIssue(ISSUE);
      return { closes, calls: [...calls] };
    };
    const one = exercise({ repository: REPO }), split = exercise({ repository: REPO, ticketsRepository: INTERNAL });
    assert.deepEqual(one.closes, [41, 43, 41, 42], "with one repository closing references count by number, as before");
    assert.deepEqual(split.closes, [43], "with tickets apart only the tickets repository's references close a ticket: not the code repository's #41, another repository's, or a bare one");
    const pull = `gh pr view 141 --repo ${REPO} --json state,isDraft,headRefOid,headRefName,baseRefName,mergeable,mergeStateStatus,mergeCommit,closingIssuesReferences,statusCheckRollup`;
    const shared = [`gh api repos/${REPO}/branches/main/protection/required_status_checks`, `gh api --paginate --slurp repos/${REPO}/rules/branches/main`, `gh run list --repo ${REPO} --workflow Test Suite --branch main --event push --limit 10 --json databaseId,headSha,status,conclusion,createdAt,url`, `gh ${ig.mergeArgs(REPO, 141, "h").join(" ")}`];
    const ticketsCalls = (t) => [`gh api repos/${t}/issues/${ISSUE}`, `gh api -X POST repos/${t}/issues/${ISSUE}/comments --input -`, `gh api repos/${t}/issues/comments/9`, `gh api -X PATCH repos/${t}/issues/${ISSUE} -f state=closed -f state_reason=completed`];
    assert.deepEqual(one.calls, [pull, `gh api --paginate --slurp repos/${REPO}/issues/141/comments`, `gh api --paginate --slurp repos/${REPO}/issues/${ISSUE}/comments`, ...shared, ...ticketsCalls(REPO)], "with one repository every call is today's");
    assert.deepEqual(split.calls, [pull, `gh api --paginate --slurp repos/${INTERNAL}/issues/41/comments`, `gh api --paginate --slurp repos/${INTERNAL}/issues/${ISSUE}/comments`, ...shared, ...ticketsCalls(INTERNAL)], "with tickets apart the review thread, the parent issue and its closure are on the tickets repository, and the merge stays on the code repository");
  }

  // Authority: a run that records the maintainer's merge, a grant in other
  // words, a request asking to stop at ready, a discussion, and a coordinator
  // that wrote for the ticket are refused; so is any session other than the
  // coordinator, and a run whose intents cannot be saved remotely.
  blocked(gate(41, { ...record(), invocation: { ...record().invocation, merging: "maintainer" }, authority: run.authorityFor("maintainer") }), /the run records that the maintainer merges \(merging maintainer\)/, "stop-at-ready disables merging");
  blocked(gate(41, { ...record(), invocation: { text: invocation } }), /the run records that the maintainer merges \(merging not recorded\)/, "a record without the decision does not merge");
  blocked(gate(41, { ...record(), authority: { ...record().authority, merge: "the maintainer merges ready PRs" } }), /does not let the coordinator merge/, "a record made under another grant does not merge");
  for (const text of ["Use orchestrate-issues for #40, but stop at ready PRs.", "Use orchestrate-issues for #40 --stop-at-ready."]) blocked(gate(41, { ...record(), invocation: { text, merging: "coordinator" } }), /does not let the coordinator merge/, `a request to stop at ready never merges, whatever decision sits beside it: ${text}`);
  blocked(gate(41, { ...record(), checkpoints: undefined }), /checkpoints are not enabled for this run/, "no merge without a durable intent");
  blocked(gate(41, { ...record(), invocation: { text: "Can you explain how orchestrate-issues merges PRs?" } }), /does not name orchestrate-issues and issue #40/, "a discussion of the skill grants nothing");
  // A ticket another slice's PR delivers has no merge of its own.
  {
    const delivered = snapshotNow();
    delivered.tickets = delivered.tickets.map((t) => (t.number === 41 ? { ...t, deliveredBy: { ticket: 42, via: "pr", pr: 142 } } : t));
    blocked(ig.admission(record(), { ticket: 41, pr: 141, snapshot: delivered, facts: ig.gatherFacts({ record: record(), pr: 141, client, git: gitOf(src) }), git: gitOf(src) }), /#41 is delivered by #42's PR; the merge is #42's/, "a delivered ticket is merged through its slice");
  }
  const selfWritten = structuredClone(record());
  selfWritten.tickets[41].history.push({ owner: { handle: { kind: "session", id: "local_coord" } }, released: "x" });
  blocked(gate(41, selfWritten), /local_coord wrote for #41, and a writer never merges its own work/, "a coordinator that wrote for the ticket");
  // A detached CLI writer is known by the session its stream names.
  const cliDir = path.join(tmp, "cli-launch-41");
  fs.mkdirSync(cliDir, { recursive: true });
  fs.writeFileSync(path.join(cliDir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: "6f1e2d3c-4b5a-4968-8778-9a8b7c6d5e4f" })}\n`);
  const cliWritten = structuredClone(record());
  cliWritten.tickets[41].history.push({ owner: { route: "claude-cli", handle: { kind: "process", pid: null, launchDir: cliDir } }, released: "x" });
  cliWritten.coordinator.session = "local_6f1e2d3c-4b5a-4968-8778-9a8b7c6d5e4f";
  blocked(gate(41, cliWritten), /local_6f1e2d3c-4b5a-4968-8778-9a8b7c6d5e4f wrote for #41, and a writer never merges its own work/, "a coordinator whose session was the ticket's CLI writer, opened in the app");
  const unknownWriter = structuredClone(record());
  unknownWriter.tickets[41].history.push({ owner: { route: "claude-cli", handle: { kind: "process", pid: 4242, start: "1" } }, released: "x" });
  blocked(gate(41, unknownWriter), /#41's writer process 4242 has no recorded session and no stream was recorded for it, so whether its session wrote for the ticket is unknown/, "a writer whose session is unknown never counts as not having written");
  assert.throws(() => ig.mergeAdmitted(recordFile, { coordinator: "local_w41", expectRevision: record().revision, ticket: 41, pr: 141, takeSnapshot: () => snapshotNow(), readScope: () => scopeNow(), client, git: gitOf(src) }), /coordinated by local_coord; local_w41 may not merge/, "a writer session cannot use the coordinator's exception");

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

  // Main advances: the head no longer contains it, and the gate still admits
  // it, naming the main its CI covered; main's own run after the merge is the
  // integration check. A clean merge of main keeps the review and the head
  // then covers main again.
  const mainBefore = git(src, "rev-parse", "origin/main");
  const mainAfter = advanceMain("other.txt", "another PR\n", "feat: another PR");
  g41 = gate(41);
  assert.deepEqual([g41.admitted, g41.containsMain, g41.ciMain, g41.originMain], [true, false, mainBefore, mainAfter], `a head behind main is admitted and the main its CI covered is named: ${g41.blockers.join(" | ")}`);
  // Main's own CI decides: a red main holds every merge, a cancelled newer
  // run says nothing, a pending run on the newest main does not hold it, and
  // unreadable runs do not hold it either.
  const mainRun = (more) => ({ id: 1, headSha: mainAfter, status: "completed", conclusion: "success", createdAt: at(), url: "https://github.com/x/y/actions/runs/1", ...more });
  gh.mainRuns = [mainRun({ conclusion: "failure" })];
  blocked(gate(41), /main's own CI is red: the latest completed push run of Test Suite on main concluded failure at .*; no merge lands on a red main/, "a red main");
  gh.mainRuns = [mainRun({ conclusion: "failure" }), mainRun({ id: 2, conclusion: "cancelled" })];
  blocked(gate(41), /main's own CI is red/, "a cancelled newer run does not clear a red main");
  gh.mainRuns = [mainRun({ conclusion: "failure" }), mainRun({ id: 2 })];
  assert.deepEqual([gate(41).admitted, gate(41).mainCi.verdict], [true, "green"], "a later green run clears it");
  gh.mainRuns = [mainRun({ id: 3, status: "in_progress", conclusion: "" })];
  assert.deepEqual([gate(41).admitted, gate(41).mainCi.verdict], [true, "none"], "a pending run on the newest main does not hold the gate");
  gh.mainRunsFail = "HTTP 502 while listing runs";
  assert.deepEqual([gate(41).admitted, gate(41).mainCi.verdict], [true, "none"], "unreadable runs do not hold the gate");
  gh.mainRunsFail = null;
  gh.mainRuns = [mainRun()];
  git(worktrees[41], "fetch", "-q", "origin");
  git(worktrees[41], "merge", "-q", "--no-edit", "origin/main");
  const h41m = push(41);
  setHead(41, h41m);
  g41 = gate(41);
  trace("gate-41-after-main-merge", g41);
  assert.deepEqual([g41.admitted, g41.disposition, g41.reviewedHead, g41.mergedSince, g41.containsMain, g41.ciMain], [true, "reviewed", h41, [h41m], true, mainAfter], "a clean merge of main on the reviewed head is admitted, and named");

  // The plan: #41 merges through the gate once its writer is settled; #42
  // waits for it. Under stop-at-ready the same PR waits for the maintainer.
  change((r) => run.release(r, { ticket: 41, observations: { sessions: { local_w41: { state: "archived" } } }, evidence: "the writer's session ended", host: SRC }));
  p = plan();
  assert.deepEqual([actions(p)[41], actions(p)[42]], ["merge-gate", "wait-dependency"]);
  const stopPlan = plan(run.readRecord(stopRecordFile));
  assert.deepEqual([actions(stopPlan)[41], actions(stopPlan)[42]], ["await-maintainer", "wait-dependency"], "stop-at-ready leaves the merge to the maintainer and the dependent waiting");
  assert.match(stopPlan.tickets.find((t) => t.number === 41).reason, /the invocation stops at ready, so the maintainer merges it/);
  assert.match(stopPlan.remaining.join(" "), /wait for the maintainer to merge them/);

  // A save that fails stops the merge before GitHub is called.
  const callsBeforeSave = gh.mergeCalls.length;
  assert.throws(() => ig.mergeAdmitted(recordFile, { coordinator: "local_coord", expectRevision: record().revision, ticket: 41, pr: 141, takeSnapshot: () => snapshotNow(), readScope: () => scopeNow(), client, git: gitOf(src), afterIntent: () => { throw new Error("the remote is unreachable"); } }), /the remote is unreachable/);
  assert.equal(gh.mergeCalls.length, callsBeforeSave, "no merge call without a saved intent");
  assert.deepEqual([record().operations.at(-1).state, record().operations.at(-1).evidence], ["failed", "not run: the remote is unreachable"]);
  // The slice leaves the parent issue while the intent is saved: the second gate
  // takes a fresh snapshot, so the coordinator's scope is current.
  const unscoped = merge(41, recordFile, "local_coord", src, () => { gh.slices.delete(41); cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }); });
  gh.slices.add(41);
  assert.deepEqual([unscoped.merged, unscoped.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], unscoped.evidence);
  assert.match(unscoped.evidence, /not run: #41 is not a sub-issue of issue #40/);
  // Main moves while the intent is saved: the gate runs again after the save
  // and stops the merge, since the intent named another main; the gate is
  // run again, which costs seconds, not a CI run.
  const moved = merge(41, recordFile, "local_coord", src, () => { advanceMain("other2.txt", "another PR\n", "feat: a PR merged during the save"); cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }); });
  assert.deepEqual([moved.merged, moved.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], moved.evidence);
  assert.match(moved.evidence, /not run: .*origin\/main moved from [0-9a-f]{40} to [0-9a-f]{40}/);
  git(worktrees[41], "fetch", "-q", "origin");
  git(worktrees[41], "merge", "-q", "--no-edit", "origin/main");
  let h41n = push(41);
  setHead(41, h41n);
  // Main moves during the second gate's slower reads, and then between the
  // second gate and the call: main is read after those reads and once more
  // just before GitHub is called, so each stops the merge.
  const catchUp = () => { git(worktrees[41], "fetch", "-q", "origin"); git(worktrees[41], "merge", "-q", "--no-edit", "origin/main"); h41n = push(41); setHead(41, h41n); };
  const duringReads = merge(41, recordFile, "local_coord", src, () => { cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }); gh.onComments = () => { gh.onComments = null; advanceMain("during-reads.txt", "lands during the gate's reads\n", "feat: a PR merged during the second gate"); }; });
  assert.deepEqual([duringReads.merged, duringReads.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], duringReads.evidence);
  assert.match(duringReads.evidence, /not run: .*origin\/main moved from [0-9a-f]{40} to [0-9a-f]{40}/);
  catchUp();
  const beforeCall = merge(41, recordFile, "local_coord", src, () => { cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }); gh.onFetch = (pr) => { if (pr === undefined) { gh.onFetch = null; advanceMain("before-call.txt", "lands just before the call\n", "feat: a PR merged just before the call"); } }; });
  assert.deepEqual([beforeCall.merged, beforeCall.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], beforeCall.evidence);
  assert.match(beforeCall.evidence, /not run: origin\/main moved from [0-9a-f]{40} to [0-9a-f]{40}/);
  catchUp();
  // Another coordinator takes the parent issue over while the intent is saved: the
  // state branch's owner is read with the last checks, so nothing is called.
  const disowned = ig.mergeAdmitted(recordFile, { coordinator: "local_coord", expectRevision: record().revision, ticket: 41, pr: 141, takeSnapshot: () => snapshotNow(), readScope: () => scopeNow(), client, git: gitOf(src), afterIntent: () => cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }), ownership: () => ["issue #40 has been taken over: checkpoint 99 names coordinator local_other"] });
  assert.deepEqual([disowned.merged, disowned.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], disowned.evidence);
  assert.match(disowned.evidence, /not run: issue #40 has been taken over/);
  // The slice leaves the parent issue while ownership is read: ownership comes
  // before the second gate's scope, so the scope that admits the call is the
  // one read after every slower read.
  const leftDuringOwnership = ig.mergeAdmitted(recordFile, { coordinator: "local_coord", expectRevision: record().revision, ticket: 41, pr: 141, takeSnapshot: () => snapshotNow(), readScope: () => scopeNow(), client, git: gitOf(src), afterIntent: () => cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }), ownership: (r, id) => { gh.slices.delete(41); return ig.remoteOwnership(r, id); } });
  gh.slices.add(41);
  assert.deepEqual([leftDuringOwnership.merged, leftDuringOwnership.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], leftDuringOwnership.evidence);
  assert.match(leftDuringOwnership.evidence, /not run: .*#41 is not a sub-issue of issue #40/);
  // The slice leaves the parent issue after the final snapshot listed it, while
  // that snapshot and the premises make their slower reads: the gate reads the
  // parent issue's scope again after them, so nothing is called.
  const leftDuringReads = merge(41, recordFile, "local_coord", src, () => { cp.ensureSaved(recordFile, { coordinator: "local_coord", github: statusGithub, host: SRC }); gh.onComments = () => { gh.onComments = null; gh.slices.delete(41); }; });
  gh.slices.add(41);
  assert.deepEqual([leftDuringReads.merged, leftDuringReads.state, gh.mergeCalls.length], [false, "failed", callsBeforeSave], leftDuringReads.evidence);
  assert.match(leftDuringReads.evidence, /not run: .*the parent issue's slices changed during the final checks/);

  // The merge, through the public command: intent saved first by the
  // command's own wiring, an expected-head call with no bypass, and the
  // outcome read back from GitHub.
  const merged41 = ig.main(["merge", "--record", recordFile, "--coordinator", "local_coord", "--expect-revision", String(record().revision), "--ticket", "41", "--pr", "141"], { clientFor: () => client, gitFor: () => gitOf(src), github: statusGithub, snapshotFor: () => () => snapshotNow(), scopeFor: () => () => scopeNow() });
  trace("merge-41", merged41);
  assert.deepEqual([merged41.merged, merged41.state, merged41.onMain, merged41.baseMoved, merged41.checkpoint?.saved], [true, "confirmed", true, false, true]);
  assert.deepEqual(gh.mergeCalls.at(-1), ["pr", "merge", "141", "--repo", REPO, "--merge", "--match-head-commit", h41n]);
  assert.ok(!gh.mergeCalls.flat().some((a) => ["--admin", "--auto", "--rebase", "--squash"].includes(a)), "the merge call never bypasses protection or defers the merge");
  const op41 = record().operations.find((o) => o.id === merged41.operation);
  assert.deepEqual([op41.state, op41.expectHead, op41.gate.disposition, op41.gate.mergedSince.length, op41.mergeCommit], ["confirmed", h41n, "reviewed", 4, gh.pulls.get(141).mergeCommit]);
  assert.deepEqual(gh.intentsSeen.at(-1), { pr: 141, head: h41n, saved: true }, "the public command saved the intent on the state branch before GitHub was called");
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
  // With tickets apart, the published checkpoint decision and every round's
  // adjudications are read from ticket #42's comments; left only on the PR,
  // the acceptance covers nothing.
  const split42 = threadGate(42, true).result;
  assert.deepEqual([split42.admitted, split42.disposition, split42.acceptance?.id], [true, "accepted-unreviewed", decided.id], split42.blockers.join(" | "));
  blocked(threadGate(42, false).result, /no acceptance covers it/, "an acceptance left on the PR alone, once tickets live apart");
  // A new push invalidates the acceptance for merging.
  const stale = commitIn(worktrees[42], "beta.txt", "late change\n", "fix: late change (#42)");
  setHead(42, stale);
  blocked(gate(42), /applies to .*but the PR's head is/, "a head pushed after the acceptance");
  git(worktrees[42], "reset", "-q", "--hard", correction);
  setHead(42, push(42));
  change((r) => run.release(r, { ticket: 42, observations: { sessions: { local_w42: { state: "archived" } } }, evidence: "the writer's session ended", host: SRC }));
  // Another PR lands on main inside the merge call itself, after the second
  // gate: the merge stands, and its outcome says CI never ran on what landed.
  gh.mode = "main-moves";
  const merged42 = merge(42);
  assert.deepEqual([merged42.state, merged42.gate.disposition, merged42.baseMoved], ["confirmed", "accepted-unreviewed", true], merged42.evidence);
  assert.match(merged42.evidence, /landed on [0-9a-f]{40}, while its CI covered main [0-9a-f]{40}, so CI never ran on that combination before main's own run/);

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
  // Round 3 is complete, so the PR merges only under a checkpoint decided at
  // it, and never while a question to the maintainer is in force.
  blocked(gate(43), /round 3's checkpoint has no published finish or acceptance decided at it/, "an undecided round 3 checkpoint");
  const decide43 = (kind, more = {}) => {
    const e = rc.gatherEvidence({ record: record(), ticket: 43, pr: 143, client, git: rcGit(src) });
    const findings = rc.roundState(rc.readJournals(path.join(`${src}.review-jobs`, "pr-143"))).reports.map((x) => ({ comment: x.comment, finding: `round ${x.round}`, disposition: "accepted" }));
    const d = change((r) => rc.decide(r, { ticket: 43, kind, assessment: { ...assessment, findings, ...more }, evidence: e }));
    const c = post(143, d.body);
    change((r) => rc.published(r, { ticket: 43, id: d.id, comment: c.id, readBack: d.body, head: h43c }));
    return d;
  };
  const hold = decide43("maintainer", { question: "Should the README keep main's line last?" });
  blocked(gate(43), new RegExp(`decision ${hold.id} \\(maintainer after round 3\\) is in force; the ticket waits for the maintainer's answer`), "a question to the maintainer holds a reviewed head");
  decide43("finish");
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
  // An interrupted call, or one that failed without GitHub's answer, may
  // still land: the outcome is uncertain even though the PR reads back open,
  // and the next merge waits for it to be settled from GitHub.
  for (const mode of ["throw", "no-answer"]) {
    gh.mode = mode;
    const unsure = merge(43);
    assert.deepEqual([unsure.merged, unsure.state], [false, "uncertain"], `${mode}: ${unsure.evidence}`);
    assert.match(unsure.evidence, /reads back OPEN at .*may still land/);
    const calls = gh.mergeCalls.length;
    const waiting = merge(43);
    assert.equal(waiting.admitted, false);
    assert.equal(waiting.gate.blockers.length, 1, waiting.gate.blockers.join(" | "));
    assert.match(waiting.gate.blockers[0], new RegExp(`merge of PR #143 ${unsure.operation} at ${h43c} is uncertain; settle it with checkpoint\\.mjs reconcile-operations`), "the unsettled merge alone holds the next one");
    assert.equal(gh.mergeCalls.length, calls, "no blind retry");
    assert.deepEqual(change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow() })).map((s) => [s.id, s.state, s.retry]), [[unsure.operation, "not-applied", true]], "GitHub shows it did not apply, so the gate may run again");
  }
  // The writer pushes while the merge's answer is lost: the PR reads back
  // open at another head, which is no refusal, so the outcome stays uncertain
  // and reconciliation settles it from GitHub's state.
  gh.mode = "push-no-answer";
  gh.pushTo = h43b;
  const pushed = merge(43);
  assert.deepEqual([pushed.merged, pushed.state], [false, "uncertain"], pushed.evidence);
  assert.match(pushed.evidence, new RegExp(`reads back OPEN at ${h43b}; the request may still land`));
  assert.deepEqual(change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow() })).map((s) => [s.id, s.state]), [[pushed.operation, "superseded"]], "a moved head means the expected-head merge did not apply");
  setHead(43, h43c);
  // Another PR lands on main, this merge lands on top of it, and the answer
  // and the read-back are lost: uncertain, and no further merge until it is
  // settled from GitHub.
  gh.mode = "main-moves-then-throw";
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
  const found = cp.discover({ repository: REPO, issue: ISSUE, checkout: dst, github: statusGithub });
  assert.ok(cp.limitations(found.checkpoint).some((l) => l.kind === "operation" && l.ticket === 43), "the destination is told the merge is unsettled");
  const taken = cp.resume({ record: dstRecord, checkout: dst, repository: REPO, issue: ISSUE, coordinator: "local_dst", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", coordinatorMode: "bypassPermissions", invocation: `Use orchestrate-issues for #${ISSUE}; take over from the exhausted account.`, merging: "coordinator", evidence: "the maintainer reports the source account reached its usage limit" }, { github: statusGithub, host: DST, defaults, totalMemory: 64 * GB });
  assert.equal(taken.action, "takeover");
  assert.equal(run.coordinatorMerges(run.readRecord(dstRecord)), true, "the new coordinator's own invocation grants the merge");
  // The state branch now names the destination: the source no longer owns
  // the parent issue, and the destination's own intents are read there by id.
  assert.match(ig.remoteOwnership(run.readRecord(recordFile), lost.operation).join(" "), /issue #40 has been taken over: checkpoint [0-9]+ names coordinator local_dst/);
  assert.match(ig.remoteOwnership(run.readRecord(dstRecord), "no-such-op").join(" "), /operation no-such-op's intent is not on orchestrate-state\/issue-40/);
  const overUnsettled = ig.mergeAdmitted(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, ticket: 43, pr: 143, takeSnapshot: () => snapshotNow(dst), readScope: () => scopeNow(dst), client, git: gitOf(dst) });
  blocked(overUnsettled.gate, /is uncertain; settle it with checkpoint\.mjs reconcile-operations before any new merge/, "the destination does not merge over an unsettled operation");
  const settled = change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow(dst), firstParent: (sha) => git(dst, "rev-parse", `${sha}^1`) }), dstRecord, "local_dst");
  trace("reconcile-43", settled);
  assert.deepEqual(settled.filter((s) => s.pr === 143).map((s) => s.state), ["confirmed"], "GitHub's merged state confirms the merge, with no second call");
  assert.match(settled.find((s) => s.pr === 143).evidence, /it landed on [0-9a-f]{40}, while its CI covered main [0-9a-f]{40}, so CI never ran on that combination before main's own run/, "the recovery keeps where the merge landed");
  assert.equal(run.readRecord(dstRecord).operations.find((o) => o.id === lost.operation).baseMoved, true);
  // Without the merge's first parent, the recovery says where it landed is unknown.
  const unread = structuredClone(run.readRecord(dstRecord));
  Object.assign(unread.operations.find((o) => o.id === lost.operation), { state: "uncertain" });
  assert.match(cp.reconcileOperations(unread, { snapshot: snapshotNow(dst) }).find((s) => s.id === lost.operation).evidence, /where it landed could not be read/);
  assert.equal(gh.mergeCalls.length, callsBefore);
  assert.equal(actions(plan(run.readRecord(dstRecord), snapshotNow(dst)))[43], "done");
  // A PR merged at a head other than the one an operation expected was not
  // merged by that operation.
  const elsewhere = structuredClone(run.readRecord(dstRecord));
  elsewhere.operations.push({ id: "elsewhere", kind: "merge", ticket: 43, pr: 143, expectHead: h43b, state: "uncertain" });
  assert.equal(cp.reconcileOperations(elsewhere, { snapshot: snapshotNow(dst) }).find((r) => r.id === "elsewhere").state, "superseded", "a merge at another head is not this operation's success");

  // --- The parent issue's acceptance on main ---------------------------------------
  assert.deepEqual(ig.parseCriteria(gh.issues.get(ISSUE).body).map((c) => c.text), criteria, "only the checklist under the Acceptance criteria heading");
  // A criterion keeps its continuation lines, a nested heading stays inside
  // the section, and the section's hash changes with any of its text.
  const nested = "## Acceptance criteria\n\n- [ ] The widget works\n  on Windows and Linux.\n\n### Recovery\n\n- [x] It recovers.\n\n## Additional context\n\n- [ ] not a criterion\n";
  assert.deepEqual(ig.parseCriteria(nested).map((c) => c.text), ["The widget works on Windows and Linux.", "It recovers."]);
  assert.notEqual(run.acceptanceHash(nested), run.acceptanceHash(nested.replace("Windows and Linux", "Windows, Linux and macOS")));
  assert.notEqual(run.acceptanceHash(nested), run.acceptanceHash(nested.replace("### Recovery\n", "### Recovery\n\nAlso on a cold start.\n")));
  assert.equal(run.acceptanceHash(nested), run.acceptanceHash(nested.replace("## Additional context\n\n- [ ] not a criterion", "## Additional context\n\n- [ ] still not a criterion")), "text after the section is not part of it");
  // A heading or checkbox inside fenced code is part of an example: it neither
  // ends the section nor counts as a criterion.
  const fencedBody = "## Acceptance criteria\n\n- [ ] Basic operation works.\n\n```markdown\n## Example output\n- [ ] not a criterion inside the example\n```\n\n- [ ] Recovery after interruption works.\n\n## Additional context\n";
  assert.deepEqual(ig.parseCriteria(fencedBody).map((c) => c.text), ["Basic operation works.", "Recovery after interruption works."]);
  assert.notEqual(run.acceptanceHash(fencedBody), run.acceptanceHash(fencedBody.replace("after interruption", "after power loss")), "a criterion after a fenced heading is inside the section's hash");
  const commentedBody = "## Acceptance criteria\n\n- [ ] Basic operation works.\n\n<!--\n## A heading left in a comment\n- [ ] a commented-out checkbox\n-->\n\n- [ ] Recovery after interruption works.\n\n## Additional context\n";
  assert.deepEqual(ig.parseCriteria(commentedBody).map((c) => c.text), ["Basic operation works.", "Recovery after interruption works."]);
  assert.notEqual(run.acceptanceHash(commentedBody), run.acceptanceHash(commentedBody.replace("after interruption", "after power loss")), "a criterion after a commented heading is inside the section's hash");
  // Every list marker GitHub renders as a task item is a criterion: `-`, `+`
  // and `*` bullets, ordered items, and items inside a blockquote.
  const markersBody = "## Acceptance criteria\n\n- [ ] Basic works.\n+ [ ] Interrupted recovery works.\n* [x] Windows works.\n1. [ ] Linux works.\n2) [ ] macOS works.\n   on both architectures.\n> - [ ] Quoted works.\n\n## Additional context\n";
  assert.deepEqual(ig.parseCriteria(markersBody).map((c) => c.text), ["Basic works.", "Interrupted recovery works.", "Windows works.", "Linux works.", "macOS works. on both architectures.", "Quoted works."]);
  const verify = (evidence, snapshot = snapshotNow(dst)) => change((r) => ig.verifyIssue(r, { snapshot, evidence, mainSha: originMain(dst) }), dstRecord, "local_dst");
  const met = (c, evidence) => ({ criterion: c, status: "met", evidence });
  assert.throws(() => verify({ criteria: [met(criteria[0], ["x"])] }), /omits criterion 2/);
  assert.throws(() => verify({ criteria: criteria.map((c, i) => met(c, i === 1 ? [] : ["x"])) }), /Criterion 2 is met only with evidence/);
  assert.throws(() => verify({ criteria: criteria.map((c, i) => (i === 2 ? { criterion: c, status: "unmet" } : met(c, ["x"]))) }), /Criterion 3 is unmet; name the gap/);
  assert.throws(() => verify({ criteria: [...criteria.map((c) => met(c, ["x"])), met("An invented criterion.", ["x"])] }), /criteria the parent issue does not list/);
  // A parent without an "Acceptance criteria" section (a Bug, or a parent
  // whose body lost the section) is refused with the section named, nothing
  // is recorded, the plan never reports completion and nothing closes it.
  {
    const withSection = gh.issues.get(ISSUE).body;
    gh.issues.get(ISSUE).body = withSection.replace(/## Acceptance criteria[\s\S]*?(?=## Additional context)/, "");
    const bare = snapshotNow(dst);
    assert.equal(bare.issue.acceptanceSha256, null, "the snapshot sees no section");
    const closeCallsBefore = gh.closeCalls ?? 0, verificationsBefore = (run.readRecord(dstRecord).verifications ?? []).length;
    assert.throws(() => verify({ criteria: [] }, bare), /Issue #40 has no "Acceptance criteria" section, so nothing can be verified and the parent issue stays open on its merged PRs alone; add a heading named Acceptance criteria/);
    assert.equal((run.readRecord(dstRecord).verifications ?? []).length, verificationsBefore, "a refused verification records nothing");
    assert.deepEqual([gh.closeCalls ?? 0, gh.issues.get(ISSUE).state, plan(run.readRecord(dstRecord), bare).complete], [closeCallsBefore, "open", false], "close-issue is never reached: the parent stays open on its merged PRs");
    gh.issues.get(ISSUE).body = withSection.replace(/(## Acceptance criteria\n\n)[\s\S]*?(?=\n\n## Additional context)/, "$1Nothing to tick here.");
    assert.throws(() => verify({ criteria: [] }), /lists no checklist under its "Acceptance criteria" heading/, "a section without a checklist is refused too");
    gh.issues.get(ISSUE).body = withSection;
  }
  // Every slice merged, one criterion unmet: the parent issue stays open.
  const unmet = verify({ criteria: [met(criteria[0], ["merge operations of PRs #141, #142 and #143 carry the gate's admission"]), met(criteria[1], ["the final report lists decision on PR #142"]), { criterion: criteria[2], status: "unmet", gap: "the closing run has not been exercised" }] });
  assert.equal(unmet.verdict, "incomplete");
  const close = (id, extra = {}) => ig.closeIssue(dstRecord, { coordinator: "local_dst", expectRevision: run.readRecord(dstRecord).revision, verification: id, takeSnapshot: () => snapshotNow(dst), readScope: () => scopeNow(dst), client, git: gitOf(dst), afterIntent: () => cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }), ...extra });
  assert.throws(() => close(unmet.id), /found the parent issue incomplete .*unmet: The parent issue closes only/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "merged slices with an unmet criterion are not completion");
  // A slice not delivered keeps it open too, whatever the criteria say.
  const missing = snapshotNow(dst);
  missing.tickets = missing.tickets.map((t) => (t.number === 43 ? { ...t, state: "open", delivered: false, prs: [] } : t));
  const partial = verify({ criteria: criteria.map((c) => met(c, ["evidence"])) }, missing);
  assert.equal(partial.verdict, "incomplete");
  assert.match(partial.report, /#43: open with no merged PR/);
  // Every criterion met on the assembled implementation.
  const doneEvidence = { criteria: [met(criteria[0], ["merge operations of PRs #141, #142 and #143 carry the gate's admission and read-back"]), met(criteria[1], ["the final report names decision on PR #142 with its range"]), met(criteria[2], ["the unmet run above stayed open; this run closes with evidence"])] };
  const done = verify(doneEvidence);
  assert.equal(done.verdict, "complete");
  // A delivered ticket's row carries its deliverer's PR and merge, which its
  // own PR list lacks once tickets live apart.
  {
    const withDelivered = snapshotNow(dst);
    const slice43 = withDelivered.tickets.find((t) => t.number === 43), merged43 = slice43.prs.find((p) => p.state === "MERGED");
    withDelivered.tickets.push({ number: 45, title: "bug #43 delivered", state: "closed", type: "Bug", parent: ISSUE, container: false, effort: "High", delivered: true, blockers: [], prs: [{ number: 990, state: "MERGED", isDraft: false, branch: "fix/999-elsewhere", head: "h990", base: "main", mergeCommit: "c".repeat(40), closes: [45] }], worktrees: [], deliveredBy: { ticket: 43, via: "pr", pr: merged43.number, merged: true } });
    const report = ig.finalReport(run.readRecord(dstRecord), withDelivered, run.readRecord(dstRecord).verifications.find((v) => v.id === done.id));
    const row = report.split("\n").find((l) => l.startsWith("| #45 |"));
    assert.ok(row, "the delivered ticket has a row");
    assert.doesNotMatch(row, /#990|ccccccccc/, "an unrelated merged PR in the ticket's own list is not its delivery");
    // A delivered ticket whose deliverer has no PR yet reports that absence,
    // never another PR in its own list.
    const noPr = { ...withDelivered, tickets: withDelivered.tickets.map((t) => (t.number === 45 ? { ...t, state: "open", delivered: false, deliveredBy: { ticket: 43, via: "body", pr: null, merged: false } } : t)) };
    const noPrRow = ig.finalReport(run.readRecord(dstRecord), noPr, run.readRecord(dstRecord).verifications.find((v) => v.id === done.id)).split("\n").find((l) => l.startsWith("| #45 |"));
    assert.match(noPrRow, /^\| #45 \| open \|  \| delivered by #43's PR: no merged PR/, "a deliverer with no PR borrows nothing");
    assert.match(row, new RegExp(`^\\| #45 \\| delivered \\| #${merged43.number} \\| delivered by #43's PR: merged by the coordinator as \\\`${String(merged43.mergeCommit).slice(0, 9)}\\\``), "the row names the deliverer, its PR and its merge through the gate");
  }
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, true);
  // A complete verification stops holding once its premises change: a new
  // criterion, an unsettled operation, or main moving on. Neither the plan
  // nor the closure trusts it then.
  // The parent issue's slice set changes with every other premise intact: a
  // delivered slice leaves, or another delivered one joins.
  gh.slices.delete(43);
  assert.throws(() => close(done.id), /no longer holds: the parent issue's slices are #41, #42, not the verified #41, #42, #43/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "a slice left the parent issue");
  gh.slices.add(43);
  gh.issues.set(44, { state: "closed", title: "slice 44", body: "" });
  gh.pulls.set(144, { number: 144, state: "MERGED", isDraft: false, head: h43a, branch: "feat/44-delta", base: "main", mergeable: "UNKNOWN", mergeState: "UNKNOWN", mergeCommit: originMain(dst), closes: [44], checks: [] });
  gh.slices.add(44);
  assert.throws(() => close(done.id), /no longer holds: the parent issue's slices are #41, #42, #43, #44, not the verified #41, #42, #43/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "a delivered slice joined the parent issue");
  gh.slices.delete(44);
  gh.pulls.delete(144);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, true);
  const body = gh.issues.get(ISSUE).body;
  gh.issues.get(ISSUE).body = body.replace("## Additional context", "- [ ] A criterion added after the verification.\n\n## Additional context");
  assert.throws(() => close(done.id), /no longer holds: the parent issue's acceptance criteria changed/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "a new criterion");
  // Prose added inside the section changes no checkbox, but it is still a
  // change to what the parent issue requires.
  gh.issues.get(ISSUE).body = body.replace("- [ ] Each slice merges", "Every criterion holds on Windows and Linux alike.\n\n- [ ] Each slice merges");
  assert.deepEqual(ig.parseCriteria(gh.issues.get(ISSUE).body).map((c) => c.text), criteria);
  assert.throws(() => close(done.id), /no longer holds: the parent issue's acceptance criteria changed/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "prose added to the acceptance section");
  gh.issues.get(ISSUE).body = body;
  const late = change((r) => cp.intent(r, { kind: "merge", ticket: 43, pr: 143, expectHead: h43c, evidence: "a probe recorded after the verification" }), dstRecord, "local_dst");
  assert.throws(() => close(done.id), new RegExp(`no longer holds: merge ${late.id} of PR #143 is unsettled`));
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "an unsettled operation");
  change((r) => cp.outcome(r, { id: late.id, state: "failed", evidence: "a probe operation, never run" }), dstRecord, "local_dst");
  advanceMain("revert.txt", "a later change on main\n", "revert: a later change on main");
  assert.throws(() => close(done.id), /no longer holds: origin\/main is [0-9a-f]{40}, not the verified/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "main moved on");
  let final = verify(doneEvidence);
  trace("final-report", final.report);
  assert.equal(final.verdict, "complete");
  assert.match(final.report, /\| #41 \| delivered \| #141 \| merged by the coordinator as `[0-9a-f]{9}`; independently reviewed through `[0-9a-f]{9}` plus 4 clean merges of main \|/);
  assert.match(final.report, /\| #42 \| delivered \| #142 \| .*; it landed on main `[0-9a-f]{9}`, while its CI covered main `[0-9a-f]{9}`, so CI never ran on that combination before main's own run \|/, "a merge that landed on a main CI never checked is named");
  assert.match(final.report, new RegExp(`#42, PR #142: decision \`${decided.id}\` .* accepted \`${h42[3].slice(0, 9)}\\.\\.${correction.slice(0, 9)}\` \\(1 commit\\) unreviewed on head \`${correction.slice(0, 9)}\`; that head merged`));
  assert.match(final.report, new RegExp(`\\| #43 \\| delivered \\| #143 \\| merged by the coordinator as \`[0-9a-f]{9}\`; independently reviewed through \`${h43c.slice(0, 9)}\`; it landed on main \`[0-9a-f]{9}\`, while its CI covered main \`[0-9a-f]{9}\`, so CI never ran on that combination before main's own run \\|`), "the merge the previous coordinator made through the gate, confirmed from GitHub after the takeover with where it landed");
  // A slice merged without this run's gate (by the maintainer) is reported
  // as such, never as reviewed or accepted by the gate.
  const withoutGate = { ...run.readRecord(dstRecord), operations: [] };
  assert.match(ig.finalReport(withoutGate, snapshotNow(dst), run.readRecord(dstRecord).verifications.at(-1)), /\| #41 \| delivered \| #141 \| merged as `[0-9a-f]{9}` outside this run's merge gate/);
  // Once tickets live apart the report is on the internal issue, where a
  // bare #141 names a ticket: its pull requests name the code repository,
  // its tickets stay bare, and its decision links go to the ticket's thread.
  const splitReport = ig.finalReport({ ...run.readRecord(dstRecord), ticketsRepository: INTERNAL }, snapshotNow(dst), run.readRecord(dstRecord).verifications.at(-1));
  assert.match(splitReport, new RegExp(`\\| #41 \\| delivered \\| ${REPO}#141 \\|`));
  assert.match(splitReport, new RegExp(`#42, PR ${REPO}#142: decision \`${decided.id}\` \\(\\[comment\\]\\(https://github\\.com/${INTERNAL}/issues/42#issuecomment-${posted.id}\\)\\)`));
  assert.ok(!/\| #14\d \||PR #14\d/.test(splitReport.split("### Acceptance criteria")[0]), "no pull request the report itself names is left as a bare number; the coordinator's evidence stays as written");
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, true);
  // Closing: the report is posted and read back, then the issue is closed. A
  // close whose answer is lost may still land, so it is uncertain and holds
  // the next attempt until reconciled; GitHub's own refusal is a failure.
  assert.throws(() => close(final.id, { takeSnapshot: () => ({ ...snapshotNow(dst), repository: "acme/other" }) }), /another repository or parent issue/);
  // Ownership is read from the state branch as the last step before the close
  // call; a takeover there stops it.
  const disownedClose = close(final.id, { afterIntent: () => cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }), ownership: () => ["issue #40 has been taken over: checkpoint 99 names coordinator local_other"] });
  assert.deepEqual([disownedClose.closed, disownedClose.state, gh.closeCalls ?? 0, gh.issues.get(ISSUE).state], [false, "failed", 0, "open"], disownedClose.evidence);
  assert.match(disownedClose.evidence, /not run: issue #40 has been taken over/);
  final = verify(doneEvidence);
  // Main moves while the closure's intent is saved: the verification is
  // checked again after the save, and nothing is posted or closed.
  const closeCallsBefore = gh.closeCalls ?? 0, reportsBefore = gh.comments.get(ISSUE).length;
  const racing = close(final.id, { afterIntent: () => { advanceMain("late.txt", "lands during the closure\n", "feat: a PR merged during the closure"); cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); } });
  assert.deepEqual([racing.closed, racing.state, gh.closeCalls ?? 0, gh.comments.get(ISSUE).length, gh.issues.get(ISSUE).state], [false, "failed", closeCallsBefore, reportsBefore, "open"], racing.evidence);
  assert.match(racing.evidence, /not run: origin\/main is [0-9a-f]{40}, not the verified/);
  final = verify(doneEvidence);
  // A slice reopened while the intent is saved: every premise is read again
  // from a fresh snapshot, so nothing is posted or closed.
  const reopened = close(final.id, { afterIntent: () => { gh.issues.get(41).state = "open"; cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); } });
  assert.deepEqual([reopened.closed, reopened.state, gh.closeCalls ?? 0, gh.comments.get(ISSUE).length], [false, "failed", closeCallsBefore, reportsBefore], reopened.evidence);
  assert.match(reopened.evidence, /not run: #41 is no longer closed with its deliverable on main/);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "a reopened slice");
  gh.issues.get(41).state = "closed";
  // Main moves during the second snapshot's slower reads, after its own fetch
  // of main, and again just after the report is posted: main is read once
  // more after the snapshot and again before the close call.
  const duringSnapshot = close(final.id, { afterIntent: () => { cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); gh.onSubIssues = () => { gh.onSubIssues = null; advanceMain("during-snapshot.txt", "lands during the snapshot\n", "feat: a PR merged during the closure's snapshot"); }; } });
  assert.deepEqual([duringSnapshot.closed, duringSnapshot.state, gh.closeCalls ?? 0, gh.comments.get(ISSUE).length], [false, "failed", closeCallsBefore, reportsBefore], duringSnapshot.evidence);
  assert.match(duringSnapshot.evidence, /not run: origin\/main moved from [0-9a-f]{40} to [0-9a-f]{40}/);
  final = verify(doneEvidence);
  const afterReport = close(final.id, { afterIntent: () => { cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); gh.onCreateComment = () => { gh.onCreateComment = null; advanceMain("after-report.txt", "lands after the report\n", "feat: a PR merged after the report was posted"); }; } });
  assert.deepEqual([afterReport.closed, afterReport.state, gh.closeCalls ?? 0, gh.issues.get(ISSUE).state], [false, "failed", closeCallsBefore, "open"], afterReport.evidence);
  assert.match(run.readRecord(dstRecord).operations.find((o) => o.id === afterReport.operation).evidence, /not run: after the report was posted in comment [0-9]+, origin\/main is [0-9a-f]{40}, not the verified/);
  final = verify(doneEvidence);
  // A criterion added while the report posts, with main unchanged: every
  // premise is checked again as the last step before the close call.
  const duringReport = close(final.id, { afterIntent: () => { cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); gh.onCreateComment = () => { gh.onCreateComment = null; gh.issues.get(ISSUE).body = body.replace("## Additional context", "- [ ] A criterion added while the report posts.\n\n## Additional context"); }; } });
  assert.deepEqual([duringReport.closed, duringReport.state, gh.closeCalls ?? 0, gh.issues.get(ISSUE).state], [false, "failed", closeCallsBefore, "open"], duringReport.evidence);
  assert.match(run.readRecord(dstRecord).operations.find((o) => o.id === duringReport.operation).evidence, /not run: after the report was posted in comment [0-9]+, the parent issue's acceptance criteria changed/);
  gh.issues.get(ISSUE).body = body;
  final = verify(doneEvidence);
  // A criterion added while the final snapshot walks the slices, after it read
  // the parent issue's body: the gate reads the parent issue's scope again after the
  // snapshot, so nothing is posted or closed.
  const reportsBeforeWalk = gh.comments.get(ISSUE).length;
  const duringWalk = close(final.id, { afterIntent: () => { cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); gh.onSubIssues = () => { gh.onSubIssues = null; gh.issues.get(ISSUE).body = body.replace("## Additional context", "- [ ] A criterion added while the snapshot walks the slices.\n\n## Additional context"); }; } });
  assert.deepEqual([duringWalk.closed, duringWalk.state, gh.closeCalls ?? 0, gh.comments.get(ISSUE).length, gh.issues.get(ISSUE).state], [false, "failed", closeCallsBefore, reportsBeforeWalk, "open"], duringWalk.evidence);
  assert.match(duringWalk.evidence, /not run: the parent issue's acceptance criteria changed during the final checks/);
  gh.issues.get(ISSUE).body = body;
  final = verify(doneEvidence);
  // Main moves while the closure looks for an earlier copy of its report: the
  // lookup comes before the final gate, whose own read of main sees the move,
  // so no report is posted.
  const reportsBeforeLookup = gh.comments.get(ISSUE).length;
  const duringLookup = close(final.id, { afterIntent: () => { cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }); gh.onComments = () => { gh.onComments = null; advanceMain("during-lookup.txt", "lands during the report lookup\n", "feat: a PR merged during the report lookup"); }; } });
  assert.deepEqual([duringLookup.closed, duringLookup.state, gh.closeCalls ?? 0, gh.comments.get(ISSUE).length, gh.issues.get(ISSUE).state], [false, "failed", closeCallsBefore, reportsBeforeLookup, "open"], duringLookup.evidence);
  assert.match(duringLookup.evidence, /not run: origin\/main is [0-9a-f]{40}, not the verified/);
  final = verify(doneEvidence);
  gh.closeFail = 1;
  gh.closeError = "HTTP 502 while closing";
  const lostClose = close(final.id, { afterIntent: () => cp.ensureSaved(dstRecord, { coordinator: "local_dst", github: statusGithub, host: DST }) });
  assert.deepEqual([lostClose.closed, lostClose.state, gh.issues.get(ISSUE).state], [false, "uncertain", "open"], lostClose.evidence);
  const pending = plan(run.readRecord(dstRecord), snapshotNow(dst));
  assert.equal(pending.complete, false, "an unsettled closure is not completion");
  assert.match(pending.remaining.join(" "), new RegExp(`Closing issue #40 \\(${lostClose.operation}\\) is uncertain: settle it with checkpoint\\.mjs reconcile-operations`));
  assert.throws(() => close(final.id), /closing issue #40 (.*) is unsettled; settle it with checkpoint.mjs reconcile-operations/, "no blind retry of an uncertain close");
  assert.deepEqual(change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow(dst) }), dstRecord, "local_dst").map((s) => [s.kind, s.state, s.retry]), [["close", "not-applied", true]]);
  gh.closeFail = 1;
  gh.closeError = "HTTP 403: Resource not accessible by integration";
  const refusedClose = close(final.id);
  assert.deepEqual([refusedClose.closed, refusedClose.state], [false, "failed"], refusedClose.evidence);
  // A close call that reports success while the parent issue reads back open is
  // not a refusal either: uncertain until reconciled.
  gh.closeSilent = 1;
  const silentClose = close(final.id);
  assert.deepEqual([silentClose.closed, silentClose.state], [false, "uncertain"], silentClose.evidence);
  assert.equal(plan(run.readRecord(dstRecord), snapshotNow(dst)).complete, false, "a close that reported success while the parent issue reads back open is not completion");
  assert.match(silentClose.evidence, /the close call returned success; the request may still land/);
  assert.throws(() => close(final.id), /closing issue #40 (.*) is unsettled; settle it with checkpoint.mjs reconcile-operations/);
  assert.deepEqual(change((r) => cp.reconcileOperations(r, { snapshot: snapshotNow(dst) }), dstRecord, "local_dst").map((s) => [s.kind, s.state]), [["close", "not-applied"]]);
  // The closure through the public command: its own wiring saves the intent
  // on the state branch before the close call.
  gh.beforeClose = () => {
    const op = run.readRecord(dstRecord).operations.filter((o) => o.kind === "close").at(-1);
    gh.closeIntentSeen = cp.fetchState(dst, "origin", REPO, ISSUE).checkpoint.operations.some((o) => o.id === op?.id && o.expectHead === op?.expectHead && o.state === "intent");
  };
  const closed = ig.main(["close-issue", "--record", dstRecord, "--coordinator", "local_dst", "--expect-revision", String(run.readRecord(dstRecord).revision), "--verification", final.id], { clientFor: () => client, gitFor: () => gitOf(dst), github: statusGithub, snapshotFor: () => () => snapshotNow(dst), scopeFor: () => () => scopeNow(dst) });
  gh.beforeClose = null;
  assert.equal(gh.closeIntentSeen, true, "the public command saved the closure's intent on the state branch before the close call");
  assert.deepEqual([closed.closed, closed.state, closed.comment.reused, gh.issues.get(ISSUE).state, closed.checkpoint?.saved], [true, "confirmed", true, "closed", true]);
  assert.equal(gh.comments.get(ISSUE).filter((c) => c.body.includes(`final report: verification ${final.id}`)).length, 1, "every retried close reuses the posted report");
  assert.throws(() => close(final.id), /already closed/);
  const status = cp.autoCheckpoint(dstRecord, { coordinator: "local_dst", transition: "the parent issue closed", github: statusGithub, host: DST });
  assert.match(statusGithub.get(status.summary.commentId).body, new RegExp(`Issue verification ${final.id} on main .*: complete\\.`), "the status comment shows the verification");
  assert.equal(cp.reconcileOperations(structuredClone(run.readRecord(dstRecord)), { snapshot: { observedAt: "now", issue: { number: ISSUE, state: "closed" }, tickets: [] } }).length, 0, "nothing is left unsettled");

  assert.equal(gh.intentsSeen.length, gh.mergeCalls.length);
  assert.deepEqual(gh.intentsSeen.filter((s) => !s.saved), [], "every merge call found its intent already on the state branch");

  console.log(`PASS: merge gate (normal, clean main merge, accepted unreviewed, stale head, changed head, conflicting main merge, failed and pending CI, skipped jobs, authority, scope, review state, protection), expected-head merges with refused and interrupted outcomes, takeover settling an uncertain merge from GitHub, dependency release, and the parent issue's verification and closure${traceDir ? `; ${traces.length} traces in ${traceDir}` : ""}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
