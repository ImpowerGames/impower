// Review checkpoints for orchestrate-feature. After round 3's verified fixes,
// and after every later round's, the coordinator records one decision for a
// writer's PR: finish through ordinary readiness, direct a root-cause repair,
// authorize the next bounded round, accept the final verified corrections
// without another independent round, or ask the maintainer. This helper reads
// the round state from the review launcher's journals and the PR, refuses a
// decision whose checkable preconditions do not hold, and builds the PR
// comment that records it. The PR is that decision's authority: a later
// coordinator, on any account or machine, restores every decision from the
// PR's comments alone.
//
// The helper checks structure, never judgement: an assessment field that is
// filled in says nothing about whether its reasoning is sound. That is read
// in the published decision.
//
//   node .agents/skills/orchestrate-feature/review-checkpoint.mjs <command> --option value ...
//
// Commands: evidence, decide, published, abandon, restore, acceptance-check.

import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../scripts/review-job-store.mjs";
import { readRecord, reviewRounds, updateRecord } from "./feature-run.mjs";

export const FIRST_CHECKPOINT_ROUND = 3;
export const MAX_REVIEW_ROUNDS = 10;
export const KINDS = ["finish", "repair", "extend", "accept-unreviewed", "maintainer"];
// Every assessment answers these, in the published decision's order.
export const ASSESSMENT_FIELDS = ["mechanisms", "regressions", "repairOptions", "residualRisk", "coverage", "nextRoundValue", "rationale", "next"];
export const DISPOSITIONS = ["accepted", "rejected", "covered", "deferred", "none", "open"];
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const PENDING = new Set(["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", "REQUESTED"]);
const TERMINAL = new Set(["finished", "blocked", "report-posted"]);
const MARK = "orchestrate-feature-checkpoint";
// GitHub refuses a comment body longer than this.
const MAX_COMMENT = 65536;
const BLOCK = new RegExp(`<!-- ${MARK}\\r?\\n([\\s\\S]*?)\\r?\\n-->`, "g");
const SHA = /^[0-9a-f]{40}$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const byTime = (a, b) => Date.parse(a.time) - Date.parse(b.time);

// --- Round state from the launcher's journals -------------------------------

// Every launch journal of the PR's review jobs, with the plan beside it.
export function readJournals(jobDir) {
  if (!fs.existsSync(jobDir)) return [];
  const journals = [];
  for (const round of fs.readdirSync(jobDir).filter((d) => /^round-\d+$/.test(d)).sort()) {
    for (const launch of fs.readdirSync(path.join(jobDir, round), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const file = path.join(jobDir, round, launch.name, "journal.jsonl");
      if (!fs.existsSync(file)) continue;
      const rows = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, i) => {
        try { return JSON.parse(line); } catch { throw new Error(`${file} line ${i + 1} is not JSON; the round state cannot be read from it`); }
      });
      const planFile = path.join(path.dirname(file), "plan.json");
      journals.push({ file, rows, plan: fs.existsSync(planFile) ? readJson(planFile) : null });
    }
  }
  return journals;
}

// The review state the journals record: launches with whether each reviewer
// exited, validated completions, the highest started and completed rounds,
// the reports, the round limits the plans declared, and what keeps the state
// from being final. A journal that has not reached a terminal row belongs to
// a launcher that may still run.
export function roundState(journals) {
  const launches = [], completions = [], plans = [], blockers = [];
  for (const { file, rows, plan } of journals) {
    const last = rows.at(-1)?.event;
    const terminal = TERMINAL.has(last);
    if (last === "report-awaiting-post") blockers.push(`${file}: its reviewer's report still awaits posting on the PR`);
    else if (!terminal) blockers.push(`${file}: the launcher has not finished (last row ${last ?? "none"}), so a reviewer may still run`);
    const reviewLaunch = new Map();
    for (const row of rows) {
      if (row.event === "launching" && row.role === "review") {
        const spawned = rows.some((r) => (r.event === "running" || r.event === "identified") && r.index === row.index);
        const exited = rows.find((r) => r.event === "exited" && r.index === row.index);
        // A round that does not name its reviewers plans the count its step
        // declares, one when it declares none.
        const declared = plan?.steps?.[row.step]?.reviewers;
        const plannedCount = Array.isArray(declared) ? declared.length : Number.isSafeInteger(declared) ? declared : 1;
        const launch = { file, index: row.index, time: row.time, round: row.round, reviewerId: row.reviewerId ?? null, attempt: row.attempt ?? 1, plannedReviewers: row.plannedReviewers ?? null, plannedCount, head: rows.find((r) => r.event === "running" && r.index === row.index)?.head ?? null, exited: Boolean(exited) || (!spawned && terminal), exitedAt: exited?.time ?? null };
        if (spawned && !exited) blockers.push(`${file}: reviewer launch ${row.index} of round ${row.round} has no exited row`);
        reviewLaunch.set(row.index, launch);
        launches.push(launch);
      }
      if (row.event === "completed" && reviewLaunch.has(row.index)) {
        const launch = reviewLaunch.get(row.index);
        completions.push({ file, time: row.time, round: launch.round, reviewerId: row.reviewerId ?? null, attempt: row.attempt ?? 1, reviewedHead: row.reviewedHead, comments: row.commentIds ?? [], completedRoundReviews: row.completedRoundReviews ?? null, plannedCount: launch.plannedCount, plannedRoundReviewers: row.plannedRoundReviewers ?? null, pendingReviewers: row.pendingReviewers ?? null, complete: row.pendingReviewers ? row.pendingReviewers.length === 0 : row.completedRoundReviews >= launch.plannedCount });
      }
    }
    if (plan) plans.push({ file, limit: plan.reviewRoundLimit ?? FIRST_CHECKPOINT_ROUND, authorization: plan.extendedReviewAuthorization ?? null });
  }
  completions.sort(byTime);
  launches.sort(byTime);
  const completedRound = Math.max(0, ...completions.map((c) => c.round));
  const startedRound = Math.max(0, ...launches.map((l) => l.round));
  const latest = completions.filter((c) => c.round === completedRound).at(-1) ?? null;
  if (latest?.pendingReviewers) { if (latest.pendingReviewers.length) blockers.push(`round ${completedRound} still plans ${latest.pendingReviewers.join(", ")}`); }
  else if (latest && !(latest.completedRoundReviews >= latest.plannedCount)) blockers.push(`round ${completedRound} has ${latest.completedRoundReviews ?? "an unknown number of"} of its ${latest.plannedCount} planned reviewers' completions`);
  if (startedRound > completedRound) blockers.push(`round ${startedRound} has started and has no validated completion`);
  return {
    completedRound, startedRound, reviewedHead: latest?.reviewedHead ?? null, plannedReviewers: latest?.plannedRoundReviewers ?? (latest ? `${latest.plannedCount} unnamed` : null),
    reports: completions.flatMap((c) => c.comments.map((comment) => ({ round: c.round, reviewerId: c.reviewerId, attempt: c.attempt, reviewedHead: c.reviewedHead, comment }))),
    launches, completions, plans, blockers,
  };
}

// --- Decisions published on the PR ----------------------------------------

// Every checkpoint block in the PR's comments, in comment order, each with
// its exact head and range. Writers and coordinators post under the same
// GitHub account, so a comment's author proves nothing, and a decision
// counts (trusted) only when it names a coordinator the caller trusts and
// its comment was never edited. With a run record (its own, carried over by
// a takeover, or restored from the shared record), a decision counts only if
// the record published it, after read-back, as that comment with exactly
// that content (verified); a block that copies a coordinator's name, a
// decision posted but never read back, and a retargeted comment all count
// for nothing. Without a record the decisions are restored but unverified:
// they still count rounds, but they never make an acceptance apply.
export const blockHash = (decision) => sha256(JSON.stringify(decision));
export function restore(comments, { trusted = [], record = null } = {}) {
  const published = record ? new Map(Object.values(record.tickets).flatMap((t) => (t.checkpoints ?? []).filter((d) => d.state === "published").map((d) => [d.id, d]))) : null;
  const decisions = [];
  for (const c of comments) {
    for (const m of (c.body ?? "").matchAll(BLOCK)) {
      let d;
      try { d = JSON.parse(m[1]); } catch { decisions.push({ comment: c.id, malformed: "its block is not JSON" }); continue; }
      const problem = !KINDS.includes(d?.kind) ? "unknown kind" : !Number.isSafeInteger(d.round) ? "no round" : !SHA.test(d.head ?? "") ? "no head" : (d.reviewedHead !== null && !SHA.test(d.reviewedHead ?? "")) ? "no reviewed head" : typeof d.coordinator !== "string" ? "no coordinator" : (d.kind === "extend" && (!Number.isSafeInteger(d.limit) || !d.authority)) ? "an extension without its limit and authority" : null;
      if (problem) { decisions.push({ comment: c.id, malformed: problem }); continue; }
      const mine = published?.get(d.id);
      const verified = Boolean(mine && mine.published.comment === c.id && mine.blockSha256 === blockHash(d));
      const edited = Boolean(c.updated_at && c.updated_at !== c.created_at);
      const untrusted = !trusted.includes(d.coordinator) ? `coordinator ${d.coordinator} is not one this restoration trusts`
        : edited ? `comment ${c.id} was edited at ${c.updated_at}, after it was posted`
        : record && !verified ? `the run record did not publish decision ${d.id}, after read-back, as comment ${c.id} with this content`
        : null;
      decisions.push({ ...d, comment: c.id, postedAt: c.created_at, trusted: !untrusted, verified: !untrusted && verified, ...(untrusted && { untrusted }) });
    }
  }
  return decisions;
}

// Rounds the journals show against the extensions the PR records. Each round
// after the third needs a published extension decided at the checkpoint
// after the round before it, covering it and recorded before its first
// launch. A count never goes back, a round's reviewers stay the ones it was
// planned with, and a plan's extended limit carries an extension's limit and
// authority.
export function audit(state, decisions) {
  const violations = [];
  const extensions = decisions.filter((d) => d.trusted && d.kind === "extend");
  for (let r = FIRST_CHECKPOINT_ROUND + 1; r <= state.startedRound; r++) {
    const first = state.launches.find((l) => l.round === r);
    if (!first) continue;
    if (r > MAX_REVIEW_ROUNDS) { violations.push(`round ${r} exceeds the ${MAX_REVIEW_ROUNDS}-round ceiling`); continue; }
    const covering = extensions.find((d) => d.round === r - 1 && d.limit >= r && Date.parse(d.postedAt ?? d.time) <= Date.parse(first.time));
    if (!covering) violations.push(`round ${r} launched at ${first.time} with no published extension, decided at the checkpoint after round ${r - 1}, that covers it`);
  }
  const events = [...state.completions.map((c) => ({ ...c, kind: "completed" })), ...state.launches.map((l) => ({ ...l, kind: "launching" }))].sort(byTime);
  // Once a round is complete, a reviewer of that round may launch again only
  // on the head its completion recorded; on a corrected head it is a new
  // round, whatever attempt or plan it claims.
  let highest = 0;
  const completeOn = new Map();
  for (const e of events) {
    if (e.kind === "completed") { highest = Math.max(highest, e.round); if (e.complete) completeOn.set(e.round, e.reviewedHead); continue; }
    if (completeOn.has(e.round) && e.head && e.head !== completeOn.get(e.round)) violations.push(`${e.file} launched a round ${e.round} reviewer on ${e.head} at ${e.time}, after round ${e.round} completed on ${completeOn.get(e.round)}; a reviewer on a corrected head is a new round`);
    if (e.round < highest) violations.push(`${e.file} launched a round ${e.round} reviewer at ${e.time}, after round ${highest} completed; a restarted count is not a new round`);
  }
  for (const l of state.launches) {
    const planned = state.completions.find((c) => c.round === l.round)?.plannedRoundReviewers;
    if (planned && l.reviewerId && !planned.includes(l.reviewerId)) violations.push(`${l.file} launched reviewer ${l.reviewerId} in round ${l.round}, which planned ${planned.join(", ")}; an added reviewer needs a new round`);
  }
  for (const p of state.plans) {
    if (p.limit <= FIRST_CHECKPOINT_ROUND) continue;
    if (!extensions.some((d) => d.limit >= p.limit && d.authority === p.authorization)) violations.push(`${p.file} sets reviewRoundLimit ${p.limit} without a published extension whose limit and authority it carries`);
  }
  return violations;
}

// The latest trusted acceptance applies only when a run record verified it,
// only to the head it names, and only while no later trusted decision
// replaced it.
export function acceptanceApplies(decisions, head) {
  const trusted = decisions.filter((d) => d.trusted);
  const at = trusted.findLastIndex((d) => d.kind === "accept-unreviewed");
  if (at < 0) return { applies: false, reason: "the PR records no trusted acceptance of unreviewed corrections" };
  const d = trusted[at], later = trusted.slice(at + 1);
  if (later.length) return { applies: false, decision: d, reason: `decision ${later.at(-1).id} (${later.at(-1).kind}) after round ${later.at(-1).round} replaced acceptance ${d.id}` };
  if (!d.verified) return { applies: false, decision: d, reason: `acceptance ${d.id} is restored from the PR but not verified against the run record that published it; restore that record, or decide again` };
  if (d.head !== head) return { applies: false, decision: d, reason: `acceptance ${d.id} applies to ${d.head}, but the PR's head is ${head}; a new push needs a new checkpoint` };
  return { applies: true, decision: d, reason: `acceptance ${d.id} applies to head ${head}, with ${d.range.from}..${d.range.to} unreviewed` };
}

// --- Evidence ---------------------------------------------------------------

const checkResult = (state) => { const s = String(state ?? "").toUpperCase(); return PASSED.has(s) ? "passed" : PENDING.has(s) ? "pending" : "failed"; };

// Gathers what a checkpoint decides on: the round state, each report and its
// adjudication, CI on the head, the unreviewed range and its diff, the
// decisions already published, and every reason no checkpoint is due yet.
export function checkpointEvidence({ pr, state, pull, comments, git, trusted, record = null }) {
  const blockers = [...state.blockers];
  if (pull.state !== "OPEN") blockers.push(`PR #${pr} is ${pull.state}`);
  const posted = reviewRounds(comments);
  if (posted > state.startedRound) blockers.push(`the PR posts round ${posted}'s state, but no journal here records that round; read its journals where it ran`);
  if (state.completedRound < FIRST_CHECKPOINT_ROUND) blockers.push(`round ${state.completedRound} is the last complete round; the first formal checkpoint follows round ${FIRST_CHECKPOINT_ROUND}'s verified fixes`);
  const reports = state.reports.map((r) => {
    const report = comments.find((c) => c.id === r.comment);
    if (!report) { blockers.push(`report ${r.comment} (round ${r.round}, ${r.reviewerId ?? "reviewer"}) is not on PR #${pr}`); return r; }
    // An adjudication is a later comment headed as one that names the report;
    // a checkpoint decision lists reports too, and is not an adjudication.
    const adjudication = comments.find((c) => c.id !== r.comment && Date.parse(c.created_at) >= Date.parse(report.created_at) && /adjudicat/i.test((c.body ?? "").split("\n")[0]) && !(c.body ?? "").includes(MARK) && (c.body ?? "").includes(String(r.comment)));
    if (!adjudication) blockers.push(`report ${r.comment} (round ${r.round}, ${r.reviewerId ?? "reviewer"}) has no adjudication comment naming it`);
    return { ...r, adjudication: adjudication?.id ?? null, adjudicatedAt: adjudication?.created_at ?? null };
  });
  const checks = pull.checks.map((c) => ({ name: c.name, state: c.state, result: checkResult(c.state) }));
  if (!checks.length) blockers.push(`no CI check has started on ${pull.head}`);
  const failed = checks.filter((c) => c.result === "failed");
  if (failed.length) blockers.push(`CI failed on ${pull.head}: ${failed.map((c) => `${c.name} ${c.state}`).join(", ")}`);
  const range = state.reviewedHead ? git.range(state.reviewedHead, pull.head) : null;
  if (range && !range.ancestor) blockers.push(`the reviewed head ${state.reviewedHead} is not an ancestor of ${pull.head}; the history was rewritten`);
  const decisions = restore(comments, { trusted, record });
  const violations = audit(state, decisions);
  const extension = decisions.filter((d) => d.trusted && d.kind === "extend").at(-1);
  return {
    pr, head: pull.head, branch: pull.branch, completedRound: state.completedRound, startedRound: state.startedRound, limit: Math.max(FIRST_CHECKPOINT_ROUND, extension?.limit ?? 0),
    reviewedHead: state.reviewedHead, plannedReviewers: state.plannedReviewers, range, checks, reports,
    lastExit: state.launches.map((l) => l.exitedAt).filter(Boolean).sort().at(-1) ?? null, lastAdjudication: reports.map((r) => r.adjudicatedAt).filter(Boolean).sort().at(-1) ?? null,
    decisions: decisions.map(({ id, kind, round, head, comment, trusted: t, malformed }) => ({ id, kind, round, head, comment, trusted: t, ...(malformed && { malformed }) })),
    audit: violations, blockers, due: !blockers.length && !violations.length,
  };
}

// --- Decide, publish, restore ----------------------------------------------

const present = (value) => typeof value === "string" && value.trim().length > 0;
const line = (text) => String(text).replace(/\s*\r?\n\s*/g, " ").trim();

function checkAssessment(kind, a, evidence) {
  if (!a || typeof a !== "object") throw new Error("--assessment must be a JSON object");
  const missing = ASSESSMENT_FIELDS.filter((f) => !present(a[f]));
  if (missing.length) throw new Error(`The assessment lacks ${missing.join(", ")}; every checkpoint answers each one from the PR's whole review history`);
  if (!["preserved", "changed"].includes(a.agreedBehavior) || !["unchanged", "major-change"].includes(a.architecture)) throw new Error("The assessment must say whether the Feature's agreed behavior is preserved or changed, and whether the architecture is unchanged or takes a major change");
  if ((a.agreedBehavior === "changed" || a.architecture === "major-change") && kind !== "maintainer") throw new Error("A change to the Feature's agreed behavior or a major architectural commitment is the maintainer's decision; record kind maintainer with the question");
  if (!Array.isArray(a.findings) || a.findings.some((f) => !Number.isSafeInteger(f?.comment) || !DISPOSITIONS.includes(f.disposition) || !present(f.finding ?? (f.disposition === "none" ? "no findings" : "")))) throw new Error(`The assessment's findings must list every finding as { comment, finding, disposition } with a disposition among ${DISPOSITIONS.join(", ")}`);
  if (kind !== "maintainer") {
    const listed = new Set(a.findings.map((f) => f.comment));
    const unlisted = evidence.reports.filter((r) => !listed.has(r.comment));
    if (unlisted.length) throw new Error(`The assessment's findings omit report${unlisted.length > 1 ? "s" : ""} ${unlisted.map((r) => r.comment).join(", ")}; list each report's findings, or a disposition none for a report with none`);
  }
  const open = a.findings.filter((f) => f.disposition === "open");
  if (open.length && (kind === "finish" || kind === "accept-unreviewed")) throw new Error(`Finding${open.length > 1 ? "s" : ""} ${open.map((f) => `${f.comment} (${line(f.finding)})`).join(", ")} ${open.length > 1 ? "are" : "is"} still open; a known defect is resolved before ${kind}`);
}

export function decide(record, { ticket: number, kind, assessment: a, inspected, evidence: e }) {
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(", ")}`);
  const ticket = record.tickets[number];
  if (!ticket) throw new Error(`#${number} is not in the run record`);
  if (ticket.owner?.handle?.id && ticket.owner.handle.id === record.coordinator.session) throw new Error(`#${number}'s writer is ${record.coordinator.session}, the coordinator itself; a writer never decides its own review checkpoint`);
  if (e.completedRound < FIRST_CHECKPOINT_ROUND) throw new Error(`No formal checkpoint before round ${FIRST_CHECKPOINT_ROUND}: round ${e.completedRound} is the last complete round, and the writer's ordinary review continues`);
  if (kind !== "maintainer" && !e.due) throw new Error(`No checkpoint is due on PR #${e.pr}: ${[...e.blockers, ...e.audit].join("; ")}`);
  const earlier = ticket.checkpoints ?? [];
  const unsettled = earlier.find((d) => d.state === "intent");
  if (unsettled) throw new Error(`Decision ${unsettled.id} is not published; publish it and record published, or record abandon with evidence that it was never posted`);
  const previous = earlier.filter((d) => d.state !== "abandoned").at(-1);
  if (previous && previous.round > e.completedRound) throw new Error(`Decision ${previous.id} was made after round ${previous.round}, but the journals now show round ${e.completedRound}; a count never goes back`);
  checkAssessment(kind, a, e);
  const extra = {};
  if (kind === "extend") {
    if (e.completedRound >= MAX_REVIEW_ROUNDS) throw new Error(`Round ${e.completedRound} reached the ${MAX_REVIEW_ROUNDS}-round ceiling; no further round is authorized. Accept the final corrections only if that decision's own conditions hold, or ask the maintainer`);
    if (!Number.isSafeInteger(a.limit) || a.limit <= e.completedRound || a.limit > MAX_REVIEW_ROUNDS) throw new Error(`An extension's limit must exceed the completed round ${e.completedRound} and stay within ${MAX_REVIEW_ROUNDS}`);
    if (!present(a.limitReason)) throw new Error("An extension records the reason for its limit in limitReason");
    if (!present(record.invocation?.text)) throw new Error("The run record holds no invocation to authorize an extension");
    Object.assign(extra, { limit: a.limit, limitReason: line(a.limitReason), authority: record.invocation.text });
  }
  if (kind === "repair" && (!present(a.scope) || !present(a.verificationChange))) throw new Error("A root-cause repair records the scope it widens in scope and how verification changes in verificationChange");
  if (kind === "maintainer" && !present(a.question)) throw new Error("A maintainer decision records the question in question");
  if (kind === "accept-unreviewed") {
    if (!e.range || e.head === e.reviewedHead || !e.range.commits.length) throw new Error(`Nothing after ${e.reviewedHead} is unreviewed; finish through ordinary readiness instead`);
    if (!present(record.invocation?.text)) throw new Error("The run record holds no invocation to authorize an acceptance");
    const notPassed = e.checks.filter((c) => c.result !== "passed");
    if (!e.checks.length || notPassed.length) throw new Error(`Every CI check on ${e.head} must have passed: ${notPassed.length ? notPassed.map((c) => `${c.name} ${c.result}`).join(", ") : "none has started"}`);
    if (inspected !== e.range.diffSha256) throw new Error(`--inspected must be the SHA-256 of the unreviewed diff you read (${e.range.from}..${e.range.to}), which evidence prints; it is ${inspected ?? "missing"}`);
    if (!Array.isArray(a.verification) || !a.verification.length || !a.verification.every(present)) throw new Error("An acceptance lists the verification that passed on the final head in verification");
    extra.authority = record.invocation.text;
  }
  const decision = {
    version: 1, id: randomUUID().slice(0, 8), kind, feature: record.feature, ticket: number, pr: e.pr, coordinator: record.coordinator.session, runId: record.runId, time: new Date().toISOString(),
    round: e.completedRound, limitBefore: e.limit, reviewedHead: e.reviewedHead, head: e.head,
    range: e.range ? { from: e.range.from, to: e.range.to, base: e.range.base, commits: e.range.commits.map((c) => c.sha), diffSha256: e.range.diffSha256 } : null,
    reports: e.reports.map(({ comment, round, reviewerId, adjudication }) => ({ comment, round, reviewerId, adjudication })),
    checks: e.checks.map(({ name, result }) => ({ name, result })), due: e.due, blockers: e.blockers, audit: e.audit, ...extra, assessment: a,
  };
  const body = renderDecision(decision, e);
  if (body.length > MAX_COMMENT) throw new Error(`The decision's comment would be ${body.length} characters, beyond GitHub's ${MAX_COMMENT}; shorten the assessment`);
  ticket.checkpoints = [...earlier, { ...decision, state: "intent", body, bodySha256: sha256(body), blockSha256: blockHash(decision) }];
  record.log.push({ time: decision.time, event: "checkpoint-intent", ticket: number, id: decision.id, kind, round: decision.round, head: decision.head });
  return { id: decision.id, body };
}

const TITLES = { finish: "finish through ordinary readiness", repair: "direct a root-cause repair", extend: "authorize another bounded round", "accept-unreviewed": "accept the final verified corrections without another independent round", maintainer: "ask the maintainer" };

export function renderDecision(d, e) {
  const a = d.assessment;
  const counts = DISPOSITIONS.map((s) => [s, a.findings.filter((f) => f.disposition === s).length]).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(", ");
  const open = a.findings.filter((f) => f.disposition === "open");
  const commits = e.range?.commits ?? [];
  const block = JSON.stringify(d, null, 1).replace(/--/g, "-\\u002d");
  return [
    `### Coordinator checkpoint after review round ${d.round}: ${TITLES[d.kind]}`,
    "",
    `Decision \`${d.id}\` by coordinator \`${d.coordinator}\` of Feature #${d.feature} for #${d.ticket}.${d.authority ? ` Authority: the orchestrate-feature invocation, quoted verbatim from the run record: "${line(d.authority)}"` : ""}`,
    "",
    d.due
      ? `- Round state: round ${d.round} is complete (limit ${d.limitBefore} before this decision); its planned reviewers (${[e.plannedReviewers].flat().join(", ")}) exited, and every report has its adjudication (${d.reports.map((r) => `${r.comment} in ${r.adjudication}`).join(", ") || "none"}).`
      : `- Round state: no checkpoint is due, so this question reaches the maintainer before the review gates hold: ${[...d.blockers, ...d.audit].map(line).join("; ")}. Reports and their adjudications: ${d.reports.map((r) => `${r.comment} ${r.adjudication ? `in ${r.adjudication}` : "not adjudicated"}`).join(", ") || "none"}.`,
    `- Independently reviewed through \`${d.reviewedHead}\`${d.due ? "" : " (the last reviewer to complete; the round's coverage is as stated above)"}.`,
    `- Head \`${d.head}\`. ${commits.length ? `Unreviewed: \`${d.range.from.slice(0, 9)}..${d.range.to.slice(0, 9)}\`, ${commits.length} commit${commits.length > 1 ? "s" : ""} (${commits.map((c) => `\`${c.sha.slice(0, 9)}\` ${line(c.subject)}${c.via ? ` (merged in by \`${c.via.slice(0, 9)}\`)` : c.merge === "base" ? " (base merge, shown as its remerge diff)" : c.merge ? " (merge of commits no review saw, shown in full)" : ""}`).join("; ")}), diff SHA-256 \`${d.range.diffSha256}\`.` : "Nothing after the reviewed head is unreviewed."}`,
    `- CI on the head: ${d.checks.map((c) => `${c.name} ${c.result}`).join(", ") || "no check has started"}.`,
    `- Findings across all rounds: ${counts || "none"}; unresolved: ${open.length ? open.map((f) => `${f.comment} (${line(f.finding)})`).join(", ") : "none"}.`,
    `- Shared mechanisms: ${line(a.mechanisms)}`,
    `- Defects introduced by corrections: ${line(a.regressions)}`,
    `- Broader or simpler repair: ${line(a.repairOptions)}`,
    `- Residual risk: ${line(a.residualRisk)}`,
    `- Verification coverage: ${line(a.coverage)}`,
    `- What another round would establish: ${line(a.nextRoundValue)}`,
    `- Agreed behavior ${a.agreedBehavior}; architecture ${a.architecture === "unchanged" ? "unchanged" : "takes a major change"}.`,
    `- Decision: ${line(a.rationale)} Next: ${line(a.next)}`,
    ...(d.kind === "extend" ? [`- Round ${d.round + 1} may launch with \`reviewRoundLimit\` ${d.limit} and \`extendedReviewAuthorization\` set to the invocation quoted above, verbatim. Limit reason: ${d.limitReason} The next checkpoint follows round ${d.round + 1}'s verified fixes, and the count never resets.`] : []),
    ...(d.kind === "repair" ? [`- Repair scope: ${line(a.scope)} Verification change: ${line(a.verificationChange)} The round count stays at ${d.round}; the coordinator reassesses the changed risk once the repair is verified, before choosing the next action.`] : []),
    ...(d.kind === "accept-unreviewed" ? [`- Verification on the head: ${a.verification.map(line).join("; ")}.`, `- This is the coordinator's exception for an orchestrated Feature: not ordinary readiness and not an independent review. Reviewed code ends at \`${d.reviewedHead}\`; the range above is accepted unreviewed. It applies to head \`${d.head}\` only: any later push invalidates it and needs a new checkpoint.`] : []),
    ...(d.kind === "maintainer" ? [`- Question for the maintainer: ${line(a.question)} This ticket waits for the answer; independent tickets continue.`] : []),
    ...(d.kind === "finish" ? ["- Ordinary review-pr readiness decides the PR; this decision grants nothing beyond it."] : []),
    "",
    `<!-- ${MARK}`,
    block,
    "-->",
  ].join("\n");
}

const normalize = (text) => String(text).replace(/\r\n/g, "\n").trim();

export function published(record, { ticket: number, id, comment, readBack, head }) {
  const d = (record.tickets[number]?.checkpoints ?? []).find((c) => c.id === id);
  if (!d) throw new Error(`#${number} has no checkpoint decision ${id}`);
  if (d.state !== "intent") throw new Error(`Decision ${id} is already ${d.state}`);
  if (!Number.isSafeInteger(comment) || comment <= 0) throw new Error("--comment must be the posted comment's id");
  if (normalize(readBack) !== normalize(d.body)) throw new Error(`The read-back of comment ${comment} differs from decision ${id}'s body; that comment is not this decision`);
  d.state = "published";
  d.published = { comment, time: new Date().toISOString(), headAtPublish: head };
  record.log.push({ time: d.published.time, event: "checkpoint-published", ticket: number, id, comment, ...(head !== d.head && { headMoved: head }) });
  return { id, comment, ...(head !== d.head && { warning: `the PR's head moved to ${head} after the decision on ${d.head}; ${d.kind === "accept-unreviewed" ? "the acceptance does not apply to it" : "decide again for the new head"}` }) };
}

export function abandon(record, { ticket: number, id, evidence }) {
  const d = (record.tickets[number]?.checkpoints ?? []).find((c) => c.id === id);
  if (!d || d.state !== "intent") throw new Error(`#${number} has no unpublished decision ${id}`);
  if (!present(evidence)) throw new Error("--evidence must say how you know the decision was never posted");
  d.state = "abandoned";
  d.abandoned = { time: new Date().toISOString(), evidence };
  record.log.push({ time: d.abandoned.time, event: "checkpoint-abandoned", ticket: number, id });
}

// The coordinators a run record trusts: its own and every previous one.
export const trustedCoordinators = (record) => [record.coordinator.session, ...(record.previousCoordinators ?? []).map((c) => c.session)];

// --- GitHub and Git ---------------------------------------------------------

export function checkpointClient(repository, checkout) {
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return {
    pull: (pr) => {
      const p = JSON.parse(run("gh", ["pr", "view", String(pr), "--repo", repository, "--json", "state,isDraft,headRefOid,headRefName,statusCheckRollup"]));
      return { state: p.state, isDraft: p.isDraft, head: p.headRefOid, branch: p.headRefName, checks: p.statusCheckRollup.map((c) => ({ name: c.name ?? c.context, state: c.conclusion || c.state || c.status })) };
    },
    comments: (pr) => JSON.parse(run("gh", ["api", "--paginate", "--slurp", `repos/${repository}/issues/${pr}/comments`])).flat(),
  };
}

// The unreviewed range from the reviewed head to the PR's head, read from
// the checkout's object store once the PR head and the base are fetched. The
// range is the branch's first-parent commits. A merge whose other parents are
// all on the base counts as one commit, and its diff is what the merge itself
// changed beyond a clean merge of its parents (git's remerge diff), since the
// base's commits were reviewed in their own PRs. Any other merge brings in
// commits no review saw: they are listed after it, and its diff is
// everything it changed against its first parent.
const defaultFetch = (checkout) => (pr) => execFileSync("git", ["fetch", "-q", "origin", `refs/pull/${pr}/head`, "main"], { cwd: checkout, windowsHide: true });
export function localGit(checkout, { fetch = defaultFetch(checkout), base = () => execFileSync("git", ["rev-parse", "origin/main"], { cwd: checkout, encoding: "utf8", windowsHide: true }).trim() } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const isAncestor = (a, b) => spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: checkout, windowsHide: true }).status === 0;
  const log = (...args) => git("log", "--format=%H%x09%P%x09%s", ...args).split("\n").filter(Boolean).map((l) => { const [sha, parents, ...s] = l.split("\t"); return { sha, parents: parents.split(" "), subject: s.join("\t") }; }).reverse();
  return {
    fetch,
    range(from, to) {
      for (const sha of [from, to]) if (spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: checkout, windowsHide: true }).status !== 0) throw new Error(`Commit ${sha} is not in ${checkout}; fetch the PR head first`);
      const baseSha = base();
      const commits = [], parts = [];
      for (const c of log("--first-parent", `${from}..${to}`)) {
        const merge = c.parents.length > 1;
        const baseMerge = merge && c.parents.slice(1).every((p) => isAncestor(p, baseSha));
        commits.push({ sha: c.sha, subject: c.subject, ...(merge && { merge: baseMerge ? "base" : "other" }) });
        if (merge && !baseMerge) {
          for (const m of log(`${c.parents[0]}..${c.sha}`, "--not", baseSha).filter((m) => m.sha !== c.sha)) commits.push({ sha: m.sha, subject: m.subject, via: c.sha });
          parts.push(`commit ${c.sha}\n${c.subject}\nmerges commits no review saw; its whole change against its first parent:\n\n${git("diff", "--binary", c.parents[0], c.sha)}`);
        } else parts.push(git("show", "--binary", "--format=commit %H%n%s%n", ...(baseMerge ? ["--remerge-diff"] : []), c.sha));
      }
      const diff = parts.join("\n");
      return { from, to, base: baseSha, ancestor: isAncestor(from, to), commits, diff, diffSha256: sha256(diff) };
    },
  };
}

export function gatherEvidence({ record, ticket, pr, client, git }) {
  const pull = client.pull(pr);
  const branchTicket = Number(/(?:^|\/)[a-z]+\/(\d+)-[^/]*$/.exec(pull.branch ?? "")?.[1]);
  if (branchTicket !== ticket) throw new Error(`PR #${pr}'s branch ${pull.branch} is not #${ticket}'s`);
  git.fetch(pr);
  const state = roundState(readJournals(path.join(`${record.checkout}.review-jobs`, `pr-${pr}`)));
  return checkpointEvidence({ pr, state, pull, comments: client.comments(pr), git, trusted: trustedCoordinators(record), record });
}

// --- Command line -----------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv, o = { trust: [] };
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--") || i + 1 >= rest.length) throw new Error(`Unexpected argument ${rest[i]}`);
    const key = rest[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value = rest[++i];
    if (key === "trust") o.trust.push(value);
    else if (Object.hasOwn(o, key)) throw new Error(`--${key} given twice`);
    else o[key] = value;
  }
  return { command, o };
}
const int = (v, name) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`); return n; };
const abs = (v, name) => { if (typeof v !== "string" || !path.isAbsolute(v)) throw new Error(`--${name} must be an absolute path`); return v; };

export function main(argv, { clientFor = checkpointClient, gitFor = localGit } = {}) {
  const { command, o } = parse(argv);
  const withRecord = () => { const file = abs(o.record, "record"), record = readRecord(file); return { file, record, client: clientFor(record.repository, record.checkout), git: gitFor(record.checkout) }; };
  const mutate = (file, fn) => { const { record, output } = updateRecord(file, { expectRevision: Number(o.expectRevision), coordinator: o.coordinator }, fn); return { revision: record.revision, ...output }; };
  switch (command) {
    case "evidence": {
      const { record, client, git } = withRecord();
      const e = gatherEvidence({ record, ticket: int(o.ticket, "ticket"), pr: int(o.pr, "pr"), client, git });
      if (o.diffOut && e.range) fs.writeFileSync(abs(o.diffOut, "diff-out"), e.range.diff);
      return { ...e, range: e.range && { ...e.range, diff: undefined } };
    }
    case "decide": {
      const { file, record, client, git } = withRecord();
      const evidence = gatherEvidence({ record, ticket: int(o.ticket, "ticket"), pr: int(o.pr, "pr"), client, git });
      const assessment = readJson(abs(o.assessment, "assessment"));
      const out = abs(o.out, "out");
      const done = mutate(file, (r) => decide(r, { ticket: int(o.ticket, "ticket"), kind: o.kind, assessment, inspected: o.inspected, evidence }));
      fs.writeFileSync(out, done.body + "\n");
      return { revision: done.revision, id: done.id, body: out, next: `post it with gh pr comment ${evidence.pr} --body-file ${out}, read the comment back to a file, then record published` };
    }
    case "published": {
      const { file, record, client } = withRecord();
      const ticket = int(o.ticket, "ticket"), d = record.tickets[ticket]?.checkpoints?.find((c) => c.id === o.id);
      if (!d) throw new Error(`#${ticket} has no checkpoint decision ${o.id}`);
      const head = client.pull(d.pr).head;
      return mutate(file, (r) => published(r, { ticket, id: o.id, comment: int(o.comment, "comment"), readBack: fs.readFileSync(abs(o.readBack, "read-back"), "utf8"), head }));
    }
    case "abandon": return mutate(abs(o.record, "record"), (r) => abandon(r, { ticket: int(o.ticket, "ticket"), id: o.id, evidence: o.evidence }));
    case "restore":
    case "acceptance-check": {
      let client, trusted = o.trust, record = null;
      if (o.record) { const r = withRecord(); client = r.client; record = r.record; trusted = [...trusted, ...trustedCoordinators(record)]; }
      else client = clientFor(o.repo, abs(o.checkout, "checkout"));
      if (!trusted.length) throw new Error("Name the trusted coordinators with --record or --trust <session> (the Feature's status names them)");
      const pr = int(o.pr, "pr"), decisions = restore(client.comments(pr), { trusted, record });
      return command === "restore" ? { pr, decisions } : { pr, ...acceptanceApplies(decisions, client.pull(pr).head) };
    }
    default: throw new Error("Usage: review-checkpoint.mjs evidence|decide|published|abandon|restore|acceptance-check --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
