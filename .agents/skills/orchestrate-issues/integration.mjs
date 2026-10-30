// Integration of an orchestrated parent issue. The merge gate decides whether the
// coordinator may merge one slice's PR now; the merge itself records its
// intent, calls GitHub with the expected head and reads the result back; and
// the parent issue's own acceptance criteria are verified on main before the
// coordinator closes the parent issue. GitHub stays the authority for PR state,
// heads, checks and protection: every command reads them afresh, and the run
// record keeps only the intent, the observed outcome and the evidence.
//
// The gate checks what can be checked: authority, scope, review state from
// the launcher's journals, published decisions, CI on the head, main's own CI
// and GitHub's merge state. Whether a criterion's evidence really shows it is met is the
// coordinator's judgement; the helper only refuses a criterion without any.
//
//   node .agents/skills/orchestrate-issues/integration.mjs <command> --option value ...
//
// Commands: gate, merge, criteria, verify-issue, close-issue.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../scripts/review-job-store.mjs";
import { readRepos } from "../../repos.mjs";
import { readRecord, updateRecord, branchTicket, coordinatorMerges, parseCriteria, verificationGaps, closedBeforeRun, HISTORY, takeSnapshot, readIssueScope, snapshotScope, githubClient, repositoriesOf, closingIn, prRef, qualifyPrs, completingTickets, filedActions } from "./issue-run.mjs";
import { intent, outcome, ensureSaved, autoCheckpoint, operationText, landing, landingText, fetchState, stateBranch } from "./checkpoint.mjs";
import { FIRST_CHECKPOINT_ROUND, roundState, readJournals, restore, acceptanceApplies, checkpointEvidence, trustedCoordinators, writersOf, localGit, threadName } from "./review-checkpoint.mjs";

export { parseCriteria };

// Every slice merges into main, the branch the snapshot measures delivery on.
export const TARGET = "main";
// The repository's own required gate: the Test Suite workflow's gate job,
// which passes whether its package jobs ran or were skipped. Branch
// protection and rulesets may name more; the gate reads them on every run.
export const REPOSITORY_GATES = ["test-suite"];
// The workflow whose push runs on main are the integration check: a head is
// admitted without containing the current main, so what shows the combination
// that landed is main's own run after the merge, and a red main freezes merges.
export const REPOSITORY_WORKFLOW = "Test Suite";
const MERGEABLE = new Set(["CLEAN", "HAS_HOOKS"]);
const OPEN = new Set(["intent", "uncertain"]);
const SHA = /^[0-9a-f]{40}$/;
const short = (sha) => String(sha ?? "none").slice(0, 9);
const present = (value) => typeof value === "string" && value.trim().length > 0;
const norm = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const sameCommit = (a, b) => typeof a === "string" && typeof b === "string" && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));
// A writer's report has nothing outstanding when its findings field says None
// or lists nothing.
const noneOutstanding = (findings) => (Array.isArray(findings) ? findings.length === 0 : /^none\.?$/i.test(norm(findings)));

// --- Authority ----------------------------------------------------------------

// The recorded invocation names the skill and the parent issue. Whether the user
// asked for orchestration or only discussed it is read from that quote by the
// coordinator that recorded it; a quote that names neither grants nothing.
// Once the record names a tickets repository apart from the code repository,
// the parent may also be named with the autolink prefix, as #<prefix>N or
// <prefix>N. Every form refuses a longer number, and the bare form a longer word.
export const invokes = (record, repos = readRepos()) => {
  const text = record.invocation?.text ?? "";
  if (!/orchestrate-issues/i.test(text)) return false;
  const prefix = String(repos.autolinkPrefix ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A bare <prefix>N must start a token, so FIXI-40 does not name I-40.
  const ref = repositoriesOf(record).split && prefix ? `(?:#|#${prefix}|(?<![A-Za-z0-9_])${prefix})` : "#";
  return new RegExp(`${ref}${record.issue}(?![0-9])`).test(text);
};

// --- CI -------------------------------------------------------------------------

const PASSED = new Set(["SUCCESS", "NEUTRAL"]);
const PENDING = new Set(["", "PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", "REQUESTED"]);
// Each check's latest run on the head, as passed, skipped (it did not run),
// pending or failed. Any other conclusion (cancelled, timed out, stale,
// action required) is a failure until it is diagnosed and run again.
export function classifyChecks(checks, required) {
  const when = (c) => Date.parse(c.startedAt ?? c.completedAt ?? "") || 0;
  const latest = new Map();
  for (const c of checks) {
    const key = `${c.workflow ?? ""}/${c.name}`, seen = latest.get(key);
    if (!seen || when(c) >= when(seen)) latest.set(key, c);
  }
  return [...latest.values()].map((c) => {
    const s = String(c.state ?? "").toUpperCase();
    const result = PASSED.has(s) ? "passed" : s === "SKIPPED" ? "skipped" : PENDING.has(s) ? "pending" : "failed";
    return { name: c.name, workflow: c.workflow ?? null, state: c.state ?? null, result, required: required.includes(c.name) };
  });
}
const label = (c) => (c.workflow ? `${c.workflow} / ${c.name}` : c.name);
function ciBlockers(checks, required, head) {
  const out = [];
  if (!checks.length) out.push(`no CI check has run on ${head}`);
  for (const c of checks) if (c.result === "failed") out.push(`check ${label(c)} concluded ${c.state} on ${head}`);
  const pending = checks.filter((c) => c.result === "pending");
  if (pending.length) out.push(`check${pending.length > 1 ? "s" : ""} ${pending.map(label).join(", ")} still pending on ${head}; readiness may precede CI, but a merge may not`);
  for (const name of required) {
    const runs = checks.filter((c) => c.name === name);
    if (!runs.length) out.push(`required check ${name} has not run on ${head}`);
    for (const c of runs) if (c.result === "skipped") out.push(`required check ${label(c)} was skipped on ${head}, so it did not run`);
  }
  return out;
}

// Main's own CI, from its push runs newest first. The verdict is the latest
// completed run that was not cancelled (a superseded run is cancelled by the
// workflow's concurrency and says nothing): green, red, or none when no such
// run exists or main's runs could not be read. A pending run on the newest
// main does not hold the gate; a red main does, until it is fixed or
// reverted and the next run is green.
export function mainVerdict(runs) {
  if (!Array.isArray(runs)) return { verdict: "none", reason: typeof runs === "string" ? runs : "main's workflow runs could not be read" };
  const sorted = [...runs].sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0));
  const decided = sorted.find((r) => String(r.status).toLowerCase() === "completed" && !["cancelled", "skipped"].includes(String(r.conclusion).toLowerCase()));
  if (!decided) return { verdict: "none", reason: sorted.length ? `no completed, uncancelled push run of ${REPOSITORY_WORKFLOW} on ${TARGET}` : `no push run of ${REPOSITORY_WORKFLOW} on ${TARGET}` };
  const green = PASSED.has(String(decided.conclusion).toUpperCase());
  return { verdict: green ? "green" : "red", head: decided.headSha ?? null, run: decided.id ?? null, conclusion: decided.conclusion ?? null, url: decided.url ?? null };
}

const MERGE_STATES = {
  BEHIND: "GitHub reports the branch behind main (BEHIND), so the branch protection requires an up-to-date branch; merge main into it and let CI run on the new head",
  BLOCKED: "GitHub reports the merge blocked (BLOCKED): a required review, check or rule of the branch protection is unmet, and it is never bypassed",
  DIRTY: "GitHub reports merge conflicts with main (DIRTY)",
  UNSTABLE: "GitHub reports a failing check (UNSTABLE)",
  DRAFT: "GitHub reports the PR as a draft (DRAFT)",
};
const mergeStateBlocker = (s) => MERGE_STATES[s] ?? `GitHub has not settled whether the PR can merge (${s ?? "no merge state"}); read it again shortly`;

// --- Facts and the gate -----------------------------------------------------

// Everything the gate decides on, read afresh: the PR as GitHub shows it, the
// branch's protection, the comments on the PR's review thread (the PR, or the
// ticket once tickets live apart), the review journals on this machine,
// main's own push runs, and, read last so the slower reads cannot outdate it,
// main as the remote holds it with the chain of clean main merges at the
// branch's head and the main commit the head's CI covered (the merge base of
// the head and main, which is main itself when the head contains it).
export function gatherFacts({ record, ticket, pr, client, git }) {
  const pull = client.pull(pr);
  const protection = client.protection(TARGET), comments = client.comments(pr, ticket);
  const state = roundState(readJournals(path.join(`${record.checkout}.review-jobs`, `pr-${pr}`)));
  let mainRuns;
  try { mainRuns = client.mainRuns(TARGET); } catch (error) { mainRuns = `${TARGET}'s workflow runs could not be read: ${String(error.stderr || error.message).trim().split("\n")[0]}`; }
  // Each ticket filed during the run that completes this slice's fix, as
  // GitHub shows it now; one that cannot be read is held as open.
  const filed = Object.fromEntries(completingTickets(record, ticket).map((e) => { try { return [e.number, client.issue(e.number).state]; } catch (error) { return [e.number, `unreadable (${String(error.stderr || error.message).trim().split("\n")[0]})`]; } }));
  git.fetch(pr);
  const originMain = git.main();
  const containsMain = git.isAncestor(originMain, pull.head);
  return { pull, originMain, protection, comments, state, mainRuns, filed, chain: git.cleanChain(pull.head, originMain), containsMain, ciMain: containsMain ? originMain : git.mergeBase(pull.head, originMain) };
}

// An acceptance applies to the head, or to a commit the head reaches through
// clean merges of main alone.
function acceptanceOn(decisions, chain) {
  const direct = acceptanceApplies(decisions, chain[0]);
  if (direct.applies || !direct.decision || !chain.includes(direct.decision.head)) return direct;
  const there = acceptanceApplies(decisions, direct.decision.head);
  return there.applies ? { ...there, reason: `${there.reason}; the head adds only clean merges of ${TARGET} after it` } : direct;
}

// The merge gate. It admits the PR's current head only when every condition
// holds, and otherwise names each one that fails; it never changes anything.
export function admission(record, { ticket: number, pr, snapshot, facts, git, running = null }) {
  const { pull, state, comments, originMain, chain, protection, ciMain, containsMain } = facts;
  const head = pull.head, blockers = [];
  // Authority: the invocation granted the merge, did not stop at ready, and
  // the coordinator never wrote for this ticket.
  if (record.invocation?.merging !== "coordinator") blockers.push(`the run records that the maintainer merges (merging ${record.invocation?.merging ?? "not recorded"}), so no PR of this run merges here`);
  else if (!coordinatorMerges(record)) blockers.push(`the run's recorded grant ("${record.authority?.merge}") or its quoted request ("${record.invocation?.text}") does not let the coordinator merge`);
  if (!record.checkpoints) blockers.push("checkpoints are not enabled for this run, so a merge's intent could not be saved where another machine finds it; run checkpoint.mjs enable first");
  if (!invokes(record)) blockers.push(`the recorded invocation "${record.invocation?.text ?? ""}" does not name orchestrate-issues and issue #${record.issue}; only an explicit invocation grants a merge, and discussing the skill is not one`);
  const own = record.tickets[number];
  let writers = [];
  if (own) { try { writers = writersOf(own, number); } catch (error) { writers = null; blockers.push(error.message); } }
  if (writers?.includes(record.coordinator.session)) blockers.push(`${record.coordinator.session} wrote for #${number}, and a writer never merges its own work`);
  // Scope: a sub-issue of this parent issue, and its one open PR.
  const t = snapshot.repository === record.repository && snapshot.issue?.number === record.issue ? snapshot.tickets.find((x) => x.number === number) : undefined;
  if (snapshot.repository !== record.repository || snapshot.issue?.number !== record.issue) blockers.push("the snapshot is of another repository or parent issue");
  else if (!t) blockers.push(`#${number} is not a sub-issue of issue #${record.issue} in the snapshot of ${snapshot.observedAt}`);
  else if (t.container) blockers.push(`#${number} is a container; its sub-issues merge their own PRs`);
  else if (t.deliveredBy) blockers.push(`#${number} is delivered by #${t.deliveredBy.ticket}'s PR; the merge is #${t.deliveredBy.ticket}'s`);
  else if (!t.prs.some((p) => p.number === pr)) blockers.push(`PR #${pr} is not one of #${number}'s PRs in the snapshot of ${snapshot.observedAt}`);
  else if (t.prs.filter((p) => p.state === "OPEN").length > 1) blockers.push(`#${number} has open PRs ${t.prs.filter((p) => p.state === "OPEN").map((p) => `#${p.number}`).join(", ")}; which one delivers it is the maintainer's decision`);
  if (branchTicket(pull.branch) !== number) blockers.push(`PR #${pr}'s branch ${pull.branch} is not #${number}'s`);
  // The client keeps only closing references to the tickets repository.
  const names = repositoriesOf(record), ref = names.split ? `${names.tickets}#${number}` : `#${number}`;
  if (!(pull.closes ?? []).includes(number)) blockers.push(`PR #${pr} does not close ${ref} (its body has no Closes ${ref}), so merging it would leave the ticket open`);
  // A ticket filed during the run that completes this slice's fix is
  // delivered by this PR: while it is open, the PR closes it or waits, unless
  // the maintainer accepted the narrow fix as an interim. One raised with the
  // maintainer for this slice holds the PR until their answer is recorded,
  // whatever the PR or the ticket's state says, since a closing reference
  // does not answer a decision that is theirs.
  for (const e of completingTickets(record, number)) {
    const fref = names.split ? `${names.tickets}#${e.number}` : `#${e.number}`;
    if (e.outcome.kind === "maintainer") { blockers.push(`${fref}, filed during the run, waits on the maintainer's answer to "${e.outcome.question}", and the PR holds until it is recorded (triage, or interim for an accepted narrow fix)`); continue; }
    const seen = facts.filed?.[e.number] ?? "unread";
    if (seen === "closed" || (pull.closes ?? []).includes(e.number)) continue;
    blockers.push(`${fref}, filed during the run, completes #${number}'s fix (${e.outcome.reason}) and is ${seen}, but PR #${pr} does not close it; send the PR back to its writer for the proper fix with Closes ${fref}, or record the maintainer's interim decision with issue-run.mjs interim`);
  }
  // The PR itself.
  if (pull.state !== "OPEN") blockers.push(`PR #${pr} is ${pull.state}`);
  if (pull.isDraft) blockers.push(`PR #${pr} is a draft; it merges only once marked ready`);
  if (pull.base !== TARGET) blockers.push(`PR #${pr} targets ${pull.base}, not ${TARGET}`);
  for (const op of (record.operations ?? []).filter((o) => o.pr === pr && o.kind !== "close" && OPEN.has(o.state) && o.id !== running)) blockers.push(`${operationText(op)} ${op.id} at ${op.expectHead} is ${op.state}; settle it with checkpoint.mjs reconcile-operations before any new merge`);
  // Review: every planned reviewer exited and every report is adjudicated,
  // read through the same accounting as the review checkpoints; then the
  // head is the last reviewed one, or a published acceptance covers it.
  // With the ticket's writers unknown, no decision is trusted.
  const trusted = writers === null ? [] : trustedCoordinators(record, number);
  const e = checkpointEvidence({ pr, state, pull: { ...pull, checks: [] }, comments, git, trusted, record, firstRound: 1, ci: false, ...(names.split && { where: threadName(names.thread(pr, number)) }) });
  blockers.push(...e.blockers, ...e.audit.map((a) => `review audit: ${a}`));
  const decisions = restore(comments, { trusted, record, pr });
  let disposition = null, covered = null, acceptance = null;
  if (e.reviewedHead && chain.includes(e.reviewedHead)) { disposition = "reviewed"; covered = e.reviewedHead; }
  else {
    const a = acceptanceOn(decisions, chain);
    if (a.applies) { disposition = "accepted-unreviewed"; covered = a.decision.head; acceptance = { id: a.decision.id, comment: a.decision.comment, head: a.decision.head, range: a.decision.range }; }
    else {
      const unreviewed = e.range?.commits?.length ? `; unreviewed after it: ${e.range.commits.map((c) => `${short(c.sha)} ${c.subject}`).join("; ")}` : "";
      blockers.push(`head ${head} is not the last independently reviewed head ${e.reviewedHead ?? "(none)"} or a clean merge of ${TARGET} on top of it${unreviewed}, and no acceptance covers it (${a.reason}); the writer's next review round, or a checkpoint decision on this head, settles it`);
    }
  }
  // From round 3 on, every completed round ends at the coordinator's
  // checkpoint: the PR merges only under that round's published finish or an
  // acceptance that applies, and never while a repair, an extension or a
  // question to the maintainer is the decision in force.
  const latest = decisions.filter((d) => d.effective).at(-1);
  if (latest && ["maintainer", "repair"].includes(latest.kind)) blockers.push(`decision ${latest.id} (${latest.kind} after round ${latest.round}) is in force; ${latest.kind === "maintainer" ? "the ticket waits for the maintainer's answer" : "the repair is decided again once it is verified"}, and a later checkpoint decision replaces it`);
  else if (e.completedRound >= FIRST_CHECKPOINT_ROUND && !(latest && latest.verified && latest.round === e.completedRound && ["finish", "accept-unreviewed"].includes(latest.kind))) blockers.push(`round ${e.completedRound}'s checkpoint has no published finish or acceptance decided at it${latest ? ` (the decision in force is ${latest.id}, ${latest.kind} after round ${latest.round}${latest.verified ? "" : ", not verified by this record"})` : ""}; decide it with review-checkpoint.mjs before the merge`);
  // A reviewed completion also needs the writer's final report on that head
  // with nothing outstanding: an unresolved finding or a material
  // verification gap keeps the PR from merging.
  if (disposition === "reviewed") {
    const report = [...(own?.results ?? [])].reverse().find((r) => Number(r.report?.pr) === pr)?.report;
    if (!report) blockers.push(`the run record holds no writer report for PR #${pr}; read the writer's final report and record it with issue-run.mjs result`);
    else {
      if (!sameCommit(report.reviewedHead, e.reviewedHead)) blockers.push(`the writer's report names ${report.reviewedHead} as its last reviewed commit, not ${e.reviewedHead}`);
      if (!noneOutstanding(report.findings)) blockers.push(`the writer's report lists outstanding findings or verification gaps: ${typeof report.findings === "string" ? report.findings : JSON.stringify(report.findings)}`);
    }
  }
  // CI on the current head: every check complete, none failed, and each
  // required gate run and passed.
  const required = [...new Set([...REPOSITORY_GATES, ...protection.required])];
  const checks = classifyChecks(pull.checks, required);
  blockers.push(...ciBlockers(checks, required, head));
  // Integration: GitHub's own merge state admits the head, and main's own CI
  // is not red. The head need not contain the current main: its CI covered
  // the code as of ciMain, and main's push run after the merge checks the
  // combination that lands, which the outcome and the final report name.
  const mainCi = mainVerdict(facts.mainRuns);
  if (mainCi.verdict === "red") blockers.push(`${TARGET}'s own CI is red: the latest completed push run of ${REPOSITORY_WORKFLOW} on ${TARGET} concluded ${mainCi.conclusion} at ${mainCi.head ?? "an unknown commit"}${mainCi.url ? ` (${mainCi.url})` : ""}; no merge lands on a red ${TARGET}, so fix or revert it and let its run go green first`);
  if (pull.mergeable === "CONFLICTING") blockers.push(`PR #${pr} conflicts with ${TARGET}`);
  if (!MERGEABLE.has(pull.mergeState)) blockers.push(mergeStateBlocker(pull.mergeState));
  if (protection.mergeQueue) blockers.push(`${TARGET} requires a merge queue, which this gate does not drive; the maintainer merges`);
  const unique = [...new Set(blockers)];
  return {
    ticket: number, pr, head, base: pull.base, originMain, admitted: unique.length === 0,
    disposition, reviewedHead: e.reviewedHead, completedRound: e.completedRound, ...(acceptance && { acceptance }),
    mergedSince: covered ? chain.slice(0, chain.indexOf(covered)) : [],
    ciMain, containsMain, mainCi,
    checks, required, requiredFrom: protection.source, blockers: unique,
  };
}

const gateSummary = (g) => ({ disposition: g.disposition, reviewedHead: g.reviewedHead, completedRound: g.completedRound, ...(g.acceptance && { acceptance: g.acceptance }), mergedSince: g.mergedSince, originMain: g.originMain, ciMain: g.ciMain, containsMain: g.containsMain, mainCi: g.mainCi, checks: g.checks.map(({ name, workflow, result }) => ({ name, workflow, result })) });

// --- The final gate ----------------------------------------------------------

// Whether this record's coordinator still owns the parent issue on its state
// branch, with this operation's intent saved there, read from the remote. A
// takeover, or an intent that never reached the remote, refuses the call.
export function remoteOwnership(record, opId) {
  const state = fetchState(record.checkout, record.checkpoints.remote, record.repository, record.issue, repositoriesOf(record).tickets);
  if (!state) return [`${stateBranch(record.issue)} is missing on ${record.checkpoints.remote}`];
  if (state.checkpoint.coordinator.session !== record.coordinator.session) return [`issue #${record.issue} has been taken over: checkpoint ${state.checkpoint.seq} names coordinator ${state.checkpoint.coordinator.session}`];
  if (!(state.checkpoint.operations ?? []).some((o) => o.id === opId && o.state === "intent")) return [`operation ${opId}'s intent is not on ${stateBranch(record.issue)}`];
  return [];
}

// The one sequence in front of every irreversible GitHub call, which no
// caller orders itself. It reads ownership of the parent issue and this
// operation's saved intent from the state branch, then a fresh snapshot, then
// the caller's premises on that snapshot (which may make reads of their own),
// then the parent issue's scope once more (its slices, then its acceptance
// section), then main, last; the call is made only when every read holds.
// The scope read catches a slice or criterion that changed while the snapshot
// and the premises' slower reads ran, which the snapshot alone would miss.
// `current` reads the run record as it is now. A read that fails leaves the
// call unmade. A call that throws was made and may still land, so its error
// is returned for the caller's outcome rule rather than thrown. The caller's
// call is the GitHub write alone, with any lookup it needs done before the
// gate. integration.test.mjs runs every reordering and removal of these five
// reads and requires each to fail.
export function finalGate({ current, opId, ownership, takeSnapshot, premises, readScope, git, main, call }) {
  let owned, snapshot, held, scope, now;
  try {
    owned = ownership(current(), opId);
    snapshot = takeSnapshot();
    held = premises(current(), snapshot);
    scope = readScope();
    now = (git.fetch(), git.main());
  } catch (error) { return { called: false, error }; }
  const judged = snapshotScope(snapshot);
  const moved = [
    ...(scope.slices.join() === judged.slices.join() ? [] : [`the parent issue's slices changed during the final checks, from ${judged.slices.join(", ") || "none"} to ${scope.slices.join(", ") || "none"}`]),
    ...(scope.acceptanceSha256 === judged.acceptanceSha256 ? [] : ["the parent issue's acceptance criteria changed during the final checks"]),
  ];
  const blockers = [...owned, ...held.blockers, ...moved, ...(now === main ? [] : [`origin/${TARGET} moved from ${main} to ${now}`])];
  if (blockers.length) return { called: false, blockers, held };
  try { return { called: true, value: call(), held }; }
  catch (error) { return { called: true, error, held }; }
}

// --- Merge -------------------------------------------------------------------

// Merges an admitted PR. The gate runs on a fresh snapshot and fresh facts,
// the intent is recorded and saved to the state branch, and the final gate
// reads everything again before the call, so a takeover, or a scope, head or
// main that changed while the intent was saved, stops the merge before GitHub
// is called. The call names the head the gate admitted, so a push in between
// makes GitHub refuse it. The outcome is what GitHub reads back afterwards,
// never what the call said: an unreadable or contradictory result is
// uncertain and is settled by reconcile-operations before any retry. A merge
// commit whose first parent is not the main the head's CI covered landed a
// combination CI never checked, and the outcome says so.
export function mergeAdmitted(file, { coordinator, expectRevision, ticket, pr, takeSnapshot, readScope, client, git, afterIntent, ownership = remoteOwnership }) {
  const record = readRecord(file);
  if (record.coordinator.session !== coordinator) throw new Error(`Issue #${record.issue} is coordinated by ${record.coordinator.session}; ${coordinator} may not merge for it`);
  const gate = admission(record, { ticket, pr, snapshot: takeSnapshot(), facts: gatherFacts({ record, ticket, pr, client, git }), git });
  if (!gate.admitted) return { admitted: false, merged: false, gate };
  const planned = updateRecord(file, { expectRevision, coordinator }, (r) => {
    const op = intent(r, { kind: "merge", ticket, pr, expectHead: gate.head, evidence: `admitted as ${gate.disposition}` });
    op.gate = gateSummary(gate);
    return op;
  });
  const op = planned.output;
  const notRun = (reason) => { updateRecord(file, { expectRevision: planned.record.revision, coordinator }, (r) => { outcome(r, { id: op.id, state: "failed", evidence: `not run: ${reason}` }); }); };
  try { afterIntent?.(); }
  catch (error) { notRun(error.message); throw error; }
  const final = finalGate({
    current: () => readRecord(file), opId: op.id, ownership, takeSnapshot, readScope, git, main: gate.originMain,
    premises: (rec, snapshot) => {
      const again = admission(rec, { ticket, pr, snapshot, facts: gatherFacts({ record: rec, ticket, pr, client, git }), git, running: op.id });
      const blockers = !again.admitted ? again.blockers : again.head !== gate.head ? [`the head moved from ${gate.head} to ${again.head}`] : again.originMain !== gate.originMain ? [`origin/${TARGET} moved from ${gate.originMain} to ${again.originMain}`] : [];
      return { blockers, again };
    },
    call: () => client.merge(pr, gate.head),
  });
  if (!final.called && final.error) { notRun(`the gate could not be checked again after the intent was saved: ${final.error.message}`); throw final.error; }
  if (!final.called) {
    const why = final.blockers.join("; ");
    notRun(`while the intent was saved, ${why}; run the gate again`);
    return { admitted: true, merged: false, operation: op.id, state: "failed", evidence: `not run: ${why}`, gate, recheck: final.held?.again };
  }
  const call = final.error ? { ok: false, interrupted: true, message: final.error.message } : final.value;
  let back = null, readError = null;
  try { back = client.pull(pr); } catch (error) { readError = error.message; }
  // Only GitHub's own refusal shows the request did not apply; a call that was
  // interrupted, or failed without GitHub's answer, may still land.
  const refused = !call.ok && !call.interrupted && GITHUB_REFUSAL.test(call.message ?? "");
  const said = call.ok ? "returned success" : `${refused ? "was refused by GitHub" : call.interrupted ? "was interrupted" : "failed without GitHub's answer"} (${call.message})`;
  let state, evidence, merged = null;
  if (!back) { state = "uncertain"; evidence = `the merge call ${said}, and PR #${pr} could not be read back (${readError})`; }
  else if (back.state === "MERGED" && back.head === gate.head && back.mergeCommit) {
    let onMain = null;
    try { git.fetch(); onMain = git.isAncestor(back.mergeCommit, git.main()); } catch (error) { onMain = null; readError = error.message; }
    merged = { ...landing({ gate: gateSummary(gate) }, back.mergeCommit, git.firstParent), onMain };
    state = "confirmed";
    evidence = `PR #${pr} reads back merged as ${back.mergeCommit} at ${gate.head}${onMain ? `; the merge commit is on origin/${TARGET}` : onMain === false ? `; the merge commit is not on origin/${TARGET} yet` : `; whether it is on origin/${TARGET} could not be read (${readError})`}${landingText(merged, gate.ciMain)}`;
  } else if (back.state === "MERGED") { state = "uncertain"; evidence = `PR #${pr} reads back merged at ${back.head}, not at ${gate.head}; reconcile-operations settles it`; }
  // A merge that was called is failed only on GitHub's own refusal; every
  // other result short of a confirmed merge is uncertain until reconciled.
  else if (refused) { state = "failed"; evidence = `the merge call ${said}, and PR #${pr} reads back ${back.state} at ${back.head}; nothing was merged`; }
  else { state = "uncertain"; evidence = `the merge call ${said}, and PR #${pr} reads back ${back.state} at ${back.head}; the request may still land, so reconcile-operations settles it`; }
  const settled = updateRecord(file, { expectRevision: planned.record.revision, coordinator }, (r) => { const o = outcome(r, { id: op.id, state, evidence }); if (merged) Object.assign(o, merged); });
  return { admitted: true, merged: state === "confirmed", operation: op.id, state, evidence, ...(merged ?? {}), revision: settled.record.revision, gate };
}

// --- The parent issue's acceptance -------------------------------------------------

// What the run merged, and how: through this run's gate with its
// disposition, or outside it.
function slices(record, snapshot) {
  // A delivered ticket's PR and merge are its deliverer's; its own list may
  // lack that PR once tickets live apart.
  const prOf = (t) => (t.deliveredBy?.pr ? snapshot.tickets.find((x) => x.number === t.deliveredBy.ticket)?.prs.find((p) => p.number === t.deliveredBy.pr) ?? null : null);
  return snapshot.tickets.filter((t) => !t.container).map((t) => {
    const viaDeliverer = prOf(t);
    const prs = t.deliveredBy ? (viaDeliverer ? [viaDeliverer] : []) : t.prs;
    const merged = prs.find((p) => p.state === "MERGED" && p.mergeCommit);
    const op = merged && (record.operations ?? []).find((o) => o.kind === "merge" && o.pr === merged.number && o.state === "confirmed");
    const history = !(t.state === "closed" && t.delivered) && closedBeforeRun(record, t);
    return { number: t.number, title: t.title, deliveredBy: t.deliveredBy ?? null, history, delivered: (t.state === "closed" && t.delivered) || history, pr: merged?.number ?? prs.find((p) => p.state === "OPEN")?.number ?? null, mergeCommit: merged?.mergeCommit ?? null, gate: op?.gate ?? null, operation: op?.id ?? null, baseMoved: op ? op.baseMoved ?? null : false, mergedOnto: op?.mergedOnto ?? null, state: t.state, open: prs.filter((p) => p.state === "OPEN").map((p) => p.number) };
  });
}

// Every acceptance of unreviewed corrections the record published, with
// whether its head is what merged.
function acceptances(record, snapshot) {
  const merged = new Map(snapshot.tickets.flatMap((t) => t.prs.filter((p) => p.state === "MERGED").map((p) => [p.number, p.head])));
  return Object.entries(record.tickets).flatMap(([n, t]) => (t.checkpoints ?? []).filter((d) => d.kind === "accept-unreviewed" && d.state === "published").map((d) => ({ ticket: Number(n), pr: d.pr, id: d.id, comment: d.published.comment, head: d.head, range: d.range, merged: merged.has(d.pr) ? merged.get(d.pr) : null })));
}

const REPORT_MARK = (id) => `<!-- orchestrate-issues final report: verification ${id} -->`;
export function finalReport(record, snapshot, v) {
  // A decision's comment is on its PR's review thread.
  const names = repositoriesOf(record), link = (a) => names.commentUrl(names.thread(a.pr, a.ticket), a.comment);
  const rows = slices(record, snapshot).map((s) => {
    const how = s.history ? HISTORY : !s.mergeCommit ? (s.open.length ? `open: PR ${s.open.map((p) => `#${p}`).join(", ")}` : "no merged PR")
      : !s.gate ? `merged as \`${short(s.mergeCommit)}\` outside this run's merge gate (by the maintainer or before this run merged)`
      : s.gate.disposition === "reviewed" ? `merged by the coordinator as \`${short(s.mergeCommit)}\`; independently reviewed through \`${short(s.gate.reviewedHead)}\`${s.gate.mergedSince.length ? ` plus ${s.gate.mergedSince.length} clean merge${s.gate.mergedSince.length > 1 ? "s" : ""} of ${TARGET}` : ""}`
      : `merged by the coordinator as \`${short(s.mergeCommit)}\` under acceptance \`${s.gate.acceptance.id}\`: reviewed through \`${short(s.gate.reviewedHead)}\`, \`${short(s.gate.acceptance.range?.from)}..${short(s.gate.acceptance.range?.to)}\` accepted unreviewed`;
    const landed = !s.gate ? "" : s.baseMoved ? `; it landed on ${TARGET} \`${short(s.mergedOnto)}\`, while its CI covered ${TARGET} \`${short(s.gate.ciMain ?? s.gate.originMain)}\`, so CI never ran on that combination before ${TARGET}'s own run` : s.baseMoved === null ? `; where it landed on ${TARGET} could not be read` : "";
    // The report is on the parent issue, in the tickets repository, so its pull
    // requests name the code repository once tickets live apart; the
    // criteria and their evidence stay as the coordinator wrote them.
    const by = s.deliveredBy && !s.history ? `delivered by #${s.deliveredBy.ticket}'s PR: ` : "";
    return `| #${s.number} | ${s.delivered ? "delivered" : s.state} | ${s.pr ? prRef(names, s.pr) : ""} | ${qualifyPrs(names, by + how + landed).replace(/\|/g, "/")} |`;
  });
  const accepted = acceptances(record, snapshot);
  const missing = [...v.incomplete.map((t) => `- #${t.number}: ${t.action}`), ...v.unsettled.map((o) => `- unsettled ${o}`)].map((line) => qualifyPrs(names, line));
  return [
    REPORT_MARK(v.id),
    `## Final report: issue #${record.issue}`,
    "",
    `Verdict: ${v.verdict}. Verified on ${TARGET} at \`${v.mainSha}\` at ${v.time} by coordinator \`${v.coordinator}\`, from the snapshot of ${v.snapshotAt}.`,
    "",
    "### Slices",
    "",
    "| Ticket | State | PR | Integration |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "### Accepted unreviewed corrections",
    "",
    ...(accepted.length ? accepted.map((a) => `- #${a.ticket}, PR ${prRef(names, a.pr)}: decision \`${a.id}\` ([comment](${link(a)})) accepted \`${short(a.range?.from)}..${short(a.range?.to)}\` (${a.range?.commits?.length ?? 0} commit${a.range?.commits?.length === 1 ? "" : "s"}) unreviewed on head \`${short(a.head)}\`; ${a.merged === null ? "the PR is not merged" : a.merged === a.head ? "that head merged" : `the PR merged at \`${short(a.merged)}\`, another head`}.`) : ["None."]),
    "",
    "### Acceptance criteria",
    "",
    ...v.criteria.map((c) => (c.status === "met" ? `- [x] ${c.criterion} Evidence: ${c.evidence.map(norm).join("; ")}` : `- [ ] ${c.criterion} Gap: ${norm(c.gap)}`)),
    "",
    "### Incomplete work",
    "",
    ...(missing.length ? missing : ["None."]),
    "",
    "### Next action",
    "",
    v.verdict === "complete" ? `None: every slice is delivered on ${TARGET} and every criterion has evidence, so this report accompanies the parent issue's closure.` : `The parent issue stays open. Resolve the incomplete work and the unmet criteria above, then verify again.`,
  ].join("\n");
}

// Records one verification of the parent issue's acceptance criteria against main
// as it is now. It is complete only when every slice is delivered on main,
// no operation is unsettled, and every criterion is met with evidence; any
// other verdict keeps the parent issue open with its gaps named.
export function verifyIssue(record, { snapshot, evidence, mainSha }) {
  if (snapshot.repository !== record.repository || snapshot.issue?.number !== record.issue) throw new Error("The snapshot is of another repository or parent issue");
  // The criteria checked and the section the verification is bound to come
  // from the same read of the parent issue.
  const criteria = snapshot.issue.criteria ?? [];
  if (!SHA.test(mainSha ?? "")) throw new Error("The verified main commit must be a full SHA");
  if (snapshot.originMain !== mainSha) throw new Error(`The snapshot saw origin/${TARGET} at ${snapshot.originMain}, but it is now ${mainSha}; snapshot again so the tickets and ${TARGET} agree`);
  // A parent is verified only against its own "Acceptance criteria" section,
  // which the Feature and Task templates carry and the Bug template does not;
  // merged PRs alone never complete it.
  if (snapshot.issue.acceptanceSha256 == null) throw new Error(`Issue #${record.issue} has no "Acceptance criteria" section, so nothing can be verified and the parent issue stays open on its merged PRs alone; add a heading named Acceptance criteria with the checklist to verify, then verify again`);
  if (!criteria.length) throw new Error(`Issue #${record.issue} lists no checklist under its "Acceptance criteria" heading, so nothing can be verified; add the criteria there, then verify again`);
  const given = evidence?.criteria;
  if (!Array.isArray(given)) throw new Error("--evidence must hold { \"criteria\": [ { \"criterion\", \"status\": \"met\" | \"unmet\", \"evidence\": [...], \"gap\" } ] }");
  const unknown = given.filter((g) => !criteria.some((c) => norm(c.text) === norm(g?.criterion)));
  if (unknown.length) throw new Error(`The evidence names criteria the parent issue does not list: ${unknown.map((g) => JSON.stringify(g?.criterion)).join(", ")}`);
  const rows = criteria.map((c) => {
    const matches = given.filter((g) => norm(g.criterion) === norm(c.text));
    if (matches.length !== 1) throw new Error(`The evidence ${matches.length ? `lists criterion ${c.index} ${matches.length} times` : `omits criterion ${c.index}`}: "${c.text}"`);
    const g = matches[0];
    if (g.status === "met") {
      if (!Array.isArray(g.evidence) || !g.evidence.length || !g.evidence.every(present)) throw new Error(`Criterion ${c.index} is met only with evidence: list what shows it (a test, a check, a live run, a merged commit)`);
      return { index: c.index, criterion: c.text, status: "met", evidence: g.evidence };
    }
    if (g.status === "unmet") {
      if (!present(g.gap)) throw new Error(`Criterion ${c.index} is unmet; name the gap in gap`);
      return { index: c.index, criterion: c.text, status: "unmet", gap: g.gap, ...(Array.isArray(g.evidence) && { evidence: g.evidence }) };
    }
    throw new Error(`Criterion ${c.index}'s status must be met or unmet`);
  });
  const incomplete = slices(record, snapshot).filter((s) => !s.delivered).map((s) => ({ number: s.number, action: s.state === "closed" ? `closed without a merged deliverable on ${TARGET}` : s.open.length ? `open, PR ${s.open.map((p) => `#${p}`).join(", ")} not merged` : "open with no merged PR" }));
  // A ticket filed during the run is placed before the parent issue closes.
  incomplete.push(...filedActions(record).map((f) => ({ number: f.number, action: f.unplaced ? "triaged separate with no umbrella it was attached under" : f.action === "triage-filed" ? "filed during the run, with no triage outcome" : `named as filed in #${f.from}'s writer's report, not confirmed and triaged` })));
  const unsettled = (record.operations ?? []).filter((o) => OPEN.has(o.state)).map((o) => `${operationText(o)} ${o.id} (${o.state})`);
  const verdict = !incomplete.length && !unsettled.length && rows.every((r) => r.status === "met") ? "complete" : "incomplete";
  const v = { id: randomUUID().slice(0, 8), time: new Date().toISOString(), coordinator: record.coordinator.session, mainSha, snapshotAt: snapshot.observedAt, verdict, criteria: rows, acceptanceSha256: snapshot.issue.acceptanceSha256 ?? null, incomplete, unsettled, tickets: snapshot.tickets.filter((t) => !t.container).map((t) => t.number) };
  v.report = finalReport(record, snapshot, v);
  (record.verifications ??= []).push(v);
  record.log.push({ time: v.time, event: "issue-verification", id: v.id, verdict, mainSha });
  return { id: v.id, verdict, report: v.report };
}

// Closes the parent issue after a complete verification that still holds: main is
// the commit it verified, the parent issue has the acceptance section and slices
// it covered, each slice is still delivered and no operation is unsettled.
// Every premise is read on a fresh snapshot, with main read last, before the
// intent is saved; after it is saved, the final gate stands in front of both
// GitHub writes, posting the final report (or finding it, if an earlier
// attempt posted it) and the close call. The outcome is the issue state
// GitHub reads back: a close that was called is failed only on GitHub's own
// refusal, and every other result short of a closed parent issue is uncertain
// until reconciled, since the request may still land.
export function closeIssue(file, { coordinator, expectRevision, verification: id, takeSnapshot, readScope, client, git, afterIntent, ownership = remoteOwnership }) {
  const record = readRecord(file);
  if (record.coordinator.session !== coordinator) throw new Error(`Issue #${record.issue} is coordinated by ${record.coordinator.session}; ${coordinator} may not close it`);
  if (!record.checkpoints) throw new Error("Checkpoints are not enabled for this run, so the closure's intent could not be saved where another machine finds it; run checkpoint.mjs enable first");
  const v = (record.verifications ?? []).at(-1);
  if (!v || v.id !== id) throw new Error(`Verification ${id} is not the run's latest${v ? ` (${v.id} is)` : ""}; close only on the latest verification`);
  if (v.verdict !== "complete") throw new Error(`Verification ${id} found the parent issue incomplete (${[...v.incomplete.map((t) => `#${t.number} ${t.action}`), ...v.criteria.filter((c) => c.status !== "met").map((c) => `unmet: ${c.criterion}`), ...v.unsettled].join("; ")}); the parent issue stays open`);
  const gaps = (rec, snapshot, running = null) => {
    if (snapshot.repository !== rec.repository || snapshot.issue?.number !== rec.issue) throw new Error("The snapshot is of another repository or parent issue");
    return { blockers: verificationGaps(rec, snapshot, { running }) };
  };
  const before = gaps(record, takeSnapshot()).blockers;
  if (!before.length) { git.fetch(); const now = git.main(); if (now !== v.mainSha) before.push(`origin/${TARGET} is ${now}, not the verified ${v.mainSha}`); }
  if (before.length) throw new Error(`Verification ${id} no longer holds: ${before.join("; ")}; verify the parent issue again`);
  if (client.issue(record.issue).state === "closed") throw new Error(`Issue #${record.issue} is already closed; nothing was recorded`);
  const planned = updateRecord(file, { expectRevision, coordinator }, (r) => intent(r, { kind: "close", ticket: r.issue, pr: r.issue, expectHead: v.mainSha, evidence: `verification ${v.id}` }));
  const op = planned.output;
  const notRun = (reason) => { updateRecord(file, { expectRevision: planned.record.revision, coordinator }, (r) => { outcome(r, { id: op.id, state: "failed", evidence: `not run: ${reason}` }); }); };
  try { afterIntent?.(); }
  catch (error) { notRun(error.message); throw error; }
  const gated = (call) => finalGate({ current: () => readRecord(file), opId: op.id, ownership, takeSnapshot, readScope, git, main: v.mainSha, premises: (rec, snapshot) => gaps(rec, snapshot, op.id), call });
  // The final report: a copy an earlier attempt posted is looked up before
  // the final gate, so the gated call is the write alone; the comment is read
  // back after it.
  let existing;
  try { existing = client.comments(record.issue).find((c) => (c.body ?? "").includes(REPORT_MARK(v.id))) ?? null; }
  catch (error) { notRun(`the parent issue's comments could not be read for an earlier copy of the report: ${error.message}`); throw error; }
  const report = gated(() => existing ?? client.createComment(record.issue, v.report));
  if (!report.called && report.error) { notRun(`the verification could not be checked again after the intent was saved: ${report.error.message}`); throw report.error; }
  if (!report.called) {
    notRun(`while the intent was saved, ${report.blockers.join("; ")}; verify the parent issue again`);
    return { closed: false, operation: op.id, state: "failed", evidence: `not run: ${report.blockers.join("; ")}`, comment: null };
  }
  let comment = null, problem = null, called = false, refused = false;
  try {
    if (report.error) throw report.error;
    const back = client.getComment(report.value.id);
    if (norm(back.body) !== norm(v.report)) throw new Error(`comment ${report.value.id} does not read back as the report`);
    comment = { id: back.id, url: back.url, reused: Boolean(existing) };
  } catch (error) { problem = `the final report was not posted, so the close was not called: ${error.message}`; }
  if (comment) {
    // The close call, through the final gate again, after the report's
    // GitHub requests.
    const close = gated(() => client.closeIssue(record.issue));
    if (!close.called && close.error) { notRun(`the verification could not be checked again before the close call: ${close.error.message}`); throw close.error; }
    if (!close.called) {
      notRun(`after the report was posted in comment ${comment.id}, ${close.blockers.join("; ")}; that report's verification no longer holds, so verify the parent issue again`);
      return { closed: false, operation: op.id, state: "failed", evidence: `not run: ${close.blockers.join("; ")}`, comment };
    }
    called = true;
    if (close.error) { refused = GITHUB_REFUSAL.test(`${close.error.stderr ?? ""} ${close.error.message}`); problem = `the close call ${refused ? "was refused by GitHub" : "failed without GitHub's answer"}: ${close.error.message}`; }
  }
  let issue = null;
  try { issue = client.issue(record.issue); } catch (error) { problem = `${problem ? `${problem}; ` : ""}the parent issue could not be read back: ${error.message}`; }
  const state = issue?.state === "closed" ? "confirmed" : !called || refused ? "failed" : "uncertain";
  const evidence = issue?.state === "closed" ? `Issue #${record.issue} reads back closed${comment ? `, with the final report in comment ${comment.id}` : ""}` : `${issue ? `Issue #${record.issue} reads back ${issue.state}` : "the parent issue was not read back"}${problem ? `: ${problem}` : called ? ": the close call returned success" : ""}${state === "uncertain" ? "; the request may still land, so reconcile-operations settles it" : ""}`;
  const settled = updateRecord(file, { expectRevision: planned.record.revision, coordinator }, (r) => { const o = outcome(r, { id: op.id, state, evidence }); if (comment) o.comment = comment; });
  return { closed: state === "confirmed", operation: op.id, state, evidence, comment, revision: settled.record.revision };
}

// --- GitHub and Git ---------------------------------------------------------

// The merge call: a merge commit, the head the gate admitted, and no flag
// that bypasses protection or defers the merge. A failed call counts as
// GitHub's refusal only when its message is GitHub's answer: a GraphQL error
// or a 4xx status, such as a moved head or an unmet branch policy.
export const GITHUB_REFUSAL = /GraphQL:|HTTP 4[0-9][0-9]/;
export const mergeArgs = (repository, pr, head) => ["pr", "merge", String(pr), "--repo", repository, "--merge", "--match-head-commit", head];

// The gate's GitHub calls, given the record: the pull request, its checks,
// protection, main's runs and the merge on the code repository; the parent issue,
// its comments and its closure, and a pull request's review thread
// (`comments(pr, ticket)`), on the tickets repository. `comments(n)` without
// a ticket reads issue n there. A pull request closes a ticket only by a
// closing reference to the tickets repository's issue of that number.
export function integrationClient(names, checkout, { exec = execFileSync, spawn = spawnSync } = {}) {
  const { code: repository, tickets, split, thread } = repositoriesOf(names);
  const run = (args, input) => exec("gh", args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...(input !== undefined && { input }) });
  const shape = (c) => ({ id: c.id, body: c.body ?? "", url: c.html_url });
  return {
    pull: (pr) => {
      const p = JSON.parse(run(["pr", "view", String(pr), "--repo", repository, "--json", "state,isDraft,headRefOid,headRefName,baseRefName,mergeable,mergeStateStatus,mergeCommit,closingIssuesReferences,statusCheckRollup"]));
      return {
        state: p.state, isDraft: p.isDraft, head: p.headRefOid, branch: p.headRefName, base: p.baseRefName, mergeable: p.mergeable, mergeState: p.mergeStateStatus, mergeCommit: p.mergeCommit?.oid ?? null,
        closes: (split ? closingIn(p.closingIssuesReferences, tickets, repository) : p.closingIssuesReferences ?? []).map((r) => r.number),
        checks: (p.statusCheckRollup ?? []).map((c) => ({ name: c.name ?? c.context, workflow: c.workflowName ?? null, state: c.conclusion || c.state || c.status, startedAt: c.startedAt ?? null, completedAt: c.completedAt ?? null })),
      };
    },
    comments: (n, ticket) => { const t = ticket === undefined ? { repo: tickets, number: n } : thread(n, ticket); return JSON.parse(run(["api", "--paginate", "--slurp", `repos/${t.repo}/issues/${t.number}/comments`])).flat(); },
    // Required checks from classic branch protection and from rulesets, and
    // whether a ruleset requires a merge queue. Protection a token cannot read
    // is noted; GitHub's merge state still reflects it.
    protection: (branch) => {
      const required = new Set(), sources = [];
      try {
        const p = JSON.parse(run(["api", `repos/${repository}/branches/${branch}/protection/required_status_checks`]));
        for (const c of p.contexts ?? []) required.add(c);
        for (const c of p.checks ?? []) required.add(c.context);
        sources.push("branch protection");
      } catch (error) {
        if (/HTTP 404|not enabled|not protected/i.test(`${error.stderr ?? ""} ${error.message}`)) sources.push("branch protection (no required checks)");
        else sources.push(`branch protection unreadable (${String(error.stderr || error.message).trim().split("\n")[0]}); GitHub's merge state still applies it`);
      }
      let mergeQueue = false;
      for (const rule of JSON.parse(run(["api", "--paginate", "--slurp", `repos/${repository}/rules/branches/${branch}`])).flat()) {
        if (rule.type === "required_status_checks") for (const c of rule.parameters?.required_status_checks ?? []) required.add(c.context);
        if (rule.type === "merge_queue") mergeQueue = true;
      }
      sources.push("rulesets");
      return { required: [...required], mergeQueue, source: sources.join("; ") };
    },
    // Main's push runs of the Test Suite workflow, newest first.
    mainRuns: (branch) => JSON.parse(run(["run", "list", "--repo", repository, "--workflow", REPOSITORY_WORKFLOW, "--branch", branch, "--event", "push", "--limit", "10", "--json", "databaseId,headSha,status,conclusion,createdAt,url"])).map((r) => ({ id: r.databaseId, headSha: r.headSha, status: r.status, conclusion: r.conclusion, createdAt: r.createdAt, url: r.url })),
    merge: (pr, head) => {
      const r = spawn("gh", mergeArgs(repository, pr, head), { cwd: checkout, encoding: "utf8", windowsHide: true, timeout: 120000 });
      if (r.error) throw r.error;
      return { ok: r.status === 0, message: (r.stderr || r.stdout || "").trim() || `exit ${r.status}` };
    },
    issue: (n) => { const i = JSON.parse(run(["api", `repos/${tickets}/issues/${n}`])); return { state: i.state, title: i.title, body: i.body ?? "" }; },
    createComment: (n, body) => shape(JSON.parse(run(["api", "-X", "POST", `repos/${tickets}/issues/${n}/comments`, "--input", "-"], JSON.stringify({ body })))),
    getComment: (id) => shape(JSON.parse(run(["api", `repos/${tickets}/issues/comments/${id}`]))),
    closeIssue: (n) => { run(["api", "-X", "PATCH", `repos/${tickets}/issues/${n}`, "-f", "state=closed", "-f", "state_reason=completed"]); },
  };
}

// The review checkpoint's Git reader, plus main, ancestry and the chain of
// clean main merges at a branch's head.
export function integrationGit(checkout, { fetch, main } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 }).trim();
  const isAncestor = (a, b) => spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: checkout, windowsHide: true }).status === 0;
  fetch ??= (pr) => execFileSync("git", ["fetch", "-q", "origin", ...(pr ? [`refs/pull/${pr}/head`] : []), TARGET], { cwd: checkout, windowsHide: true });
  main ??= () => git("rev-parse", `origin/${TARGET}`);
  return {
    ...localGit(checkout, { fetch, base: main }), fetch, main, isAncestor,
    firstParent: (sha) => git("rev-parse", `${sha}^1`),
    mergeBase: (a, b) => git("merge-base", a, b),
    // The head, then each first parent reached through a clean merge of the
    // target: two parents, the second on the target, and an empty remerge
    // diff, so the merge changed nothing a clean merge would not.
    cleanChain(head, target) {
      const chain = [head];
      for (let at = head; ;) {
        const parents = git("rev-list", "--parents", "-n", "1", at).split(" ").slice(1);
        if (parents.length !== 2 || !isAncestor(parents[1], target)) return chain;
        if (git("show", "--remerge-diff", "--format=", at) !== "") return chain;
        chain.push(parents[0]);
        at = parents[0];
      }
    },
  };
}

// --- Command line -----------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv, o = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--") || i + 1 >= rest.length) throw new Error(`Unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(o, key)) throw new Error(`${rest[i]} given twice`);
    o[key] = rest[++i];
  }
  return { command, o };
}
const int = (v, name) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`); return n; };
const abs = (v, name) => { if (typeof v !== "string" || !path.isAbsolute(v)) throw new Error(`--${name} must be an absolute path`); return v; };

// The parent issue's snapshot, taken afresh each time a command needs one.
const liveSnapshot = (record) => () => takeSnapshot({ repository: record.repository, issue: record.issue, tickets: repositoriesOf(record).tickets }, githubClient(record, record.checkout));
const liveScope = (record) => () => readIssueScope({ issue: record.issue, tickets: repositoriesOf(record).tickets, split: repositoriesOf(record).split }, githubClient(record, record.checkout));

export function main(argv, { clientFor = integrationClient, gitFor = integrationGit, github, snapshotFor = liveSnapshot, scopeFor = liveScope } = {}) {
  const { command, o } = parse(argv);
  const file = () => abs(o.record, "record");
  const context = () => { const record = readRecord(file()); return { record, client: clientFor(record, record.checkout), git: gitFor(record.checkout), snapshotNow: snapshotFor(record), scopeNow: scopeFor(record) }; };
  const saved = () => ensureSaved(file(), { coordinator: o.coordinator, github });
  const checkpointAfter = (transition) => { const c = autoCheckpoint(file(), { coordinator: o.coordinator, transition, github }); return c ? { checkpoint: c } : {}; };
  switch (command) {
    case "gate": {
      const { record, client, git, snapshotNow } = context(), pr = int(o.pr, "pr"), ticket = int(o.ticket, "ticket");
      return admission(record, { ticket, pr, snapshot: snapshotNow(), facts: gatherFacts({ record, ticket, pr, client, git }), git });
    }
    case "merge": {
      const { client, git, snapshotNow, scopeNow } = context(), pr = int(o.pr, "pr");
      const result = mergeAdmitted(file(), { coordinator: o.coordinator, expectRevision: int(o.expectRevision, "expect-revision"), ticket: int(o.ticket, "ticket"), pr, takeSnapshot: snapshotNow, readScope: scopeNow, client, git, afterIntent: saved });
      return result.admitted ? { ...result, ...checkpointAfter(`the merge of PR #${pr} (${result.state})`) } : result;
    }
    case "criteria": { const { record, client } = context(); return { issue: record.issue, criteria: parseCriteria(client.issue(record.issue).body) }; }
    case "verify-issue": {
      const { git, snapshotNow } = context();
      const snapshot = snapshotNow(), evidence = readJson(abs(o.evidence, "evidence"));
      git.fetch();
      const mainSha = git.main();
      const { record: next, output } = updateRecord(file(), { expectRevision: int(o.expectRevision, "expect-revision"), coordinator: o.coordinator }, (r) => verifyIssue(r, { snapshot, evidence, mainSha }));
      if (o.out) fs.writeFileSync(abs(o.out, "out"), `${output.report}\n`);
      return { revision: next.revision, id: output.id, verdict: output.verdict, ...(o.out && { report: o.out }), ...checkpointAfter(`issue verification ${output.id} (${output.verdict})`) };
    }
    case "close-issue": {
      const { client, git, snapshotNow, scopeNow } = context();
      const result = closeIssue(file(), { coordinator: o.coordinator, expectRevision: int(o.expectRevision, "expect-revision"), verification: o.verification, takeSnapshot: snapshotNow, readScope: scopeNow, client, git, afterIntent: saved });
      return { ...result, ...checkpointAfter(`closing the parent issue (${result.state})`) };
    }
    default: throw new Error("Usage: integration.mjs gate|merge|criteria|verify-issue|close-issue --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    console.log(JSON.stringify(output, null, 2));
    // Not admitted: nothing was recorded. Not confirmed: the outcome is
    // recorded as failed or uncertain. Not saved: the change is local only.
    if (output?.admitted === false) process.exitCode = 2;
    else if (output?.state && output.state !== "confirmed") process.exitCode = 1;
    if (output?.checkpoint?.saved === false) { console.error(`The record changed locally, but its checkpoint was not saved: ${output.checkpoint.reason}`); process.exitCode = 3; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
