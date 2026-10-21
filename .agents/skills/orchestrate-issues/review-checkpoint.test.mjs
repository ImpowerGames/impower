// Exercises the review checkpoint helper through one PR's recorded review
// history: launcher journals in a scratch job directory, commits in a scratch
// Git repository, and the PR's comments, head and checks through an injected
// client. Each scenario checks the preconditions the helper enforces; the
// decisions it records are written out as a trace when
// REVIEW_CHECKPOINT_TRACE names a directory, so the reasoning they carry can
// be read and judged, which no assertion here does.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkReviewRound, checkReviewerPlace, plannedReviewerPending, recoverHandoffLock, reviewAccounting, validateReviewRecovery } from "../../../scripts/agent-handoff.mjs";
import { readRepos } from "../../repos.mjs";
import * as run from "./issue-run.mjs";
import * as rc from "./review-checkpoint.mjs";

const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "review-checkpoint-")));
console.log(`scratch: ${tmp}`);
const traceDir = process.env.REVIEW_CHECKPOINT_TRACE;
if (traceDir) fs.mkdirSync(traceDir, { recursive: true });
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();

try {
  // A scratch checkout holds the coordinator pointer, the PR's commits and,
  // beside it, the review job directory the journals live in.
  const checkout = path.join(tmp, "checkout");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  const commit = (message, file = "change.txt") => {
    fs.appendFileSync(path.join(checkout, file), `${message}\n`);
    git(checkout, "add", file);
    git(checkout, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", message);
    return git(checkout, "rev-parse", "HEAD");
  };
  const baseCommit = commit("base");
  const c = {};
  for (const name of ["initial", "round1", "round2", "round3", "repair", "round4", "round5", "final"]) c[name] = commit(`${name} change`);
  const jobDir = path.join(`${checkout}.review-jobs`, "pr-500");

  // The run record: coordinator local_coord, ticket #42 written by local_writer.
  const artifacts = path.join(tmp, "artifacts");
  fs.mkdirSync(artifacts);
  const recordFile = path.join(artifacts, "run.json");
  const invocation = "Use orchestrate-issues for #40.";
  run.initRecord({ record: recordFile, checkout, repository: "acme/widgets", issue: 40, coordinator: "local_coord", harness: "claude", coordinatorModel: "claude-opus-5-5", coordinatorEffort: "high", invocation }, { freeBytes: 100 * 2 ** 30 });
  run.updateRecord(recordFile, { expectRevision: 1, coordinator: "local_coord" }, (r) => { r.tickets[42] = { owner: { route: "claude-desktop", model: "claude-opus-5-5", effort: "high", worktree: path.join(tmp, "wt-42"), branch: "feat/42-thing", handle: { kind: "session", id: "local_writer", host: os.hostname() }, verified: true }, pending: null, history: [], results: [] }; });
  const record = () => run.readRecord(recordFile);
  const change = (fn, coordinator = "local_coord") => run.updateRecord(recordFile, { expectRevision: record().revision, coordinator }, fn).output;

  // The PR as GitHub shows it.
  let clock = 0;
  const at = () => new Date(Date.UTC(2026, 9, 12, 0, clock++)).toISOString();
  const pull = { state: "OPEN", head: c.round3, branch: "feat/42-thing", checks: [{ name: "test-suite", state: "IN_PROGRESS" }] };
  const comments = [];
  let nextId = 1000;
  const comment = (body) => { const time = at(); const posted = { id: nextId++, created_at: time, updated_at: time, body }; comments.push(posted); return posted; };
  const client = { pull: () => structuredClone(pull), comments: () => structuredClone(comments) };
  const repo = rc.localGit(checkout, { fetch: () => {}, base: () => baseCommit });
  const evidence = () => rc.gatherEvidence({ record: record(), ticket: 42, pr: 500, client, git: repo });

  // One reviewer's launch journal, as the launcher writes it.
  const journal = (round, reviewerId, planned, { head, pending = [], completed = {}, exited = true, finished = true, plan = {}, attempt = 1 } = {}) => {
    const dir = path.join(jobDir, `round-${round}`, `launch-${reviewerId}-${attempt}`);
    fs.mkdirSync(dir, { recursive: true });
    if (!comments.some((x) => x.body.startsWith(`### Review round ${round} state`))) comment(`### Review round ${round} state\n\nplanned: ${planned.join(", ")}`);
    const launchedAt = at();
    const report = exited ? comment(`### Adversarial review — ${reviewerId}\n\nRound ${round} report on ${head}.`) : null;
    const rows = [
      { time: launchedAt, event: "coordinator", pid: 1 },
      { time: launchedAt, event: "launching", index: 0, step: reviewerId, role: "review", round, reviewerId, attempt, plannedReviewers: planned },
      { time: launchedAt, event: "running", index: 0, step: reviewerId, pid: 2, head },
      ...(exited ? [{ time: at(), event: "exited", index: 0, step: reviewerId, code: 0, signal: null }] : []),
      ...(exited ? [{ time: at(), event: "completed", index: 0, step: reviewerId, reviewerId, attempt, head, commentIds: [report.id], completedRound: round, reviewedHead: head, plannedRoundReviewers: planned, pendingReviewers: pending, completedRoundReviewers: completed, completedRoundReviews: Object.keys(completed).length }] : []),
      ...(finished ? [{ time: at(), event: "finished" }] : []),
    ];
    fs.writeFileSync(path.join(dir, "journal.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ pr: 500, journal: path.join(dir, "journal.jsonl"), steps: { [reviewerId]: { role: "review", round, reviewers: planned, reviewerId } }, ...plan }));
    return { dir, report };
  };
  const adjudicate = (report, text = "accepted and fixed") => comment(`### Adjudication of review ${report.id}\n\n${text}`);

  const traces = [];
  const trace = (name, body) => { traces.push(name); if (traceDir) fs.writeFileSync(path.join(traceDir, `${String(traces.length).padStart(2, "0")}-${name}.md`), body + "\n"); };
  // Decides through the helper, posts the comment and records its read-back.
  const decideAndPublish = (name, kind, assessment, extra = {}) => {
    const out = change((r) => rc.decide(r, { ticket: 42, kind, assessment, evidence: evidence(), now: new Date(at()), ...extra }));
    const posted = comment(out.body);
    change((r) => rc.published(r, { ticket: 42, id: out.id, comment: posted.id, readBack: out.body, head: pull.head }));
    trace(name, out.body);
    return { ...out, posted };
  };
  const findingsSoFar = () => rc.roundState(rc.readJournals(jobDir)).reports.map((r) => ({ comment: r.comment, finding: `round ${r.round} ${r.reviewerId} findings`, disposition: "accepted" }));
  const assess = (more = {}) => ({
    mechanisms: "test", regressions: "test", repairOptions: "test", residualRisk: "test", coverage: "test", nextRoundValue: "test", rationale: "test", next: "test",
    agreedBehavior: "preserved", architecture: "unchanged", findings: findingsSoFar(), ...more,
  });

  // Rounds 1 and 2: no formal checkpoint before round 3.
  adjudicate(journal(1, "undirected", ["undirected"], { head: c.initial, completed: { undirected: 1 } }).report);
  adjudicate(journal(2, "undirected", ["undirected"], { head: c.round1, completed: { undirected: 1 } }).report);
  pull.head = c.round2;
  let e = evidence();
  assert.equal(e.completedRound, 2);
  assert.ok(e.blockers.some((b) => /first formal checkpoint follows round 3/.test(b)), e.blockers.join("; "));
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "maintainer", assessment: assess({ question: "q" }), evidence: e })), /No formal checkpoint before round 3/);

  // Round 3 plans two reviewers. With only the first complete, the round
  // still plans the second; with the second launched but not exited, its
  // launcher may still run; once both exit, an unadjudicated report holds
  // the checkpoint; a failed check holds it too.
  const corrections3 = journal(3, "corrections", ["corrections", "undirected"], { head: c.round2, pending: ["undirected"], completed: { corrections: 1 } });
  adjudicate(corrections3.report);
  e = evidence();
  assert.ok(e.blockers.some((b) => /round 3 still plans undirected/.test(b)), e.blockers.join("; "));
  // A maintainer question may be asked before the checkpoint is due, and it
  // then says what is incomplete instead of claiming the gates passed.
  const early = rc.decide(structuredClone(record()), { ticket: 42, kind: "maintainer", assessment: assess({ question: "Should round 3 stop here?" }), evidence: e });
  assert.match(early.body, /no checkpoint is due, so this question reaches the maintainer before the review gates hold: round 3 still plans undirected/);
  assert.doesNotMatch(early.body, /round 3 is complete/);
  const running3 = journal(3, "undirected", ["corrections", "undirected"], { head: c.round2, exited: false, finished: false });
  e = evidence();
  assert.ok(e.blockers.some((b) => /launcher has not finished/.test(b)) && e.blockers.some((b) => /has no exited row/.test(b)), e.blockers.join("; "));
  assert.equal(e.due, false);
  fs.rmSync(running3.dir, { recursive: true });
  const undirected3 = journal(3, "undirected", ["corrections", "undirected"], { head: c.round2, pending: [], completed: { corrections: 1, undirected: 1 } });
  pull.head = c.round3;
  e = evidence();
  assert.ok(e.blockers.some((b) => new RegExp(`report ${undirected3.report.id} .* has no adjudication`).test(b)), e.blockers.join("; "));
  adjudicate(undirected3.report);
  pull.checks = [{ name: "test-suite", state: "FAILURE" }];
  assert.ok(evidence().blockers.some((b) => /CI failed on/.test(b)));
  pull.checks = [{ name: "test-suite", state: "IN_PROGRESS" }];
  e = evidence();
  assert.deepEqual(e.blockers, []);
  assert.equal(e.due, true, "the first checkpoint is due once round 3's reviewers exited, every report is adjudicated and CI has not failed");
  assert.equal(e.reviewedHead, c.round2);
  assert.deepEqual(e.range.commits.map((x) => x.sha), [c.round3]);
  assert.ok(Date.parse(e.lastExit) < Date.parse(e.lastAdjudication), "the reviewers exited before the last adjudication");

  // The checkpoint answers every assessment question and lists every report.
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "repair", assessment: { ...assess(), mechanisms: " " }, evidence: e })), /lacks mechanisms/);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "repair", assessment: assess({ findings: findingsSoFar().slice(1), scope: "s", verificationChange: "v" }), evidence: e })), /omit report/);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "extend", assessment: assess({ limit: 4, limitReason: "r" }), evidence: e }), "local_writer"), /coordinated by local_coord/, "a writer cannot record a decision in the coordinator's record");

  // Scenario: repeated defects with a shared mechanism. Rounds 1 to 3 each
  // found another way existing work lost its place; the coordinator directs
  // the root-cause repair instead of a fourth round on the latest instance.
  const repair = decideAndPublish("round-3-repair-shared-mechanism", "repair", assess({
    mechanisms: "Rounds 1 to 3 found four defects, three of them one class: existing work whose writer the record has not settled loses its place in capacity (a draft PR, a ready PR, a closed ticket's worktree). Each correction added a condition at the call site that hit it.",
    regressions: "No correction broke an earlier behavior; each fixed only the instance reported, so the class is still open at the sites not yet reported.",
    repairOptions: "One predicate, writerKnownEnded, decides whether existing work still holds a place, and every planning branch consults it. A scan of planDispatch finds two branches that still decide this inline; both are covered by the repair.",
    residualRisk: "A sixth shape of the same class in a branch that does not consult the predicate.",
    coverage: "The scenario harness gains one regression per branch, each red on the current head.",
    nextRoundValue: "Another round now would most likely find the next instance of the same class rather than establish anything about the design.",
    rationale: "Patching each instance has not converged; the mechanism is in one place, and the repair keeps the agreed admission behavior.",
    next: "The writer replaces the inline checks with the predicate, adds the regressions, verifies, and reports; the coordinator then reassesses at this round.",
    scope: "planDispatch's existing-work branches in issue-run.mjs and their scenario tests; no change to admission rules.",
    verificationChange: "Two new regressions, one per inline branch, each red before the repair.",
  }));
  assert.equal(record().tickets[42].checkpoints.at(-1).state, "published");
  assert.equal(record().tickets[42].checkpoints.at(-1).round, 3, "a repair keeps the round count");

  // The repair is verified and pushed; the coordinator reassesses at the same
  // round and authorizes round 4. Its fields satisfy the launcher.
  pull.head = c.repair;
  e = evidence();
  assert.equal(e.completedRound, 3);
  assert.deepEqual(e.range.commits.map((x) => x.sha), [c.round3, c.repair]);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "extend", assessment: assess({ limit: 3, limitReason: "r" }), evidence: e })), /must exceed the completed round 3/);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "extend", assessment: assess({ limit: 11, limitReason: "r" }), evidence: e })), /within 10/);
  const ext4 = decideAndPublish("round-3-extend-after-repair", "extend", assess({
    mechanisms: "The repair moved every existing-work branch onto writerKnownEnded; the class found in rounds 1 to 3 now has one decision point.",
    regressions: "The repair's two regressions were red before it and are green after; the full harness stays green.",
    repairOptions: "None simpler: the predicate is the single place the decision lives.",
    residualRisk: "The repair is unreviewed and touches every planning branch; a mistake there would affect admission broadly.",
    coverage: "Scenario harness, the two new regressions, and the regression check on the head.",
    nextRoundValue: "An undirected reviewer on the repair can establish that the predicate's single use did not change admission for any other branch, which the tests cover only by example.",
    rationale: "A broad change to one decision point deserves one independent round; the defect class itself no longer recurs.",
    next: "The writer runs round 4 with one undirected reviewer under these launcher fields.",
    limit: 4, limitReason: "One round reviews the repair; a further round needs its own checkpoint.",
  }));
  const ext4Record = record().tickets[42].checkpoints.at(-1);
  assert.deepEqual([ext4Record.limit, ext4Record.authority], [4, invocation]);
  assert.match(ext4.body, /`reviewRoundLimit` 4 and `extendedReviewAuthorization` set to the invocation quoted above/);
  assert.doesNotThrow(() => validateReviewRecovery({ reviewRoundLimit: ext4Record.limit, extendedReviewAuthorization: ext4Record.authority, completedReviewRound: 3, reviewedHead: c.round2, finalCorrections: true, completedRoundReviews: 2, completedRoundReviewers: { corrections: 1, undirected: 1 }, plannedRoundReviewers: ["corrections", "undirected"] }));

  // Scenario: correction-induced instability. Round 4's reviewer finds that
  // round 3's correction broke release of a container's writer.
  const round4 = journal(4, "undirected", ["undirected"], { head: c.repair, completed: { undirected: 1 }, plan: { reviewRoundLimit: 4, extendedReviewAuthorization: invocation } });
  adjudicate(round4.report);
  pull.head = c.round4;
  e = evidence();
  assert.deepEqual([e.due, e.completedRound, e.audit], [true, 4, []], "round 4 ran under a published extension, and its checkpoint is due");
  decideAndPublish("round-4-extend-correction-regression", "extend", assess({
    mechanisms: "Round 4's one finding is not the earlier class: the repair's predicate is correct, but round 3's correction for containers released a writer before its sub-issues were planned.",
    regressions: "This is a defect introduced by a correction: round 3's container fix, not the repair. Its regression was red on the round-4 head and is green on the fix.",
    repairOptions: "The fix moves the release after sub-issue planning; no broader change applies, since the predicate already covers the class.",
    residualRisk: "A correction that introduced one defect may have introduced another in the same change to container handling.",
    coverage: "The new regression, the harness and the regression check; container handling has three scenarios, all green.",
    nextRoundValue: "A corrections reviewer on round 3's container change and this fix can establish whether that change hides a second defect, which is the open question this round raised.",
    rationale: "Instability introduced by a correction in one area justifies one more focused round on that area.",
    next: "The writer runs round 5 with a corrections reviewer on the container changes and the undirected reviewer last.",
    limit: 5, limitReason: "One round on the container corrections.",
  }));

  // Scenario: changed issue semantics. Round 5's reviewer argues that a
  // container's existing PR should be continued rather than held, which
  // changes the agreed admission behavior.
  const corrections5 = journal(5, "corrections", ["corrections", "undirected"], { head: c.round4, pending: ["undirected"], completed: { corrections: 1 }, plan: { reviewRoundLimit: 5, extendedReviewAuthorization: invocation } });
  adjudicate(corrections5.report);
  const undirected5 = journal(5, "undirected", ["corrections", "undirected"], { head: c.round4, pending: [], completed: { corrections: 1, undirected: 1 }, plan: { reviewRoundLimit: 5, extendedReviewAuthorization: invocation } });
  adjudicate(undirected5.report, "one finding accepted and fixed; one proposal recorded for the maintainer");
  pull.head = c.round5;
  const semantics = assess({
    mechanisms: "No new mechanism: round 5 confirmed round 4's fix and found one small defect in the fix's message, now corrected.",
    regressions: "None introduced by the round-4 fix; the corrections reviewer found none in the container changes.",
    repairOptions: "The undirected reviewer proposes continuing a container's existing PR instead of holding it, which would change the parent issue's agreed admission rule.",
    residualRisk: "None beyond the open design question.",
    coverage: "Harness and regression check green on the head.",
    nextRoundValue: "Nothing until the design question is settled.",
    rationale: "Continuing a container's PR changes agreed behavior, which is the maintainer's decision.",
    next: "Ask the maintainer; the ticket waits, independent tickets continue.",
    agreedBehavior: "changed", question: "Should a ticket that gained sub-issues keep its PR and continue it, instead of holding it until its writer is settled?",
  });
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "repair", assessment: { ...semantics, scope: "s", verificationChange: "v" }, evidence: evidence() })), /maintainer's decision/);
  decideAndPublish("round-5-maintainer-changed-semantics", "maintainer", semantics);

  // Scenario: diminishing benefit with an acceptable verified final
  // correction. The maintainer keeps the agreed rule; the writer's last
  // correction is a message fix after round 5's reviewed head.
  pull.head = c.final;
  pull.checks = [{ name: "test-suite", state: "IN_PROGRESS" }];
  const acceptance = assess({
    mechanisms: "Across five rounds, three of the seven accepted findings were one class (existing work losing its place); the round-3 repair moved it to one predicate, and rounds 4 and 5 found no further instance.",
    regressions: "One correction-induced defect (round 3's container release), fixed and confirmed by round 5's corrections reviewer; none since.",
    repairOptions: "The maintainer kept the agreed rule; no broader repair remains open.",
    residualRisk: "The final commit changes one message string in the hold reason; it is unreviewed.",
    coverage: "Its regression asserts the new message; the harness and the regression check pass on the head; every CI check passed.",
    nextRoundValue: "Another round would establish only that one message string reads correctly, which its regression already shows.",
    rationale: "The defect class converged after the repair, the last behavioral correction was independently reviewed in round 5, and the remaining change is a verified message fix.",
    next: "The coordinator marks the PR ready with this decision; any new push needs a new checkpoint.",
    verification: ["review-checkpoint and issue-run checks green on the head", "test-suite passed on the head"],
  });
  e = evidence();
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: e })), /Every CI check .* must have passed: test-suite pending/);
  pull.checks = [{ name: "test-suite", state: "SUCCESS" }, { name: "skills-checks", state: "SKIPPED" }];
  e = evidence();
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: "0".repeat(64), evidence: e })), /--inspected must be the SHA-256 of the unreviewed diff/);
  const withOpen = { ...acceptance, findings: [...acceptance.findings.slice(1), { ...acceptance.findings[0], disposition: "open" }] };
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: withOpen, inspected: e.range.diffSha256, evidence: e })), /still open; a known defect is resolved/);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: { ...acceptance, verification: [] }, inspected: e.range.diffSha256, evidence: e })), /lists the verification/);
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: { ...e, head: e.reviewedHead, range: { ...e.range, commits: [] } } })), /Nothing after .* is unreviewed/);
  const selfRecord = structuredClone(record());
  selfRecord.tickets[42].owner.handle.id = "local_coord";
  assert.throws(() => rc.decide(selfRecord, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: e }), /a writer never decides its own review checkpoint/);
  // A released writer that later coordinates the parent issue is still the
  // ticket's writer.
  const formerWriter = structuredClone(record());
  formerWriter.tickets[42].history.push({ owner: formerWriter.tickets[42].owner, released: "session archived" });
  formerWriter.tickets[42].owner = null;
  formerWriter.coordinator.session = "local_writer";
  assert.throws(() => rc.decide(formerWriter, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: e }), /local_writer wrote for #42, and is now its coordinator/);
  // A detached CLI writer is held by its process: its session is the one its
  // stream names, under that id and as the app shows it once opened, and a
  // start with no recorded outcome is known by its launch directory.
  const cliSession = "6f1e2d3c-4b5a-4968-8778-9a8b7c6d5e4f";
  const cliStream = (dir) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "out.jsonl"), `${JSON.stringify({ type: "system", subtype: "init", session_id: cliSession })}\n`); return dir; };
  const cliHeld = structuredClone(record());
  cliHeld.tickets[42].owner = { ...cliHeld.tickets[42].owner, route: "claude-cli", launchId: "c1d2e3f4", handle: { kind: "process", pid: null, host: os.hostname(), launchDir: cliStream(path.join(tmp, "cli-launch-42")) } };
  const cliPending = structuredClone(record());
  cliPending.tickets[42].owner = null;
  cliPending.tickets[42].pending = { operation: "dispatch", route: "claude-cli", launchId: "a1b2c3d4", artifactParent: path.join(tmp, "cli-pending") };
  cliStream(run.launchDirOf(cliPending.tickets[42].pending, 42));
  for (const [name, held] of [["held", cliHeld], ["pending", cliPending]]) {
    for (const session of [cliSession, `local_${cliSession}`]) {
      assert.throws(() => rc.decide({ ...held, coordinator: { ...held.coordinator, session } }, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: e }), new RegExp(`${session} wrote for #42, and is now its coordinator`), `a ${name} CLI writer's session ${session} is the ticket's writer`);
    }
    assert.ok(!rc.trustedCoordinators({ ...held, previousCoordinators: [{ session: `local_${cliSession}` }] }, 42).includes(`local_${cliSession}`), `a ${name} CLI writer's opened session is never a trusted coordinator`);
  }
  // Release keeps the session its stream named, so the writer stays known
  // once its stream is archived. A writer whose session is neither recorded
  // nor readable is unknown, which refuses the decision until writer-session
  // records it; so is one adopted by its process alone.
  const decideAs = (rec, session) => rc.decide({ ...rec, coordinator: { ...rec.coordinator, session } }, { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: e.range.diffSha256, evidence: e });
  const releasedRecord = structuredClone(cliHeld);
  run.release(releasedRecord, { ticket: 42, observations: {}, evidence: "its turn ended" });
  assert.equal(releasedRecord.tickets[42].history.at(-1).owner.sessionId, cliSession, "release keeps the session its stream named");
  const unrecorded = structuredClone(cliHeld);
  fs.renameSync(path.join(tmp, "cli-launch-42", "out.jsonl"), path.join(tmp, "cli-launch-42", "out.archived"));
  assert.throws(() => decideAs(releasedRecord, `local_${cliSession}`), new RegExp(`local_${cliSession} wrote for #42, and is now its coordinator`), "a released writer stays known after its stream is archived");
  const unknown = /#42's writer c1d2e3f4 has no recorded session and its stream .* cannot be read here, so whether its session wrote for the ticket is unknown; record its session with issue-run\.mjs writer-session --ticket 42 --writer c1d2e3f4/;
  assert.throws(() => decideAs(unrecorded, "local_coord"), unknown, "an unreadable stream is not evidence that no session wrote");
  assert.throws(() => rc.trustPredecessor(structuredClone(unrecorded), { ticket: 42, session: `local_${cliSession}`, source: "status comment" }), unknown);
  assert.throws(() => rc.trustedCoordinators(unrecorded, 42), unknown);
  run.writerSession(unrecorded, { ticket: 42, writer: "c1d2e3f4", session: cliSession, evidence: "the writer's transcript" });
  assert.throws(() => decideAs(unrecorded, `local_${cliSession}`), /wrote for #42, and is now its coordinator/, "the recorded session is the ticket's writer");
  assert.throws(() => run.writerSession(unrecorded, { ticket: 42, writer: "c1d2e3f4", session: "00000000-0000-4000-8000-000000000000", evidence: "x" }), /already recorded as session/);
  // A stream that exists but cannot be read is unknown too, never empty.
  const lockedDir = path.join(tmp, "cli-launch-locked");
  fs.mkdirSync(path.join(lockedDir, "out.jsonl"), { recursive: true });
  const locked = structuredClone(cliHeld);
  locked.tickets[42].owner.handle = { ...locked.tickets[42].owner.handle, launchDir: lockedDir };
  assert.throws(() => rc.trustedCoordinators(locked, 42), /#42's writer c1d2e3f4 has no recorded session and its stream .*out\.jsonl cannot be read here \(EISDIR\)/, "an unreadable stream is unknown, not a writer with no session");
  assert.throws(() => decideAs(locked, "local_coord"), /cannot be read here \(EISDIR\)/);
  const adoptedByProcess = structuredClone(record());
  adoptedByProcess.tickets[42].owner = { ...adoptedByProcess.tickets[42].owner, route: "claude-cli", handle: { kind: "process", pid: 4242, start: "1", host: os.hostname() } };
  assert.throws(() => decideAs(adoptedByProcess, "local_coord"), /#42's writer process 4242 has no recorded session and no stream was recorded for it.*writer-session --ticket 42 --writer 4242/);
  assert.deepEqual(e.range.commits.map((x) => x.sha), [c.round5, c.final]);
  // Posted but not yet read back, the acceptance applies nowhere: not with
  // the record, and not with that record carried over by a takeover.
  const accepted = change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", now: new Date(at()), assessment: acceptance, inspected: e.range.diffSha256, evidence: e }));
  const acceptedComment = comment(accepted.body);
  assert.equal(rc.acceptanceApplies(rc.restore(comments, { trusted: ["local_coord"], record: record() }), c.final).applies, false, "an acceptance posted but never read back does not apply");
  const takenOverMidPublish = { ...structuredClone(record()), coordinator: { session: "local_successor" }, previousCoordinators: [{ session: "local_coord" }] };
  assert.equal(rc.acceptanceApplies(rc.restore(comments, { trusted: rc.trustedCoordinators(takenOverMidPublish, 42), record: takenOverMidPublish }), c.final).applies, false, "a takeover does not turn an unread-back acceptance into an applicable one");
  change((r) => rc.published(r, { ticket: 42, id: accepted.id, comment: acceptedComment.id, readBack: accepted.body, head: pull.head }));
  trace("round-5-accept-final-correction", accepted.body);
  assert.match(accepted.body, /not ordinary readiness and not an independent review/);
  assert.match(accepted.body, new RegExp(`Independently reviewed through \`${c.round4}\``));

  // A decision is published only with a read-back that matches it, and no
  // other decision is recorded while one is unpublished.
  const pending = change((r) => rc.decide(r, { ticket: 42, kind: "finish", assessment: acceptance, evidence: evidence() }));
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "finish", assessment: acceptance, evidence: evidence() })), /is not published/);
  assert.throws(() => change((r) => rc.published(r, { ticket: 42, id: pending.id, comment: 1, readBack: pending.body.replace("round 5", "round 6"), head: pull.head })), /read-back of comment 1 differs/);
  change((r) => rc.abandon(r, { ticket: 42, id: pending.id, evidence: "never posted: the test drops it" }));

  // GitHub alone restores every decision with its exact head and range; the
  // record that published them verifies them, and only a verified
  // acceptance applies.
  const fromGitHub = rc.restore(comments, { trusted: ["local_coord"] });
  assert.deepEqual(fromGitHub.map((d) => [d.kind, d.round, d.trusted, d.verified]), [["repair", 3, true, false], ["extend", 3, true, false], ["extend", 4, true, false], ["maintainer", 5, true, false], ["accept-unreviewed", 5, true, false]]);
  const last = fromGitHub.at(-1);
  assert.deepEqual([last.head, last.reviewedHead, last.range.from, last.range.to, last.range.commits], [c.final, c.round4, c.round4, c.final, [c.round5, c.final]]);
  assert.match(rc.acceptanceApplies(fromGitHub, c.final).reason, /not verified by a run record that published it/);
  const restored = rc.restore(comments, { trusted: ["local_coord"], record: record() });
  assert.ok(restored.every((d) => d.verified));
  assert.equal(rc.acceptanceApplies(restored, c.final).applies, true);

  // A new push makes the acceptance stale; a later decision replaces it.
  const stale = rc.acceptanceApplies(restored, c.initial);
  assert.equal(stale.applies, false);
  assert.match(stale.reason, /a new push needs a new checkpoint/);
  const laterQuestion = { ...last, id: "later001", kind: "maintainer", trusted: true };
  const replaced = rc.acceptanceApplies([...restored, laterQuestion], c.final);
  assert.equal(replaced.applies, false);
  assert.match(replaced.reason, /later001 \(maintainer\) .* replaced acceptance/);
  // What withdraws what comes from the record's order; the comments only
  // verify publication. The three shapes that once defeated comment-derived
  // supersession are inert now. An edited withdrawal block the record never
  // published is not in effect, with or without a record.
  const withdrawal = { ...JSON.parse(JSON.stringify(record().tickets[42].checkpoints.find((x) => x.id === accepted.id))), id: "withdr01", kind: "maintainer" };
  for (const key of ["body", "state", "published", "bodySha256", "blockSha256"]) delete withdrawal[key];
  const editedWithdrawal = { id: 9030, created_at: at(), updated_at: at(), body: `typo fixed\n\n<!-- orchestrate-issues-checkpoint\n${JSON.stringify(withdrawal)}\n-->` };
  const afterEditAlone = rc.restore([...comments, editedWithdrawal], { trusted: ["local_coord"] });
  assert.deepEqual([afterEditAlone.at(-1).trusted, afterEditAlone.at(-1).effective], [false, false]);
  assert.match(rc.acceptanceApplies(afterEditAlone, c.final).reason, /not verified by a run record/, "without a record no acceptance applies, whatever the comments hold");
  const afterEdit = rc.restore([...comments, editedWithdrawal], { trusted: ["local_coord"], record: record(), pr: 500 });
  assert.equal(afterEdit.find((d) => d.comment === 9030).effective, false);
  assert.equal(rc.acceptanceApplies(afterEdit, c.final).applies, true, "with a record, an unrecorded block withdraws nothing");
  // A block elsewhere that copies a recorded decision's id is inert.
  const copiedId = { ...withdrawal, id: accepted.id, kind: "maintainer" };
  const copyComment = { id: 9031, created_at: at(), updated_at: undefined, body: `writer\n\n<!-- orchestrate-issues-checkpoint\n${JSON.stringify(copiedId)}\n-->` };
  copyComment.updated_at = copyComment.created_at;
  const withCopy = rc.restore([...comments, copyComment], { trusted: ["local_coord"], record: record(), pr: 500 });
  assert.deepEqual([withCopy.find((d) => d.comment === 9031).trusted, withCopy.find((d) => d.comment === 9031).effective], [false, false]);
  assert.equal(rc.acceptanceApplies(withCopy, c.final).applies, true, "a copied decision id does not withdraw the acceptance");
  // The record's list order wins over every clock: a decision later in the
  // record's list replaces the acceptance even though its own timestamp and
  // its comment are both earlier. Content and comments stay as recorded.
  const reordered = structuredClone(record());
  const list = reordered.tickets[42].checkpoints;
  const question = list.find((x) => x.kind === "maintainer" && x.state === "published");
  const acceptanceEntry = list.find((x) => x.id === accepted.id);
  assert.ok(Date.parse(question.time) < Date.parse(acceptanceEntry.time), "the question was decided earlier by the clock");
  list.splice(list.indexOf(question), 1);
  list.splice(list.indexOf(acceptanceEntry) + 1, 0, question);
  const byRecord = rc.restore(comments, { trusted: ["local_coord"], record: reordered, pr: 500 });
  assert.ok(byRecord.filter((d) => d.effective).every((d) => d.verified), "every recorded decision still verifies at its comment");
  assert.match(rc.acceptanceApplies(byRecord, c.final).reason, new RegExp(`${question.id} \\(maintainer\\) .* replaced acceptance`));
  assert.equal(rc.acceptanceApplies(rc.restore(comments, { trusted: ["local_coord"], record: record(), pr: 500 }), c.final).applies, true, "in the record's own order the acceptance is last and applies");
  // A withdrawal the record holds is in effect in the record's order: once
  // recorded, before it is read back, and after its comment's block is
  // damaged or removed or the comment deleted, none of which revives the
  // acceptance.
  const keptWithdrawals = [];
  const withdrawRecord = structuredClone(record());
  const w = rc.decide(withdrawRecord, { ticket: 42, kind: "maintainer", assessment: assess({ question: "Hold the acceptance while the maintainer looks?" }), evidence: evidence() });
  assert.match(rc.acceptanceApplies(rc.restore(comments, { trusted: ["local_coord"], record: withdrawRecord, pr: 500 }), c.final).reason, new RegExp(`${w.id} \\(maintainer\\) .* replaced acceptance`), "a withdrawal recorded but not yet read back already withdraws, by its record identity");
  const wTime = at();
  const wComment = { id: 9040, created_at: wTime, updated_at: wTime, body: w.body };
  rc.published(withdrawRecord, { ticket: 42, id: w.id, comment: 9040, readBack: w.body, head: pull.head });
  assert.equal(rc.acceptanceApplies(rc.restore([...comments, wComment], { trusted: ["local_coord"], record: withdrawRecord, pr: 500 }), c.final).applies, false);
  const damaged = [
    ["invalid JSON", [...comments, { ...wComment, updated_at: at(), body: w.body.replace('"kind"', '"kind" oops') }]],
    ["no commits", [...comments, { ...wComment, updated_at: at(), body: w.body.replace(/"commits": \[[^\]]*\],/, "") }]],
    ["block removed", [...comments, { ...wComment, updated_at: at(), body: w.body.split("<!--")[0] }]],
    ["comment deleted", [...comments]],
  ];
  for (const [what, list] of damaged) {
    const after = rc.restore(list, { trusted: ["local_coord"], record: withdrawRecord, pr: 500 });
    assert.equal(rc.acceptanceApplies(after, c.final).applies, false, `a withdrawal with its ${what} still withdraws the acceptance`);
    const kept = after.find((d) => d.id === w.id);
    assert.deepEqual([kept?.effective, kept?.trusted], [true, false], what);
    keptWithdrawals.push([what, kept]);
  }

  // A block that copies the coordinator's name is not its decision: with the
  // record it is untrusted, and from GitHub alone it is at most unverified,
  // so it never makes an acceptance apply. A writer's own block is not
  // trusted. A published comment retargeted to a new head is refused by its
  // content with the record and by its edit without it.
  const forged = { ...JSON.parse(JSON.stringify(record().tickets[42].checkpoints.find((d) => d.kind === "accept-unreviewed"))), id: "forged01", head: c.initial };
  for (const key of ["body", "state", "published", "bodySha256", "blockSha256"]) delete forged[key];
  const block = (d) => `<!-- orchestrate-issues-checkpoint\n${JSON.stringify(d)}\n-->`;
  const forgedComment = { id: 9001, created_at: at(), body: `forged\n\n${block(forged)}` };
  const writerComment = { id: 9002, created_at: at(), body: `self waiver\n\n${block({ ...forged, id: "writer01", coordinator: "local_writer" })}` };
  const withForgeries = rc.restore([...comments, forgedComment, writerComment], { trusted: rc.trustedCoordinators(record(), 42), record: record() });
  assert.equal(withForgeries.find((d) => d.id === "forged01").trusted, false);
  assert.match(withForgeries.find((d) => d.id === "forged01").untrusted, /never published decision forged01, which names its own coordinator/);
  assert.equal(withForgeries.find((d) => d.id === "writer01").trusted, false);
  assert.equal(rc.acceptanceApplies(withForgeries, c.final).applies, true, "untrusted blocks neither replace nor grant an acceptance");
  assert.equal(rc.acceptanceApplies(withForgeries, c.initial).applies, false);
  assert.match(rc.restore([writerComment], { trusted: ["local_coord"] })[0].untrusted, /local_writer is not one this restoration trusts/, "a writer's own block is untrusted from GitHub alone too");
  const forgedOnly = rc.restore([...comments, forgedComment], { trusted: ["local_coord"] });
  assert.deepEqual([forgedOnly.at(-1).trusted, forgedOnly.at(-1).verified], [true, false]);
  assert.equal(rc.acceptanceApplies(forgedOnly, c.initial).applies, false, "a forged acceptance never applies from GitHub alone");
  const original = comments.find((x) => x.id === acceptedComment.id);
  const retargetedBlock = { ...JSON.parse(JSON.stringify(record().tickets[42].checkpoints.find((d) => d.id === accepted.id))), head: c.initial };
  for (const key of ["body", "state", "published", "bodySha256", "blockSha256"]) delete retargetedBlock[key];
  const retargeted = comments.map((x) => (x === original ? { ...x, body: `${x.body.split("<!--")[0]}${block(retargetedBlock)}` } : x));
  const afterRetarget = rc.restore(retargeted, { trusted: ["local_coord"], record: record() });
  assert.match(afterRetarget.find((d) => d.comment === acceptedComment.id && !d.effective).untrusted, /holds decision [0-9a-f]* as another comment or with other content/);
  assert.match(afterRetarget.find((d) => d.id === accepted.id && d.effective).untrusted, /no longer carries exactly published decision/, "the recorded acceptance stays in effect, unverified, from the record");
  assert.equal(rc.acceptanceApplies(afterRetarget, c.initial).applies, false);
  assert.equal(rc.acceptanceApplies(afterRetarget, c.final).applies, false, "an acceptance whose comment no longer verifies it does not apply");
  const edited = comments.map((x) => (x === original ? { ...x, body: `${x.body.split("<!--")[0]}${block(retargetedBlock)}`, updated_at: at() } : x));
  assert.match(rc.restore(edited, { trusted: ["local_coord"] }).at(-1).untrusted, /was edited/);
  assert.ok(rc.restore([{ id: 9003, created_at: at(), body: "<!-- orchestrate-issues-checkpoint\n{not json\n-->" }], { trusted: ["local_coord"] })[0].malformed);

  // An unapproved round is refused: a round-6 launch with no extension, a
  // plan that sets a higher limit on its own, a restarted count, and an
  // added reviewer all show in the audit, and only a maintainer decision is
  // then recorded.
  const hidden = journal(6, "undirected", ["undirected"], { head: c.final, completed: { undirected: 1 }, plan: { reviewRoundLimit: 6, extendedReviewAuthorization: "the writer's own words" } });
  adjudicate(hidden.report);
  e = evidence();
  assert.ok(e.audit.some((v) => /round 6 launched .* no published extension/.test(v)), e.audit.join("; "));
  assert.ok(e.audit.some((v) => /sets reviewRoundLimit 6 without a published extension/.test(v)), e.audit.join("; "));
  assert.throws(() => change((r) => rc.decide(r, { ticket: 42, kind: "accept-unreviewed", assessment: { ...acceptance, findings: findingsSoFar() }, inspected: e.range?.diffSha256, evidence: e })), /No checkpoint is due .* round 6 launched/);
  fs.rmSync(path.join(jobDir, "round-6"), { recursive: true });
  const restarted = journal(1, "undirected", ["undirected"], { head: c.final, completed: { undirected: 1 }, attempt: 9 });
  assert.ok(evidence().audit.some((v) => /launched a round 1 reviewer .* after round 5 completed; a restarted count/.test(v)));
  fs.rmSync(restarted.dir, { recursive: true });
  // A complete round's reviewer relaunched on a corrected head is a new
  // round, whatever plan or attempt it claims; on the round's own head it is
  // the retry the launcher allows.
  const disguised = journal(5, "undirected", ["corrections", "undirected"], { head: c.final, pending: [], completed: { corrections: 1, undirected: 2 }, attempt: 2 });
  assert.ok(evidence().audit.some((v) => new RegExp(`launched a round 5 reviewer on ${c.final} .* after round 5 completed on ${c.round4}; a reviewer on a corrected head is a new round`).test(v)), evidence().audit.join("; "));
  fs.rmSync(disguised.dir, { recursive: true });
  const sameHead = journal(5, "undirected", ["corrections", "undirected"], { head: c.round4, pending: [], completed: { corrections: 1, undirected: 2 }, attempt: 2 });
  assert.deepEqual(evidence().audit, []);
  fs.rmSync(sameHead.dir, { recursive: true });
  const added = journal(5, "extra", ["extra"], { head: c.final, completed: { extra: 1 } });
  assert.ok(evidence().audit.some((v) => /launched reviewer extra in round 5, which planned corrections, undirected/.test(v)));
  fs.rmSync(added.dir, { recursive: true });
  assert.deepEqual(evidence().audit, []);

  // The ten-round ceiling admits no extension, and reaching it grants no
  // acceptance: the acceptance keeps its own conditions.
  const ceiling = { ...evidence(), completedRound: 10, due: true, blockers: [], audit: [] };
  assert.throws(() => rc.decide(structuredClone(record()), { ticket: 42, kind: "extend", assessment: assess({ limit: 10, limitReason: "r" }), evidence: ceiling }), /reached the 10-round ceiling/);
  assert.throws(() => rc.decide(structuredClone(record()), { ticket: 42, kind: "accept-unreviewed", assessment: acceptance, inspected: "x", evidence: { ...ceiling, checks: [{ name: "test-suite", result: "pending" }] } }), /must have passed/);
  // Journals that now show fewer rounds than a recorded decision do not
  // lower the count.
  assert.throws(() => rc.decide(structuredClone(record()), { ticket: 42, kind: "finish", assessment: acceptance, evidence: { ...ceiling, completedRound: 4 } }), /was made after round 5, but the journals now show round 4; a count never goes back/);

  // A count-form round is complete when the completions here number the
  // reviewers its step declared; a carried count alone does not stand in for
  // a reviewer whose journal, and so whose report, is elsewhere.
  const countJournal = (file, reviews, comment) => ({ file, plan: { steps: { a: { role: "review", round: 3, reviewers: 2 } } }, rows: [
    { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3 }, { time: at(), event: "running", index: 0 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, completedRound: 3, reviewedHead: c.round2, commentIds: [comment], completedRoundReviews: reviews }, { time: at(), event: "finished" }] });
  assert.ok(rc.roundState([countJournal("j", 1, 1)]).blockers.some((b) => /round 3 has 1 of its 2 planned reviewers/.test(b)));
  const carried = rc.roundState([countJournal("j2", 2, 2)]);
  assert.ok(carried.blockers.some((b) => /round 3 has 1 of its 2 planned reviewers' completions here \(its journals count 2; the others' journals are elsewhere\)/.test(b)), carried.blockers.join("; "));
  const bothHere = rc.roundState([countJournal("j1", 1, 1), countJournal("j2", 2, 2)]);
  assert.deepEqual([bothHere.blockers, bothHere.reports.map((r) => r.comment)], [[], [1, 2]]);
  // A count-form round's declared count is its plan: a later launch that
  // declares more reviewers changes it.
  const declaring = (file, reviewers, reviews, comment) => ({ file, plan: { steps: { a: { role: "review", round: 3, reviewers } } }, rows: [
    { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3 }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, completedRound: 3, reviewedHead: c.round2, commentIds: [comment], completedRoundReviews: reviews }, { time: at(), event: "finished" }] });
  const expanded = rc.roundState([declaring("k1", 1, 1, 11), declaring("k2", 2, 2, 12)]);
  assert.ok(rc.audit(expanded, []).some((v) => /k2 declares round 3's planned reviewers as 2 unnamed, but the round was planned with 1 unnamed/.test(v)), rc.audit(expanded, []).join("; "));

  // Journals and plans are found by what they hold, under any name the
  // launcher accepted: a count-form plan named review-plan.json still holds
  // its round to two reviewers, a live journal named review-log.jsonl still
  // holds the checkpoint, and a count-form journal no plan names leaves its
  // round's count unknown.
  const altJobs = path.join(tmp, "alt-jobs", "pr-7", "round-3");
  fs.mkdirSync(path.join(altJobs, "state"), { recursive: true });
  const altJournal = path.join(altJobs, "state", "review-log.jsonl");
  const altRows = [{ time: at(), event: "coordinator", pid: 1 }, { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3 }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, completedRound: 3, reviewedHead: c.round2, commentIds: [51], completedRoundReviews: 1 }, { time: at(), event: "finished" }];
  fs.writeFileSync(altJournal, altRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(altJobs, "review-plan.json"), JSON.stringify({ pr: 7, journal: altJournal, steps: { a: { role: "review", round: 3, reviewers: 2 } } }));
  const live = path.join(altJobs, "retry.log");
  fs.writeFileSync(live, [{ time: at(), event: "coordinator", pid: 3 }, { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3 }, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, head: c.round2 }].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const found = rc.readJournals(path.join(tmp, "alt-jobs", "pr-7"));
  assert.deepEqual(found.map((j) => [path.basename(j.file), Boolean(j.plan)]).sort(), [["retry.log", false], ["review-log.jsonl", true]]);
  const altState = rc.roundState(found);
  assert.ok(altState.blockers.some((b) => /retry\.log: the launcher has not finished/.test(b)), altState.blockers.join("; "));
  assert.ok(altState.blockers.some((b) => /round 3's planned reviewer count is unknown: no launcher plan here names .*retry\.log/.test(b)), altState.blockers.join("; "));
  fs.rmSync(live);
  assert.ok(rc.roundState(rc.readJournals(path.join(tmp, "alt-jobs", "pr-7"))).blockers.some((b) => /round 3 has 1 of its 2 planned reviewers' completions here/.test(b)), "a plan under another name still holds its round to its declared count");

  // A launch with a delegated execution service has ended only once that
  // service drained.
  const served = (drained) => rc.roundState([{ file: "js", plan: null, rows: [
    { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", plannedReviewers: ["a"] }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "execution-service", index: 0 },
    { time: at(), event: "exited", index: 0, executionDrained: drained }, { time: at(), event: "completed", index: 0, reviewerId: "a", completedRound: 3, reviewedHead: c.round2, commentIds: [21], plannedRoundReviewers: ["a"], pendingReviewers: [], completedRoundReviews: 1 }, { time: at(), event: "finished" }] }]);
  assert.ok(served(false).blockers.some((b) => /delegated execution service whose shutdown is not confirmed \(executionDrained false\)/.test(b)), served(false).blockers.join("; "));
  assert.ok(served(false).blockers.some((b) => /confirm-drained js/.test(b)), "the blocker names the command that records a confirmed drain");
  assert.deepEqual(served(true).blockers, []);
  // A drain confirmed after the exit row (confirm-drained, I-1395) ends the
  // launch; one recorded before the exit row does not.
  const confirmed = (rows) => rc.roundState([{ file: "js", plan: null, rows: [
    { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", plannedReviewers: ["a"] }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "execution-service", index: 0 }, ...rows,
    { time: at(), event: "completed", index: 0, reviewerId: "a", completedRound: 3, reviewedHead: c.round2, commentIds: [21], plannedRoundReviewers: ["a"], pendingReviewers: [], completedRoundReviews: 1 }, { time: at(), event: "finished" }] }]);
  assert.deepEqual(confirmed([{ time: at(), event: "exited", index: 0, executionDrained: false }, { time: at(), event: "execution-drained", index: 0 }]).blockers, [], "a confirmed drain ends the launch");
  assert.ok(confirmed([{ time: at(), event: "execution-drained", index: 0 }, { time: at(), event: "exited", index: 0, executionDrained: false }]).blockers.some((b) => /shutdown is not confirmed/.test(b)), "a confirmation before the exit row confirms nothing");

  // A block whose fields are not strings is reported as malformed; it never
  // throws while it is judged.
  const objectHead = { id: "obj00001", kind: "finish", coordinator: "local_coord", round: 3, head: { toString: null }, reviewedHead: null, range: null };
  const judged = rc.restore([{ id: 9060, created_at: at(), body: `<!-- orchestrate-issues-checkpoint\n${JSON.stringify(objectHead)}\n-->` }, ...comments], { trusted: ["local_coord"] });
  assert.equal(judged.find((d) => d.comment === 9060).malformed, "no head or reviewed head");
  assert.equal(judged.filter((d) => !d.malformed).length, comments.filter((x) => x.body.includes("orchestrate-issues-checkpoint")).length, "every other decision still restores");

  // A report the coordinator posted for a reviewer is named by the journal's
  // report-posted row, and counts like any other report.
  const posted = rc.roundState([{ file: "jp", plan: null, rows: [
    { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", plannedReviewers: ["a"] }, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, reviewerId: "a", completedRound: 3, reviewedHead: c.round2, commentIds: [], plannedRoundReviewers: ["a"], pendingReviewers: [], completedRoundReviews: 1 },
    { time: at(), event: "report-awaiting-post", index: 0 }, { time: at(), event: "report-posted", index: 0, commentId: 7777 }, { time: at(), event: "finished" }] }]);
  assert.deepEqual(posted.reports.map((r) => r.comment), [7777]);

  // A launch that reserved a slot and recorded neither a start nor an exit
  // may still run.
  const reservedOnly = rc.roundState([{ file: "jr", plan: null, rows: [{ time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3 }, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "blocked", reason: "running row failed" }] }]);
  assert.ok(reservedOnly.blockers.some((b) => /reserved a slot but recorded neither its start nor its exit/.test(b)), reservedOnly.blockers.join("; "));

  // A recovery plan that declares fewer planned reviewers neither completes
  // the round nor goes unnoticed.
  const reviewerRows = (file, reviewerId, attempt, planned, pending) => ({ file, plan: null, rows: [
    { time: at(), event: "launching", index: 0, step: reviewerId, role: "review", round: 3, reviewerId, attempt, plannedReviewers: planned }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, reviewerId, attempt, completedRound: 3, reviewedHead: c.round2, commentIds: [8000 + attempt], plannedRoundReviewers: planned, pendingReviewers: pending, completedRoundReviews: 1 }, { time: at(), event: "finished" }] });
  const shrunk = rc.roundState([reviewerRows("j1", "a", 1, ["a", "b"], ["b"]), reviewerRows("j2", "a", 2, ["a"], [])]);
  assert.ok(shrunk.blockers.some((b) => /round 3 still plans b/.test(b)), shrunk.blockers.join("; "));
  assert.deepEqual(shrunk.plannedReviewers, ["a", "b"]);
  assert.ok(rc.audit(shrunk, []).some((v) => /declares round 3's planned reviewers as a, but the round was planned with a, b/.test(v)));
  // The plan is fixed at the round's first launch: a failed first attempt
  // still holds every planned reviewer, and a recovery that names fewer
  // does not complete the round.
  const failedFirst = { file: "j0", plan: null, rows: [{ time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", attempt: 1, plannedReviewers: ["a", "b"] }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 }, { time: at(), event: "blocked", reason: "no report" }] };
  const recovered = rc.roundState([failedFirst, reviewerRows("j3", "a", 2, ["a"], [])]);
  assert.deepEqual(recovered.plannedReviewers, ["a", "b"]);
  assert.ok(recovered.blockers.some((b) => /round 3 still plans b/.test(b)), recovered.blockers.join("; "));
  assert.ok(rc.audit(recovered, []).some((v) => /declares round 3's planned reviewers as a, but the round was planned with a, b/.test(v)));

  // A later decision withdraws an earlier extension: a round launched after
  // it is unauthorized.
  const withdrawn = { startedRound: 4, launches: [{ file: "j4", round: 4, time: "2026-10-12T12:00:00.000Z", reviewerId: "u" }], completions: [], plans: [], changedPlans: [] };
  const ext = { id: "e1", kind: "extend", round: 3, limit: 4, trusted: true, effective: true, postedAt: "2026-10-12T10:00:00.000Z", decidedAt: "2026-10-12T10:00:00.000Z", publishedAt: "2026-10-12T10:00:00.000Z" };
  assert.deepEqual(rc.audit(withdrawn, [ext]), []);
  assert.ok(rc.audit(withdrawn, [ext, { id: "m1", kind: "maintainer", round: 3, trusted: true, effective: true, postedAt: "2026-10-12T11:00:00.000Z", decidedAt: "2026-10-12T11:00:00.000Z", publishedAt: "2026-10-12T11:00:00.000Z" }]).some((v) => /round 4 launched .* the decision in force then was m1 \(maintainer after round 3\)/.test(v)));
  assert.ok(rc.audit(withdrawn, [ext, { id: "m2", kind: "maintainer", round: 3, trusted: false, effective: true, untrusted: "comment 1 no longer carries exactly published decision m2", postedAt: "2026-10-12T11:00:00.000Z", decidedAt: "2026-10-12T11:00:00.000Z", publishedAt: "2026-10-12T11:00:00.000Z" }]).some((v) => /the decision in force then was m2 \(maintainer after round 3, untrusted: comment 1 no longer carries exactly published decision m2\)/.test(v)), "a recorded withdrawal whose comment was damaged still withdraws an extension");
  assert.deepEqual(rc.audit(withdrawn, [ext, { id: "m3", kind: "maintainer", round: 3, trusted: false, effective: false, untrusted: "comment 2 was edited", postedAt: "2026-10-12T11:00:00.000Z", decidedAt: "2026-10-12T11:00:00.000Z", publishedAt: "2026-10-12T11:00:00.000Z" }]), [], "a block not in effect withdraws nothing");
  // Through restoration: a hold the record made before round 4 launched
  // stays in force whatever happens to its comment, an unpublished hold read
  // back later stays in force from when it was made, and an extension counts
  // only once published before the launch.
  const T = (n) => `2026-10-14T00:00:0${n}.000Z`;
  const minimal = (decisions) => ({ coordinator: { session: "local_coord" }, previousCoordinators: [], tickets: { 42: { checkpoints: decisions } } });
  const blockOf = (d) => { const { state, published, blockSha256, ...rest } = d; return rest; };
  const recorded = (fields, comment, posted) => { const d = { version: 1, coordinator: "local_coord", issue: 40, ticket: 42, pr: 500, reviewedHead: c.round2, head: c.round3, range: null, ...fields }; return { ...d, state: comment ? "published" : "intent", ...(comment && { published: { comment, time: posted } }), blockSha256: rc.blockHash(d) }; };
  const commentFor = (d, id, posted) => ({ id, created_at: posted, updated_at: posted, body: `### decision\n\n<!-- orchestrate-issues-checkpoint\n${JSON.stringify(blockOf(d))}\n-->` });
  const launch4 = { startedRound: 4, launches: [{ file: "j4", round: 4, time: T(5), reviewerId: "u" }], completions: [], plans: [], changedPlans: [] };
  const extension = recorded({ id: "ext00001", kind: "extend", round: 3, limit: 4, authority: invocation, time: T(1) }, 801, T(2));
  const hold = recorded({ id: "hold0001", kind: "maintainer", round: 3, time: T(3) }, 802, T(4));
  const both = minimal([extension, hold]);
  const holdIn = (list, rec) => rc.audit(launch4, rc.restore(list, { trusted: ["local_coord"], record: rec, pr: 500 })).some((v) => /the decision in force then was hold0001/.test(v));
  assert.ok(holdIn([commentFor(extension, 801, T(2)), commentFor(hold, 802, T(4))], both), "the hold is in force with its comment");
  assert.ok(holdIn([commentFor(extension, 801, T(2))], both), "and still with its comment deleted");
  const lateHold = recorded({ id: "hold0001", kind: "maintainer", round: 3, time: T(3) }, 803, T(8));
  assert.ok(holdIn([commentFor(extension, 801, T(2))], minimal([extension, { ...lateHold, state: "intent", published: undefined }])), "an unpublished hold is in force from when it was made");
  assert.ok(holdIn([commentFor(extension, 801, T(2)), commentFor(lateHold, 803, T(8))], minimal([extension, lateHold])), "and still once it is read back after the launch");
  const lateExtension = recorded({ id: "ext00002", kind: "extend", round: 3, limit: 4, authority: invocation, time: T(1) }, 804, T(6));
  assert.ok(rc.audit(launch4, rc.restore([commentFor(lateExtension, 804, T(6))], { trusted: ["local_coord"], record: minimal([lateExtension]), pr: 500 })).some((v) => /before extension ext00002 was published/.test(v)), "an extension published after the launch authorizes nothing");
  assert.deepEqual(rc.audit(launch4, rc.restore([commentFor(extension, 801, T(2))], { trusted: ["local_coord"], record: minimal([extension]), pr: 500 })), [], "an extension published before the launch authorizes it");

  // A plan is recognized by its content under any filename the launcher
  // accepts, so its limit is audited.
  const namedPlans = path.join(tmp, "alt-jobs", "pr-8", "round-3");
  fs.mkdirSync(namedPlans, { recursive: true });
  const namedJournal = path.join(namedPlans, "review.log");
  fs.writeFileSync(namedJournal, [{ time: at(), event: "coordinator", pid: 1 }, { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", plannedReviewers: ["a"] }, { time: at(), event: "running", index: 0, head: c.round2 }, { time: at(), event: "exited", index: 0 },
    { time: at(), event: "completed", index: 0, reviewerId: "a", completedRound: 3, reviewedHead: c.round2, commentIds: [61], plannedRoundReviewers: ["a"], pendingReviewers: [], completedRoundReviews: 1 }, { time: at(), event: "finished" }].map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(namedPlans, "plan.data"), JSON.stringify({ pr: 8, journal: namedJournal, reviewRoundLimit: 10, extendedReviewAuthorization: "the writer's own words", steps: { a: { role: "review", round: 3, reviewers: ["a"], reviewerId: "a" } } }));
  const namedState = rc.roundState(rc.readJournals(path.join(tmp, "alt-jobs", "pr-8")));
  assert.ok(rc.audit(namedState, []).some((v) => /sets reviewRoundLimit 10 without a published extension/.test(v)), "a plan named plan.data is still audited");
  for (const [what, kept] of keptWithdrawals) assert.ok(rc.audit(withdrawn, [ext, { ...kept, postedAt: "2026-10-12T11:00:00.000Z", decidedAt: "2026-10-12T11:00:00.000Z", publishedAt: "2026-10-12T11:00:00.000Z" }]).some((v) => /round 4 launched .* the decision in force then was/.test(v)), `an extension stays withdrawn with the withdrawal's ${what}`);

  // Predecessor trust is scoped to its ticket and never trusts that
  // ticket's writers: a writer of #42 trusted as #43's predecessor counts
  // for nothing on #42.
  const twoTickets = structuredClone(record());
  twoTickets.tickets[43] = { owner: null, pending: null, history: [], results: [] };
  rc.trustPredecessor(twoTickets, { ticket: 43, session: "local_writer", source: "status comment" });
  rc.trustPredecessor(twoTickets, { ticket: 43, session: "local_other", source: "status comment" });
  assert.deepEqual([rc.trustedCoordinators(twoTickets, 42).includes("local_writer"), rc.trustedCoordinators(twoTickets, 42).includes("local_other"), rc.trustedCoordinators(twoTickets, 43).includes("local_writer")], [false, false, true]);
  // A former coordinator that also wrote for the ticket is not trusted on it.
  twoTickets.previousCoordinators = [{ session: "local_writer" }];
  assert.deepEqual([rc.trustedCoordinators(twoTickets, 42).includes("local_writer"), rc.trustedCoordinators(twoTickets, 43).includes("local_writer")], [false, true]);
  const writerExtension = { id: 9050, created_at: at(), body: `writer\n\n<!-- orchestrate-issues-checkpoint\n${JSON.stringify({ ...JSON.parse(JSON.stringify(withdrawal)), id: "wext0001", kind: "extend", round: 5, limit: 6, authority: invocation, coordinator: "local_writer" })}\n-->` };
  assert.equal(rc.restore([writerExtension], { trusted: rc.trustedCoordinators(twoTickets, 42), record: twoTickets }).at(-1).trusted, false);

  // A takeover keeps every decision, and the new coordinator trusts its
  // predecessor's; the round count and limits come back unchanged.
  const takeoverFile = path.join(artifacts, "takeover.json");
  run.initRecord({ record: takeoverFile, checkout, repository: "acme/widgets", issue: 40, coordinator: "local_next", harness: "codex", coordinatorModel: "gpt-6.1-sol", coordinatorEffort: "high", invocation, takeover: true, observations: { sessions: { local_coord: { state: "archived" } } } }, { freeBytes: 100 * 2 ** 30 });
  const next = run.readRecord(takeoverFile);
  assert.deepEqual(next.tickets[42].checkpoints.map((d) => [d.kind, d.round, d.state]), record().tickets[42].checkpoints.map((d) => [d.kind, d.round, d.state]));
  assert.deepEqual(rc.trustedCoordinators(next, 42), ["local_next", "local_coord"]);
  const resumed = rc.gatherEvidence({ record: next, ticket: 42, pr: 500, client, git: repo });
  assert.deepEqual([resumed.completedRound, resumed.limit, resumed.audit], [5, 5, []]);
  assert.equal(rc.acceptanceApplies(rc.restore(comments, { trusted: rc.trustedCoordinators(next, 42), record: next }), c.final).applies, true);

  // Every round the PR posts a state for needs its journals here, and every
  // round must be complete: a missing round, or one reviewer's missing
  // journal, is never silently dropped.
  const aside = path.join(tmp, "round-1-elsewhere");
  fs.renameSync(path.join(jobDir, "round-1"), aside);
  assert.ok(rc.gatherEvidence({ record: next, ticket: 42, pr: 500, client, git: repo }).blockers.some((b) => /posts the state of rounds 1, 6, but no journal here records their reviews/.test(b)));
  fs.renameSync(aside, path.join(jobDir, "round-1"));
  const oneAside = path.join(tmp, "corrections-3-elsewhere");
  fs.renameSync(corrections3.dir, oneAside);
  assert.ok(rc.gatherEvidence({ record: next, ticket: 42, pr: 500, client, git: repo }).blockers.some((b) => /round 3 still plans corrections/.test(b)), "an earlier round with a missing reviewer journal is incomplete");
  fs.renameSync(oneAside, corrections3.dir);

  // A successor with none of its predecessor's records names the predecessor
  // from the parent issue's status. The predecessor's decisions then count for
  // round accounting, but none is verified, so no acceptance applies until
  // the successor decides and publishes its own. A forged block naming the
  // predecessor gains nothing more, and the ticket's writer is never a
  // trusted predecessor.
  const fresh = { ...structuredClone(next), coordinator: { ...next.coordinator, session: "local_fresh" }, previousCoordinators: [] };
  delete fresh.tickets[42].checkpoints;
  const freshState = rc.roundState(rc.readJournals(jobDir));
  assert.ok(rc.audit(freshState, rc.restore(comments, { trusted: rc.trustedCoordinators(fresh, 42), record: fresh })).some((v) => /round 4 launched/.test(v)), "an unnamed predecessor's extensions authorize nothing");
  assert.throws(() => rc.trustPredecessor(structuredClone(fresh), { ticket: 42, session: "local_writer", source: "status comment" }), /wrote for #42/);
  assert.throws(() => rc.trustPredecessor(structuredClone(fresh), { ticket: 42, session: "local_fresh", source: "status comment" }), /this coordinator/);
  assert.throws(() => rc.trustPredecessor(structuredClone(fresh), { ticket: 42, session: "local_coord" }), /--source/);
  rc.trustPredecessor(fresh, { ticket: 42, session: "local_coord", source: "Issue #40 status comment naming local_coord" });
  const resumedFresh = rc.restore([...comments, forgedComment, writerComment], { trusted: rc.trustedCoordinators(fresh, 42), record: fresh });
  assert.deepEqual(resumedFresh.filter((d) => d.trusted).map((d) => [d.id === "forged01" ? "forged" : d.kind, d.verified]), [["repair", false], ["extend", false], ["extend", false], ["maintainer", false], ["accept-unreviewed", false], ["forged", false]]);
  assert.equal(resumedFresh.find((d) => d.id === "writer01").trusted, false);
  assert.deepEqual(rc.audit(freshState, resumedFresh), []);
  assert.match(rc.acceptanceApplies(rc.restore(comments, { trusted: rc.trustedCoordinators(fresh, 42), record: fresh }), c.final).reason, /decide and publish again/);
  assert.equal(rc.acceptanceApplies(resumedFresh, c.initial).applies, false, "a forged acceptance never applies");

  // A malformed block, such as a range without its commits, is reported and
  // never stops the restoration of the decisions after it.
  const noCommits = JSON.parse(JSON.stringify(retargetedBlock));
  delete noCommits.range.commits;
  const withMalformed = rc.restore([{ id: 9020, created_at: "2026-10-11T00:00:00.000Z", body: block(noCommits) }, ...comments], { trusted: ["local_coord"] });
  assert.equal(withMalformed[0].malformed, "a malformed range", "the malformed block comes first, and the decisions after it still restore");
  assert.equal(withMalformed.filter((d) => !d.malformed).length, 5);

  // The checkpoint reads its round accounting through the launcher's own
  // reader, and on the same journals it agrees with the launcher's rules on
  // planned, completed, retried and reserved reviewers.
  const launcherRows = (reviewerId, attempt, pending, completedRoundReviewers, { head = c.round2, comment } = {}) => [
    { time: at(), event: "coordinator", pid: 1 },
    { time: at(), event: "launching", index: 0, step: reviewerId, role: "review", round: 3, reviewerId, attempt, plannedReviewers: ["a", "b"], completedRound: 2 },
    { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, pid: 2, head }, { time: at(), event: "identified", index: 0, childIdentity: { pid: 2, start: "1" } },
    { time: at(), event: "exited", index: 0, code: 0, signal: null },
    { time: at(), event: "completed", index: 0, reviewerId, attempt, head, commentIds: [comment], completedRound: 3, reviewedHead: head, completedRoundReviews: Object.keys(completedRoundReviewers).length, completedRoundReviewers, plannedRoundReviewers: ["a", "b"], pendingReviewers: pending, finalCorrections: false },
    { time: at(), event: "finished" }];
  const firstA = { file: "a1", plan: null, rows: launcherRows("a", 1, ["b"], { a: 1 }, { comment: 31 }) };
  const retryA = { file: "a2", plan: null, rows: launcherRows("a", 2, ["b"], { a: 2 }, { comment: 32 }) };
  const pendingB = reviewAccounting([firstA, retryA]);
  const lastRow = retryA.rows.find((r) => r.event === "completed");
  assert.deepEqual(pendingB.recovery, { completedReviewRound: 3, reviewedHead: lastRow.reviewedHead, completedRoundReviews: lastRow.completedRoundReviews, completedRoundReviewers: lastRow.completedRoundReviewers, plannedRoundReviewers: lastRow.plannedRoundReviewers }, "the reader derives the recovery fields the launcher journals");
  assert.doesNotThrow(() => validateReviewRecovery({ ...pendingB.recovery, finalCorrections: false }));
  assert.equal(plannedReviewerPending(3, 3, pendingB.recovery.completedRoundReviews, ["a", "b"]), true, "the launcher still plans b");
  assert.ok(rc.roundState([firstA, retryA]).blockers.some((b) => /round 3 still plans b/.test(b)), "and so does the checkpoint");
  assert.doesNotThrow(() => checkReviewerPlace({ round: 3, reviewerId: "b", attempt: 1, reviewers: ["a", "b"] }, 3, pendingB.recovery.completedRoundReviewers, pendingB.recovery.plannedRoundReviewers));
  assert.throws(() => checkReviewerPlace({ round: 3, reviewerId: "a", attempt: 2, reviewers: ["a", "b"] }, 3, pendingB.recovery.completedRoundReviewers, pendingB.recovery.plannedRoundReviewers), /higher attempt/, "a retry of a needs attempt 3, as the reader's completed attempt 2 says");
  assert.throws(() => checkReviewerPlace({ round: 3, reviewerId: "c", attempt: 1, reviewers: ["a", "b", "c"] }, 3, pendingB.recovery.completedRoundReviewers, pendingB.recovery.plannedRoundReviewers), /cannot change/, "the launcher refuses an added reviewer");
  // A reviewer id that names an inherited property is read as the launcher
  // reads it.
  const inherited = (attempt, comment) => ({ file: `i${attempt}`, plan: null, rows: launcherRows("constructor", attempt, ["b"], { constructor: attempt }, { comment }).map((r) => (r.event === "launching" ? { ...r, plannedReviewers: ["constructor", "b"] } : r.event === "completed" ? { ...r, plannedRoundReviewers: ["constructor", "b"] } : r)) });
  const inheritedRecovery = reviewAccounting([inherited(1, 41), inherited(2, 42)]).recovery;
  assert.deepEqual(inheritedRecovery.completedRoundReviewers, { constructor: 2 });
  assert.doesNotThrow(() => validateReviewRecovery({ ...inheritedRecovery, finalCorrections: false }));
  assert.throws(() => checkReviewerPlace({ round: 3, reviewerId: "constructor", attempt: 2, reviewers: ["constructor", "b"] }, 3, inheritedRecovery.completedRoundReviewers, inheritedRecovery.plannedRoundReviewers), /higher attempt/);
  const doneB = { file: "b1", plan: null, rows: launcherRows("b", 1, [], { a: 2, b: 1 }, { comment: 33 }) };
  const complete = reviewAccounting([firstA, retryA, doneB]);
  assert.equal(plannedReviewerPending(3, 3, complete.recovery.completedRoundReviews, ["a", "b"]), false, "the launcher plans no further reviewer");
  assert.deepEqual(rc.roundState([firstA, retryA, doneB]).blockers, [], "and the checkpoint finds the round complete");
  const addedC = { file: "c1", plan: null, rows: launcherRows("c", 1, [], { a: 2, b: 1, c: 1 }, { comment: 34 }).map((r) => (r.event === "launching" ? { ...r, plannedReviewers: ["a", "b", "c"] } : r.event === "completed" ? { ...r, plannedRoundReviewers: ["a", "b", "c"] } : r)) };
  assert.ok(rc.audit(rc.roundState([firstA, retryA, doneB, addedC]), []).some((v) => /declares round 3's planned reviewers as a, b, c, but the round was planned with a, b/.test(v)), "the checkpoint audits the reviewer the launcher refuses");
  // Lock recovery and the checkpoint judge a launch's end from the same
  // evidence: a reservation with no start, and an undrained execution
  // service, keep both from treating the reviewer as gone; a child confirmed
  // absent lets both.
  const lockFile = git(checkout, "rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock");
  const lockJournal = path.join(tmp, "lock-journal.jsonl");
  const coordinatorIdentity = { pid: 4242, start: "100" };
  const lockWith = (rows) => {
    fs.writeFileSync(lockJournal, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    fs.writeFileSync(lockFile, JSON.stringify({ pid: coordinatorIdentity.pid, processIdentity: coordinatorIdentity, host: os.hostname(), startedAt: at(), journal: lockJournal }));
    return { file: lockJournal, plan: null, rows };
  };
  const gone = () => null;
  const opening = [{ time: at(), event: "coordinator", pid: coordinatorIdentity.pid, processIdentity: coordinatorIdentity }, { time: at(), event: "launching", index: 0, step: "a", role: "review", round: 3, reviewerId: "a", attempt: 1, plannedReviewers: ["a"] }];
  const reservedNoStart = lockWith([...opening, { time: at(), event: "reserved", index: 0 }]);
  assert.throws(() => recoverHandoffLock(checkout, { identifyProcess: gone, host: os.hostname() }), /may have spawned a child before its running row/);
  assert.ok(rc.roundState([{ ...reservedNoStart, rows: [...reservedNoStart.rows, { time: at(), event: "blocked", reason: "x" }] }]).blockers.some((b) => /reserved a slot but recorded neither/.test(b)));
  const undrained = lockWith([...opening, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, pid: 4343, head: c.round2 }, { time: at(), event: "execution-service", index: 0, directory: "x" }, { time: at(), event: "exited", index: 0, code: 0, executionDrained: false }]);
  assert.throws(() => recoverHandoffLock(checkout, { identifyProcess: gone, host: os.hostname() }), /delegated execution service/);
  assert.ok(rc.roundState([{ ...undrained, rows: [...undrained.rows, { time: at(), event: "blocked", reason: "service" }] }]).blockers.some((b) => /delegated execution service whose shutdown is not confirmed/.test(b)));
  const unconfirmed = lockWith([...opening, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, pid: 4343, head: c.round2 }, { time: at(), event: "exited", index: 0, code: 0 }, { time: at(), event: "blocked", reason: "child exit unconfirmed after the termination request" }]);
  assert.throws(() => recoverHandoffLock(checkout, { identifyProcess: gone, host: os.hostname() }), /child whose exit is unconfirmed/);
  assert.ok(rc.roundState([unconfirmed]).blockers.some((b) => /reported a child whose exit is unconfirmed/.test(b)), "the checkpoint holds a journal whose launcher reported an unconfirmed child");
  const absent = lockWith([...opening, { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, pid: 4343, head: c.round2 }, { time: at(), event: "confirmed-absent", index: 0 }]);
  assert.ok(recoverHandoffLock(checkout, { identifyProcess: gone, host: os.hostname() }).recovered, "lock recovery treats a child confirmed absent as gone");
  assert.ok(!rc.roundState([{ ...absent, rows: [...absent.rows, { time: at(), event: "blocked", reason: "absent" }] }]).blockers.some((b) => /reviewer launch/.test(b)), "and so does the checkpoint");

  // The command line runs the same path: evidence writes the diff the
  // acceptance hash binds, and acceptance-check reads the PR alone.
  // Each cutover position is pinned from its own copy of the repos file; the
  // command line runs with the switch off unless a case names the on copy.
  const committedRepos = readRepos(), INTERNAL = "acme/widgets-internal";
  const pinRepos = (cutover) => { const file = path.join(tmp, `repos-${cutover ? "on" : "off"}.json`); fs.writeFileSync(file, JSON.stringify({ ...committedRepos, code: "acme/widgets", internal: INTERNAL, cutover })); return readRepos(file); };
  const OFF = pinRepos(false), ON = pinRepos(true);
  const main = (args, repos = OFF) => rc.main(args, { clientFor: () => client, gitFor: () => repo, repos });
  const diffFile = path.join(artifacts, "unreviewed.diff");
  const printed = main(["evidence", "--record", takeoverFile, "--ticket", "42", "--pr", "500", "--diff-out", diffFile]);
  assert.equal(printed.range.diffSha256, rc.localGit(checkout, { base: () => baseCommit }).range(c.round4, c.final).diffSha256);
  assert.ok(fs.readFileSync(diffFile, "utf8").includes("final change"));
  assert.equal(main(["acceptance-check", "--record", takeoverFile, "--pr", "500"]).applies, true);
  assert.match(main(["acceptance-check", "--repo", "acme/widgets", "--checkout", checkout, "--pr", "500", "--trust", "local_coord"]).reason, /not verified by a run record that published it/);
  assert.throws(() => main(["restore", "--repo", "acme/widgets", "--checkout", checkout, "--pr", "500"]), /Name the trusted coordinators/);
  main(["trust-predecessor", "--record", takeoverFile, "--coordinator", "local_next", "--expect-revision", String(run.readRecord(takeoverFile).revision), "--ticket", "42", "--session", "local_older", "--source", "Issue #40 status comment"]);
  assert.ok(rc.trustedCoordinators(run.readRecord(takeoverFile), 42).includes("local_older"));
  assert.throws(() => main(["trust-predecessor", "--record", takeoverFile, "--coordinator", "local_next", "--expect-revision", String(run.readRecord(takeoverFile).revision), "--ticket", "42", "--session", "local_writer", "--source", "x"]), /wrote for #42/);

  // With the run's tickets apart from its code, the PR stays on the code
  // repository while its review thread is the ticket: the evidence reads the
  // reports, adjudications and decisions from the ticket's comments, the
  // decision is posted there and never on the public PR, and a restoration
  // without a record finds the thread through the switch and --ticket.
  {
    const calls = [];
    const ghRun = (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); return args[0] === "pr" ? JSON.stringify({ state: "OPEN", isDraft: true, headRefOid: "h", headRefName: "feat/42-thing", statusCheckRollup: [] }) : "[[]]"; };
    const split = { repository: "acme/widgets", ticketsRepository: INTERNAL };
    const splitClient = rc.checkpointClient(split, checkout, { run: ghRun });
    splitClient.pull(500); splitClient.comments(500, 42);
    rc.checkpointClient({ repository: "acme/widgets" }, checkout, { run: ghRun }).comments(500, 42);
    assert.deepEqual(calls, ["gh pr view 500 --repo acme/widgets --json state,isDraft,headRefOid,headRefName,statusCheckRollup", `gh api --paginate --slurp repos/${INTERNAL}/issues/42/comments`, "gh api --paginate --slurp repos/acme/widgets/issues/500/comments"]);
    assert.equal(rc.postCommand(split, 500, 42, "body.md"), `gh issue comment 42 -R ${INTERNAL} --body-file body.md`);
    assert.equal(rc.postCommand({ repository: "acme/widgets" }, 500, 42, "body.md"), "gh pr comment 500 --body-file body.md", "with one repository the decision is posted on the PR, as before");
    const asked = [];
    const onTicket = (ticketHolds) => ({ ...client, comments: (pr, ticket) => { asked.push([pr, ticket]); return ticket === 42 && ticketHolds ? structuredClone(comments) : []; } });
    const splitRecord = { ...run.readRecord(takeoverFile), ticketsRepository: INTERNAL };
    const fromTicket = rc.gatherEvidence({ record: splitRecord, ticket: 42, pr: 500, client: onTicket(true), git: repo });
    assert.deepEqual(asked, [[500, 42]], "the evidence asks for PR #500's review thread on ticket #42");
    const fromPr = rc.gatherEvidence({ record: run.readRecord(takeoverFile), ticket: 42, pr: 500, client, git: repo });
    assert.ok(fromPr.reports.length > 0 && fromPr.reports.every((r) => r.adjudication) && fromPr.decisions.length > 0, "the PR's thread holds adjudicated reports and decisions");
    assert.deepEqual([fromTicket.due, fromTicket.reports, fromTicket.decisions], [fromPr.due, fromPr.reports, fromPr.decisions], "the ticket's comments give the same reports, adjudications and decisions the PR gave with one repository");
    const prOnly = rc.gatherEvidence({ record: splitRecord, ticket: 42, pr: 500, client: onTicket(false), git: repo });
    assert.ok(prOnly.blockers.some((b) => new RegExp(`report \\d+ \\(round \\d+, [^)]+\\) is not on review thread ${INTERNAL}#42`).test(b)), prOnly.blockers.join(" | "));
    let named;
    const restored = rc.main(["restore", "--repo", "acme/widgets", "--checkout", checkout, "--pr", "500", "--ticket", "42", "--trust", "local_coord"], { repos: ON, gitFor: () => repo, clientFor: (names) => { named = names; return onTicket(true); } });
    assert.deepEqual(named, split, "without a record, the switch names the tickets repository");
    assert.ok(restored.decisions.length > 0 && asked.at(-1)[1] === 42);
  }

  // A merge after the reviewed head counts as one reviewed-elsewhere commit
  // only when its other parent is on the base; a merge of anything else is
  // shown with every commit it brings in and its whole change.
  const gitc = (...args) => git(checkout, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args);
  gitc("checkout", "-q", "-b", "upstream", c.initial);
  const upstream = commit("upstream change", "up.txt");
  gitc("checkout", "-q", "-b", "topic", c.final);
  const topic = commit("topic change", "topic.txt");
  gitc("checkout", "-q", "main");
  gitc("merge", "-q", "--no-ff", "-m", "merge the base", upstream);
  const baseMerge = git(checkout, "rev-parse", "HEAD");
  gitc("merge", "-q", "--no-ff", "-m", "merge a topic", topic);
  const topicMerge = git(checkout, "rev-parse", "HEAD");
  const merged = rc.localGit(checkout, { fetch: () => {}, base: () => upstream }).range(c.final, topicMerge);
  assert.deepEqual(merged.commits.map((x) => [x.sha, x.merge ?? null, x.via ?? null]), [[baseMerge, "base", null], [topicMerge, "other", null], [topic, null, topicMerge]]);
  assert.ok(merged.diff.includes("+topic change"), "a merged topic's change is in the inspected diff");
  assert.ok(!merged.diff.includes("+upstream change"), "a clean base merge shows only its remerge diff");
  // Git gives no remerge diff for a merge of three or more parents, so an
  // octopus merge of base branches is shown in full, correction included.
  gitc("checkout", "-q", "-b", "side-x", c.initial);
  commit("x side", "x.txt");
  gitc("checkout", "-q", "-b", "side-y", c.initial);
  commit("y side", "y.txt");
  gitc("checkout", "-q", "side-x");
  gitc("merge", "-q", "--no-ff", "-m", "base of both sides", "side-y");
  const bothSides = git(checkout, "rev-parse", "HEAD");
  gitc("checkout", "-q", "main");
  gitc("merge", "-q", "--no-ff", "--no-commit", "side-x~1", "side-y");
  fs.appendFileSync(path.join(checkout, "change.txt"), "unreviewed surprise\n");
  gitc("add", "change.txt");
  gitc("commit", "-q", "-m", "octopus with a correction");
  const octopus = git(checkout, "rev-parse", "HEAD");
  const octo = rc.localGit(checkout, { fetch: () => {}, base: () => bothSides }).range(topicMerge, octopus);
  assert.deepEqual(octo.commits.map((x) => [x.sha, x.merge ?? null]), [[octopus, "other"]]);
  assert.ok(octo.diff.includes("+unreviewed surprise"), "an octopus merge's correction is in the inspected diff");

  // Two recorded workflow scenarios from this parent issue's own run, with the
  // evidence the coordinator had at each checkpoint. In both, one mechanism
  // kept producing findings, and the recorded choice is a root-cause repair
  // or a simplification, then one bounded round, rather than another round
  // reviewing instances or an acceptance. The check records the decisions;
  // the traces carry the reasoning to be judged.
  const scenario = (number, pr) => {
    const rec = structuredClone(record());
    rec.tickets[number] = { owner: { route: "claude-desktop", model: "claude-opus-5-5", effort: "high", worktree: path.join(tmp, `wt-${number}`), branch: `feat/${number}-thing`, handle: { kind: "session", id: `local_writer_${number}`, host: os.hostname() }, verified: true }, pending: null, history: [], results: [] };
    const dir = path.join(`${checkout}.review-jobs`, `pr-${pr}`);
    const posts = [];
    const post = (body) => { const time = at(); const posted = { id: nextId++, created_at: time, updated_at: time, body }; posts.push(posted); return posted; };
    const head = { value: c.round3 };
    const scClient = { pull: () => ({ state: "OPEN", head: head.value, branch: `feat/${number}-thing`, checks: [{ name: "test-suite", state: "SUCCESS" }] }), comments: () => structuredClone(posts) };
    const findings = [];
    const round = (n, reviewedHead, counts, plan = {}) => {
      post(`### Review round ${n} state\n\nplanned: corrections, undirected`);
      const planned = ["corrections", "undirected"];
      planned.forEach((id, i) => {
        const launchDir = path.join(dir, `round-${n}`, `launch-${id}-1`);
        fs.mkdirSync(launchDir, { recursive: true });
        const report = post(`### Adversarial review — ${id}\n\nRound ${n} on ${reviewedHead}: ${counts[i]} findings.`);
        const completed = Object.fromEntries(planned.slice(0, i + 1).map((p) => [p, 1]));
        const rows = [{ time: at(), event: "coordinator", pid: 1 }, { time: at(), event: "launching", index: 0, step: id, role: "review", round: n, reviewerId: id, attempt: 1, plannedReviewers: planned },
          { time: at(), event: "reserved", index: 0 }, { time: at(), event: "running", index: 0, head: reviewedHead }, { time: at(), event: "exited", index: 0, code: 0 },
          { time: at(), event: "completed", index: 0, reviewerId: id, attempt: 1, head: reviewedHead, commentIds: [report.id], completedRound: n, reviewedHead, completedRoundReviews: i + 1, completedRoundReviewers: completed, plannedRoundReviewers: planned, pendingReviewers: planned.slice(i + 1) }, { time: at(), event: "finished" }];
        fs.writeFileSync(path.join(launchDir, "journal.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
        fs.writeFileSync(path.join(launchDir, "plan.json"), JSON.stringify({ pr, journal: path.join(launchDir, "journal.jsonl"), steps: { [id]: { role: "review", round: n, reviewers: planned, reviewerId: id } }, ...plan }));
        post(`### Adjudication of comment ${report.id}\n\nall ${counts[i]} accepted and fixed`);
        for (let k = 0; k < counts[i]; k++) findings.push({ comment: report.id, finding: `round ${n} ${id} finding ${k + 1}`, disposition: "accepted" });
        if (!counts[i]) findings.push({ comment: report.id, disposition: "none" });
      });
    };
    const decideHere = (name, kind, assessment) => {
      const out = rc.decide(rec, { ticket: number, kind, now: new Date(at()), assessment: { agreedBehavior: "preserved", architecture: "unchanged", findings: [...findings], ...assessment }, evidence: rc.gatherEvidence({ record: rec, ticket: number, pr, client: scClient, git: repo }) });
      const posted = post(out.body);
      rc.published(rec, { ticket: number, id: out.id, comment: posted.id, readBack: out.body, head: head.value });
      trace(name, out.body);
      return out;
    };
    return { rec, round, decideHere, head, evidence: () => rc.gatherEvidence({ record: rec, ticket: number, pr, client: scClient, git: repo }) };
  };

  // PR #1819's own shape, at round 3. Rounds 1 to 3 found 10, 10 and 5
  // blocking defects. About eight came from re-deriving the launcher's round
  // accounting from its journals, and round 3 still found three of them.
  const shared = scenario(44, 601);
  shared.round(1, c.initial, [5, 5]);
  shared.round(2, c.round1, [6, 4]);
  shared.round(3, c.round2, [2, 3]);
  assert.equal(shared.evidence().due, true);
  shared.decideHere("pr-1819-shape-round-3-root-cause-repair", "repair", {
    mechanisms: "Of 25 blocking findings in rounds 1 to 3, about 15 were in deciding which PR-published decisions count when writers and coordinators post under one account, and about 8 in re-deriving the launcher's round accounting from its journals: planned reviewer sets, count-form rounds, missing journals, coordinator-posted reports, reserved launches and execution drain. The journal class produced findings in every round (3, 3, 2), each fixed where it was reported.",
    regressions: "Round 1's import command introduced four of round 2's findings; round 2's supersession fix left a damaged-block instance found in round 3. Round 3's journal findings were not regressions but further instances of the same class.",
    repairOptions: "Export the launcher's own reader (launch evidence and round accounting) from scripts/agent-handoff.mjs, make lock recovery and the checkpoint both read through it, and delete the checkpoint's reimplementation. One implementation ends the class; it widens the PR into scripts/ without changing the launcher's behavior or the parent issue's.",
    residualRisk: "The repair touches the launcher; a behavior change there would affect every review. Three rules from round 3's corrections are still unreviewed.",
    coverage: "Every existing launcher test stays green, and a new regression shows the checkpoint and the launcher agree on planned, completed, retried and reserved reviewers for the same journals.",
    nextRoundValue: "Another round on the current code would most likely find the next journal-reading instance, as round 3 found three, without showing convergence; a round after the repair can establish whether the shared reader holds.",
    rationale: "Reviewing more instances of a class still producing defects is not converging; a single shared reader removes the class, so the repair comes before the next round.",
    next: "The writer implements the shared reader and its agreement regression, verifies, and reports; then round 4 reviews the repair and the unreviewed rules.",
    scope: "scripts/agent-handoff.mjs gains the exported reader; review-checkpoint.mjs consumes it and deletes its own; lock recovery reads its launch facts through it unchanged.",
    verificationChange: "All launcher tests, plus an agreement regression between the checkpoint and the launcher on the same journal sets.",
  });
  shared.head.value = c.repair;
  shared.decideHere("pr-1819-shape-round-3-extend-after-repair", "extend", {
    mechanisms: "The repair gave the checkpoint and the launcher one journal reader; the class that produced about eight findings has one implementation.",
    regressions: "Every launcher test passes on the repair; the agreement regression is red on the reimplementation's known divergences and green on the shared reader.",
    repairOptions: "None further: the trust class was already reduced in round 2 by never verifying from GitHub alone.",
    residualRisk: "The repair and round 3's three rules are unreviewed.",
    coverage: "Launcher tests, the agreement regression, the checkpoint's own check and its mutation sweep.",
    nextRoundValue: "One round can establish that the shared reader preserves the launcher's behavior and gives the checkpoint the same view.",
    rationale: "A broad repair in shared tooling deserves one independent round; the defect class itself no longer has a second implementation.",
    next: "Round 4 with a corrections reviewer on the repair and the undirected reviewer last; the count continues at 4.",
    limit: 4, limitReason: "One round reviews the repair and the unreviewed rules; a further round needs its own checkpoint.",
  });
  assert.deepEqual(shared.rec.tickets[44].checkpoints.map((d) => [d.kind, d.round, d.state]), [["repair", 3, "published"], ["extend", 3, "published"]]);

  // PR #1818's shape, at round 4. Rounds 1 to 4 found 15, 7, 5 and 8
  // findings, nearly all in one coverage inference (whether handed-off work
  // is fully pushed), whose failure mode is false assurance.
  const inferred = scenario(45, 602);
  inferred.round(1, c.initial, [9, 6]);
  inferred.round(2, c.round1, [4, 3]);
  inferred.round(3, c.round2, [3, 2]);
  inferred.head.value = c.round3;
  inferred.decideHere("pr-1818-shape-round-3-extend", "extend", {
    mechanisms: "Findings fell from 15 to 7 to 5; most sit in the inference that decides whether a source machine's work is all pushed before a handoff.",
    regressions: "None of round 3's findings was introduced by round 2's corrections.",
    repairOptions: "A simpler design that drops the inference was considered; with the count still falling, one more round on the corrections looked worth more first.",
    residualRisk: "The inference may still claim a recovery it cannot prove.",
    coverage: "Scratch-remote checks for stale updates, interrupted summaries and pending outcomes.",
    nextRoundValue: "Whether the falling count reaches the inference's remaining cases.",
    rationale: "Converging counts justify one bounded round before a redesign.",
    next: "Round 4 with corrections and undirected reviewers.",
    limit: 4, limitReason: "One round to see whether the inference converges.",
  });
  inferred.round(4, c.round3, [5, 3], { reviewRoundLimit: 4, extendedReviewAuthorization: invocation });
  inferred.head.value = c.repair;
  assert.deepEqual(inferred.evidence().audit, [], "round 4 ran under the extension decided after round 3");
  inferred.decideHere("pr-1818-shape-round-4-simplification", "repair", {
    mechanisms: "Across four rounds the findings went 15, 7, 5 and 8, and nearly all sit in one coverage inference: deciding that every unfinished change on a source machine is pushed and retrievable. The count rose again in round 4, so the inference is not converging.",
    regressions: "Round 4's findings include cases introduced by round 3's corrections to the same inference, each narrowing it further.",
    repairOptions: "Remove the inference instead of narrowing it again: report every dirty or unpushed location as possibly holding work only there. This is simpler, matches the parent issue's design, which prefers an honest limitation to a recovery claim, and keeps the agreed behavior (a handoff never claims to have recovered what it cannot prove).",
    residualRisk: "A handoff may list locations that hold nothing unique; that costs the receiving coordinator a check, not lost work.",
    coverage: "The scratch-remote checks change to assert the reported limitation for each dirty or unpushed location.",
    nextRoundValue: "Another round on the inference would find its next case, as each of the last three did; acceptance would ship a mechanism whose failure mode is false assurance.",
    rationale: "When one mechanism keeps producing findings and failing it means claiming a recovery that did not happen, a simplification that removes the claim is the root-cause repair.",
    next: "The writer removes the inference, reports the limitation, updates the checks and reports; then one round at limit 5 reviews the simplification.",
    scope: "The coverage inference in the handoff inventory and its checks.",
    verificationChange: "Checks assert that every dirty or unpushed location is reported as possibly holding work only there.",
  });
  inferred.decideHere("pr-1818-shape-round-4-extend-after-simplification", "extend", {
    mechanisms: "The simplification removed the inference that produced nearly all findings; the inventory now reports every dirty or unpushed location.",
    regressions: "The simplification deletes code rather than adding cases; the checks pass on it.",
    repairOptions: "None further.",
    residualRisk: "The simplification is unreviewed.",
    coverage: "Updated scratch-remote checks.",
    nextRoundValue: "One round can establish that the reported limitation is complete and that nothing still claims recovery.",
    rationale: "A behavior-changing simplification gets one independent round; the count continues at 5.",
    next: "Round 5 with corrections and undirected reviewers.",
    limit: 5, limitReason: "One round reviews the simplification.",
  });
  assert.deepEqual(inferred.rec.tickets[45].checkpoints.map((d) => [d.kind, d.round, d.limit ?? null]), [["extend", 3, 4], ["repair", 4, null], ["extend", 4, 5]]);

  // Ordinary review keeps its rules: no extension without recorded user
  // authorization, no automatic review of corrections after the cap, and the
  // brief still gives the writer the default three-round cap.
  assert.throws(() => validateReviewRecovery({ reviewRoundLimit: 4, completedReviewRound: 3, reviewedHead: c.round2, finalCorrections: true }), /explicit user authorization/);
  assert.throws(() => checkReviewRound(4, 3, false), /1..3/);
  assert.throws(() => checkReviewRound(3, 3, true), /require explicit user direction/);
  assert.match(fs.readFileSync(new URL("./issue-run.mjs", import.meta.url), "utf8"), /default three-round cap/);
  assert.equal(traces.length, 10);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("PASS: checkpoint timing, assessment structure, repair, extension, maintainer and acceptance gates, read-back, restoration from the PR, stale acceptance, unapproved rounds, the ten-round ceiling, takeover and ordinary review rules");
