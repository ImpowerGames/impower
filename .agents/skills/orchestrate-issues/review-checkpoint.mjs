import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "../../../scripts/review-job-store.mjs";
import { reviewJobFiles } from "../../../scripts/review-job-root.mjs";
import { readJournalRows, reviewAccounting } from "../../../scripts/agent-handoff.mjs";
import { readRepos } from "../../repos.mjs";
import { branchTicket, launchDirOf, readRecord, repositoriesOf, startRepositories, updateRecord } from "./issue-run.mjs";

export const FIRST_CHECKPOINT_ROUND = 3;
export const MAX_REVIEW_ROUNDS = 10;
export const KINDS = ["finish", "repair", "extend", "accept-unreviewed", "maintainer"];
export const ASSESSMENT_FIELDS = ["mechanisms", "regressions", "repairOptions", "residualRisk", "coverage", "nextRoundValue", "rationale", "next"];
export const DISPOSITIONS = ["accepted", "rejected", "covered", "deferred", "none", "open"];
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const PENDING = new Set(["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", "REQUESTED"]);
const MARK = "orchestrate-issues-checkpoint";
const MAX_COMMENT = 65536;
const BLOCK = new RegExp(`<!-- ${MARK}\\r?\\n([\\s\\S]*?)\\r?\\n-->`, "g");
const SHA = /^[0-9a-f]{40}$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const byTime = (a, b) => Date.parse(a.time) - Date.parse(b.time);

function firstLine(file) {
  const fd = fs.openSync(file, "r");
  try { const buffer = Buffer.alloc(4096); const n = fs.readSync(fd, buffer, 0, buffer.length, 0); return buffer.subarray(0, n).toString("utf8").split("\n")[0]; }
  finally { fs.closeSync(fd); }
}
export function readJournals(jobDir) {
  const journalFiles = [], plans = new Map();
  for (const { file, size } of reviewJobFiles(jobDir)) {
    if (size === 0) continue;
    let head;
    try { head = JSON.parse(firstLine(file)); } catch { head = null; }
    if (head?.event === "coordinator") { journalFiles.push(file); continue; }
    if (size > 4 * 2 ** 20) continue;
    let plan;
    try { plan = readJson(file); } catch { continue; }
    if (typeof plan?.journal === "string" && plan.steps && typeof plan.steps === "object") plans.set(path.resolve(plan.journal), plan);
  }
  return journalFiles.sort().flatMap((file) => {
    let rows;
    try { rows = readJournalRows(file); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    return [{ file, rows, plan: plans.get(path.resolve(file)) ?? null }];
  });
}

export function roundState(journals) {
  const accounting = reviewAccounting(journals);
  const blockers = [];
  for (const j of accounting.files) {
    if (j.last === "report-awaiting-post") blockers.push(`${j.file}: its reviewer's report still awaits posting on the review thread`);
    else if (!j.terminal) blockers.push(`${j.file}: the launcher has not finished (last row ${j.last ?? "none"}), so a reviewer may still run`);
    if (j.unconfirmedChild) blockers.push(`${j.file}: its launcher reported a child whose exit is unconfirmed`);
  }
  for (const l of accounting.launches) {
    const { exited, service, drained, running, confirmedAbsent, reserved } = l.evidence;
    const where = `${l.file}: reviewer launch ${l.index} of round ${l.round}`;
    if (service && !drained) blockers.push(`${where} started a delegated execution service whose shutdown is not confirmed (executionDrained ${exited?.executionDrained ?? "missing"}), so its commands may still run${exited ? `; once they have exited, record that with node scripts/agent-handoff.mjs confirm-drained ${l.file}` : ""}`);
    else if (!exited && running && !confirmedAbsent) blockers.push(`${where} has no exited row`);
    else if (!exited && !running && reserved && l.terminal) blockers.push(`${where} reserved a slot but recorded neither its start nor its exit, so a reviewer may still run`);
    l.exitedAt = exited?.time ?? null;
  }
  for (const r of accounting.rounds) {
    if (r.unknownPlans?.length) blockers.push(`round ${r.round}'s planned reviewer count is unknown: no launcher plan here names ${r.unknownPlans.join(", ")} as its journal`);
    else if (!r.complete) blockers.push(r.planned ? `round ${r.round} still plans ${r.pending.join(", ")}` : `round ${r.round} has ${r.completedCount} of its ${r.plannedCount} planned reviewers' completions here${r.counted > r.seen ? ` (its journals count ${r.counted}; the others' journals are elsewhere)` : ""}`);
  }
  const current = accounting.rounds.find((r) => r.round === accounting.completedRound);
  return {
    completedRound: accounting.completedRound, startedRound: accounting.startedRound, reviewedHead: accounting.reviewedHead,
    plannedReviewers: current ? current.planned ?? `${current.plannedCount} unnamed` : null, recovery: accounting.recovery,
    roundsSeen: accounting.rounds.map((r) => r.round), changedPlans: accounting.rounds.flatMap((r) => r.changed.map((c) => ({ round: r.round, file: c.file, planned: r.plan, declared: c.declared }))),
    reports: accounting.completions.flatMap((c) => c.comments.map((comment) => ({ round: c.round, reviewerId: c.reviewerId, attempt: c.attempt, reviewedHead: c.reviewedHead, comment }))),
    launches: accounting.launches, completions: accounting.completions,
    plans: journals.filter((j) => j.plan).map(({ file, plan }) => ({ file, limit: plan.reviewRoundLimit ?? FIRST_CHECKPOINT_ROUND, authorization: plan.extendedReviewAuthorization ?? null })),
    blockers,
  };
}

export const blockHash = (decision) => sha256(JSON.stringify(decision));
const HASH = /^[0-9a-f]{64}$/;
const isSha = (v) => typeof v === "string" && SHA.test(v);
const isHash = (v) => typeof v === "string" && HASH.test(v);
function malformed(d) {
  if (!d || typeof d !== "object" || !KINDS.includes(d.kind)) return "unknown kind";
  if (typeof d.id !== "string" || !d.id || typeof d.coordinator !== "string" || !d.coordinator) return "no id or coordinator";
  if (!Number.isSafeInteger(d.round) || d.round < 0) return "no round";
  if (!isSha(d.head) || (d.reviewedHead !== null && !isSha(d.reviewedHead))) return "no head or reviewed head";
  if (d.range != null && (typeof d.range !== "object" || !isSha(d.range.from) || !isSha(d.range.to) || !Array.isArray(d.range.commits) || !d.range.commits.every(isSha) || !isHash(d.range.diffSha256))) return "a malformed range";
  if (d.kind === "extend" && (!Number.isSafeInteger(d.limit) || d.limit <= d.round || d.limit > MAX_REVIEW_ROUNDS || !present(d.authority))) return "an extension outside the ten-round bound or without its authority";
  if (d.kind === "accept-unreviewed" && (d.range == null || !present(d.authority))) return "an acceptance without its range or authority";
  return null;
}
const RECORD_ONLY = new Set(["state", "body", "bodySha256", "blockSha256", "published", "abandoned"]);
export function restore(comments, { trusted = [], record = null, pr = null } = {}) {
  const held = record ? new Map(Object.values(record.tickets).flatMap((t) => (t.checkpoints ?? []).map((d) => [d.id, d]))) : null;
  const parsed = [];
  for (const c of comments) {
    for (const m of (c.body ?? "").matchAll(BLOCK)) {
      let d;
      try { d = JSON.parse(m[1]); } catch { parsed.push({ comment: c.id, postedAt: c.created_at, malformed: "its block is not JSON", effective: false }); continue; }
      const problem = malformed(d);
      if (problem) { parsed.push({ comment: c.id, postedAt: c.created_at, malformed: problem, effective: false }); continue; }
      const mine = held?.get(d.id);
      const verified = Boolean(mine && mine.state === "published" && mine.published?.comment === c.id && mine.blockSha256 === blockHash(d));
      const edited = Boolean(c.updated_at && c.updated_at !== c.created_at);
      const untrusted = edited ? `comment ${c.id} was edited at ${c.updated_at}, after it was posted`
        : verified ? null
        : mine ? `the run record holds decision ${d.id} ${mine.state === "published" ? "as another comment or with other content" : `${mine.state}, never read back as published`}`
        : record && d.coordinator === record.coordinator.session ? `the run record never published decision ${d.id}, which names its own coordinator`
        : !trusted.includes(d.coordinator) ? `coordinator ${d.coordinator} is not one this restoration trusts`
        : null;
      parsed.push({ ...d, comment: c.id, postedAt: c.created_at, decidedAt: c.created_at, publishedAt: c.created_at, trusted: !untrusted, verified: !untrusted && verified, effective: !untrusted && !verified && !mine, ...(untrusted && { untrusted }) });
    }
  }
  parsed.sort(byPosted);
  if (!record) return parsed;
  const recorded = [];
  for (const ticket of Object.values(record.tickets)) {
    for (const h of ticket.checkpoints ?? []) {
      if ((h.state !== "published" && h.state !== "intent") || (pr !== null && h.pr !== pr)) continue;
      const copy = parsed.find((d) => d.id === h.id && d.comment === h.published?.comment && d.verified);
      const at = h.published ? comments.find((c) => c.id === h.published.comment) : null;
      const timing = { decidedAt: h.time, publishedAt: h.published ? (at?.created_at ?? h.published.time) : null };
      if (copy) { Object.assign(copy, timing, { effective: true }); recorded.push(copy); continue; }
      const decision = Object.fromEntries(Object.entries(h).filter(([key]) => !RECORD_ONLY.has(key)));
      recorded.push({ ...decision, comment: h.published?.comment ?? null, postedAt: at?.created_at ?? null, ...timing, trusted: false, verified: false, effective: true,
        untrusted: h.state === "intent" ? `decision ${h.id} is recorded but not read back as published` : `comment ${h.published.comment} ${at ? "no longer carries exactly" : "is gone, with"} published decision ${h.id}` });
    }
  }
  return [...parsed.filter((d) => !recorded.includes(d)), ...recorded];
}
const byPosted = (a, b) => Date.parse(a.postedAt ?? 0) - Date.parse(b.postedAt ?? 0);
const inEffect = (decisions) => decisions.filter((d) => d.effective);

export function audit(state, decisions) {
  const violations = [];
  const effective = inEffect(decisions);
  const extensions = effective.filter((d) => d.trusted && d.kind === "extend");
  for (let r = FIRST_CHECKPOINT_ROUND + 1; r <= state.startedRound; r++) {
    const first = state.launches.find((l) => l.round === r);
    if (!first) continue;
    if (r > MAX_REVIEW_ROUNDS) { violations.push(`round ${r} exceeds the ${MAX_REVIEW_ROUNDS}-round ceiling`); continue; }
    const launch = Date.parse(first.time);
    const inForce = effective.filter((d) => Date.parse(d.decidedAt ?? d.postedAt) <= launch).at(-1);
    const covers = inForce && inForce.trusted && inForce.kind === "extend" && inForce.round === r - 1 && inForce.limit >= r;
    if (!covers) violations.push(`round ${r} launched at ${first.time} with no published extension, decided at the checkpoint after round ${r - 1}, that covers it${inForce && (inForce.kind !== "extend" || !inForce.trusted) ? `; the decision in force then was ${inForce.id} (${inForce.kind} after round ${inForce.round}${inForce.trusted ? "" : `, untrusted: ${inForce.untrusted}`})` : ""}`);
    else if (!(Date.parse(inForce.publishedAt) <= launch)) violations.push(`round ${r} launched at ${first.time}, before extension ${inForce.id} was published at ${inForce.publishedAt}`);
  }
  for (const c of state.changedPlans ?? []) violations.push(`${c.file} declares round ${c.round}'s planned reviewers as ${c.declared}, but the round was planned with ${c.planned}; a round's planned reviewers never change`);
  const events = [...state.completions.map((c) => ({ ...c, kind: "completed" })), ...state.launches.map((l) => ({ ...l, kind: "launching" }))].sort(byTime);
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

export function acceptanceApplies(decisions, head) {
  const effective = inEffect(decisions);
  const at = effective.findLastIndex((d) => d.trusted && d.kind === "accept-unreviewed");
  if (at < 0) return { applies: false, reason: "the PR records no trusted acceptance of unreviewed corrections" };
  const d = effective[at], later = effective.slice(at + 1);
  if (later.length) return { applies: false, decision: d, reason: `decision ${later.at(-1).id} (${later.at(-1).kind}) after round ${later.at(-1).round} replaced acceptance ${d.id}` };
  if (!d.verified) return { applies: false, decision: d, reason: `acceptance ${d.id} is restored from the PR but not verified by a run record that published it; restore that record, or decide and publish again after reading the PR` };
  if (d.head !== head) return { applies: false, decision: d, reason: `acceptance ${d.id} applies to ${d.head}, but the PR's head is ${head}; a new push needs a new checkpoint` };
  return { applies: true, decision: d, reason: `acceptance ${d.id} applies to head ${head}, with ${d.range.from}..${d.range.to} unreviewed` };
}

const checkResult = (state) => { const s = String(state ?? "").toUpperCase(); return PASSED.has(s) ? "passed" : PENDING.has(s) ? "pending" : "failed"; };

export const threadName = (thread) => `review thread ${thread.repo}#${thread.number}`;
export function checkpointEvidence({ pr, state, pull, comments, git, trusted, record = null, firstRound = FIRST_CHECKPOINT_ROUND, ci = true, where = `PR #${pr}` }) {
  const blockers = [...state.blockers];
  if (pull.state !== "OPEN") blockers.push(`PR #${pr} is ${pull.state}`);
  const posted = new Set(comments.flatMap((c) => [...(c.body ?? "").matchAll(/^#{2,4} Review round (\d+) state\b/gm)].map((m) => Number(m[1]))));
  const missing = [...posted].filter((r) => !state.roundsSeen.includes(r)).sort((a, b) => a - b);
  if (missing.length) blockers.push(`${where === `PR #${pr}` ? "the PR" : where} posts the state of round${missing.length > 1 ? "s" : ""} ${missing.join(", ")}, but no journal here records ${missing.length > 1 ? "their" : "its"} reviews; read those journals where they ran`);
  if (state.completedRound < firstRound) blockers.push(firstRound === FIRST_CHECKPOINT_ROUND ? `round ${state.completedRound} is the last complete round; the first formal checkpoint follows round ${FIRST_CHECKPOINT_ROUND}'s verified fixes` : `no review round is complete here; the PR has no independent review this checkout can show`);
  const reports = state.reports.map((r) => {
    const report = comments.find((c) => c.id === r.comment);
    if (!report) { blockers.push(`report ${r.comment} (round ${r.round}, ${r.reviewerId ?? "reviewer"}) is not on ${where}`); return r; }
    const adjudication = comments.find((c) => c.id !== r.comment && Date.parse(c.created_at) >= Date.parse(report.created_at) && /adjudicat/i.test((c.body ?? "").split("\n")[0]) && !(c.body ?? "").includes(MARK) && (c.body ?? "").includes(String(r.comment)));
    if (!adjudication) blockers.push(`report ${r.comment} (round ${r.round}, ${r.reviewerId ?? "reviewer"}) has no adjudication comment naming it`);
    return { ...r, adjudication: adjudication?.id ?? null, adjudicatedAt: adjudication?.created_at ?? null };
  });
  const checks = pull.checks.map((c) => ({ name: c.name, state: c.state, result: checkResult(c.state) }));
  if (ci && !checks.length) blockers.push(`no CI check has started on ${pull.head}`);
  const failed = checks.filter((c) => c.result === "failed");
  if (ci && failed.length) blockers.push(`CI failed on ${pull.head}: ${failed.map((c) => `${c.name} ${c.state}`).join(", ")}`);
  const range = state.reviewedHead ? git.range(state.reviewedHead, pull.head) : null;
  if (range && !range.ancestor) blockers.push(`the reviewed head ${state.reviewedHead} is not an ancestor of ${pull.head}; the history was rewritten`);
  const decisions = restore(comments, { trusted, record, pr });
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

const present = (value) => typeof value === "string" && value.trim().length > 0;
const line = (text) => String(text).replace(/\s*\r?\n\s*/g, " ").trim();

function checkAssessment(kind, a, evidence) {
  if (!a || typeof a !== "object") throw new Error("--assessment must be a JSON object");
  const missing = ASSESSMENT_FIELDS.filter((f) => !present(a[f]));
  if (missing.length) throw new Error(`The assessment lacks ${missing.join(", ")}; every checkpoint answers each one from the PR's whole review history`);
  if (!["preserved", "changed"].includes(a.agreedBehavior) || !["unchanged", "major-change"].includes(a.architecture)) throw new Error("The assessment must say whether the parent issue's agreed behavior is preserved or changed, and whether the architecture is unchanged or takes a major change");
  if ((a.agreedBehavior === "changed" || a.architecture === "major-change") && kind !== "maintainer") throw new Error("A change to the parent issue's agreed behavior or a major architectural commitment is the maintainer's decision; record kind maintainer with the question");
  if (!Array.isArray(a.findings) || a.findings.some((f) => !Number.isSafeInteger(f?.comment) || !DISPOSITIONS.includes(f.disposition) || !present(f.finding ?? (f.disposition === "none" ? "no findings" : "")))) throw new Error(`The assessment's findings must list every finding as { comment, finding, disposition } with a disposition among ${DISPOSITIONS.join(", ")}`);
  if (kind !== "maintainer") {
    const listed = new Set(a.findings.map((f) => f.comment));
    const unlisted = evidence.reports.filter((r) => !listed.has(r.comment));
    if (unlisted.length) throw new Error(`The assessment's findings omit report${unlisted.length > 1 ? "s" : ""} ${unlisted.map((r) => r.comment).join(", ")}; list each report's findings, or a disposition none for a report with none`);
  }
  const open = a.findings.filter((f) => f.disposition === "open");
  if (open.length && (kind === "finish" || kind === "accept-unreviewed")) throw new Error(`Finding${open.length > 1 ? "s" : ""} ${open.map((f) => `${f.comment} (${line(f.finding)})`).join(", ")} ${open.length > 1 ? "are" : "is"} still open; a known defect is resolved before ${kind}`);
}

export function decide(record, { ticket: number, kind, assessment: a, inspected, evidence: e, now = new Date() }) {
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(", ")}`);
  const ticket = record.tickets[number];
  if (!ticket) throw new Error(`#${number} is not in the run record`);
  if (writersOf(ticket, number).includes(record.coordinator.session)) throw new Error(`${record.coordinator.session} wrote for #${number}, and is now its coordinator; a writer never decides its own review checkpoint`);
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
    version: 1, id: randomUUID().slice(0, 8), kind, issue: record.issue, ticket: number, pr: e.pr, coordinator: record.coordinator.session, runId: record.runId, time: now.toISOString(),
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
    `Decision \`${d.id}\` by coordinator \`${d.coordinator}\` of issue #${d.issue} for #${d.ticket}.${d.authority ? ` Authority: the orchestrate-issues invocation, quoted verbatim from the run record: "${line(d.authority)}"` : ""}`,
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
    ...(d.kind === "accept-unreviewed" ? [`- Verification on the head: ${a.verification.map(line).join("; ")}.`, `- This is the coordinator's exception for an orchestrated parent issue: not ordinary readiness and not an independent review. Reviewed code ends at \`${d.reviewedHead}\`; the range above is accepted unreviewed. It applies to head \`${d.head}\` only: any later push invalidates it and needs a new checkpoint.`] : []),
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

export const writersOf = (ticket, number) => [ticket.owner, ...(ticket.history ?? []).map((h) => h.owner), ticket.pending].flatMap((o) => {
  if (!o) return [];
  const session = o.sessionId ?? o.opened?.sessionId ?? processSession(o, o === ticket.pending, number);
  return [o.handle?.id, o.opened?.session, ...(session ? [session, `local_${session}`] : [])];
}).filter(Boolean);

function processSession(o, pending, number) {
  if (pending ? o.route !== "claude-cli" || !o.artifactParent : o.handle?.kind !== "process") return null;
  const dir = pending ? launchDirOf(o, number) : o.handle.launchDir;
  const out = dir ? path.join(dir, "out.jsonl") : null;
  let unreadable = null;
  if (out && fs.existsSync(out)) {
    try { return initSession(fs.readFileSync(out, "utf8")); } catch (error) { unreadable = `its stream ${out} cannot be read here (${error.code ?? error.message})`; }
  } else if (pending && !fs.existsSync(dir) && (!o.host || o.host === os.hostname())) return null;
  const which = pending ? `pending start ${o.launchId}` : `writer ${o.launchId ?? `process ${o.handle.pid}`}`;
  const where = unreadable ?? (out ? `its stream ${out} cannot be read here` : "no stream was recorded for it");
  const fix = pending ? `settle the start with issue-run.mjs reconcile or withdraw on ${o.host ?? "its host"}` : `record its session with issue-run.mjs writer-session --ticket ${number} --writer ${o.launchId ?? o.handle.pid} --session <id> --evidence <where it was read>`;
  throw new Error(`#${number}'s ${which} has no recorded session and ${where}, so whether its session wrote for the ticket is unknown; ${fix} first`);
}

function initSession(text) {
  for (const line of text.split(/\r?\n/)) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.type !== "system" || row.subtype !== "init") continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.session_id ?? "")) throw new Error("its init line names no session id");
    return row.session_id;
  }
  return null;
}

export function trustPredecessor(record, { ticket: number, session, source }) {
  if (!present(session) || !present(source)) throw new Error("--session must name the predecessor coordinator, and --source where the parent issue names it (its status comment)");
  const ticket = (record.tickets[number] ??= { owner: null, pending: null, history: [], results: [] });
  if (session === record.coordinator.session) throw new Error(`${session} is this coordinator; its own decisions are verified by its record`);
  if (writersOf(ticket, number).includes(session)) throw new Error(`${session} wrote for #${number}; a writer never decides its own review checkpoint`);
  if ((ticket.trustedPredecessors ?? []).some((p) => p.session === session)) throw new Error(`${session} is already a trusted predecessor for #${number}`);
  ticket.trustedPredecessors = [...(ticket.trustedPredecessors ?? []), { session, source, time: new Date().toISOString() }];
  record.log.push({ time: new Date().toISOString(), event: "checkpoint-predecessor", ticket: number, session, source });
}

export const trustedCoordinators = (record, number = null) => {
  const ticket = number === null ? null : record.tickets[number];
  const writers = ticket ? writersOf(ticket, number) : [];
  return [record.coordinator.session, ...(record.previousCoordinators ?? []).map((c) => c.session), ...(ticket?.trustedPredecessors ?? []).map((p) => p.session)].filter((s) => !writers.includes(s));
};

export function checkpointClient(names, checkout, { run = (cmd, args) => execFileSync(cmd, args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 }) } = {}) {
  const { code, thread } = repositoriesOf(names);
  return {
    pull: (pr) => {
      const p = JSON.parse(run("gh", ["pr", "view", String(pr), "--repo", code, "--json", "state,isDraft,headRefOid,headRefName,statusCheckRollup"]));
      return { state: p.state, isDraft: p.isDraft, head: p.headRefOid, branch: p.headRefName, checks: p.statusCheckRollup.map((c) => ({ name: c.name ?? c.context, state: c.conclusion || c.state || c.status })) };
    },
    comments: (pr, ticket) => { const t = thread(pr, ticket); return JSON.parse(run("gh", ["api", "--paginate", "--slurp", `repos/${t.repo}/issues/${t.number}/comments`])).flat(); },
  };
}

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
        const baseMerge = c.parents.length === 2 && isAncestor(c.parents[1], baseSha);
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
  if (branchTicket(pull.branch) !== ticket) throw new Error(`PR #${pr}'s branch ${pull.branch} is not #${ticket}'s`);
  git.fetch(pr);
  const state = roundState(readJournals(path.join(`${record.checkout}.review-jobs`, `pr-${pr}`)));
  const names = repositoriesOf(record);
  return checkpointEvidence({ pr, state, pull, comments: client.comments(pr, ticket), git, trusted: trustedCoordinators(record, ticket), record, ...(names.split && { where: threadName(names.thread(pr, ticket)) }) });
}

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

export function postCommand(record, pr, ticket, file) {
  const names = repositoriesOf(record), thread = names.thread(pr, ticket);
  return names.split ? `gh issue comment ${thread.number} -R ${thread.repo} --body-file ${file}` : `gh pr comment ${pr} --body-file ${file}`;
}

export function main(argv, { clientFor = checkpointClient, gitFor = localGit, repos } = {}) {
  const { command, o } = parse(argv);
  const withRecord = () => { const file = abs(o.record, "record"), record = readRecord(file); return { file, record, client: clientFor(record, record.checkout), git: gitFor(record.checkout) }; };
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
      return { revision: done.revision, id: done.id, body: out, next: `post it with ${postCommand(record, evidence.pr, int(o.ticket, "ticket"), out)}, read the comment back to a file, then record published` };
    }
    case "published": {
      const { file, record, client } = withRecord();
      const ticket = int(o.ticket, "ticket"), d = record.tickets[ticket]?.checkpoints?.find((c) => c.id === o.id);
      if (!d) throw new Error(`#${ticket} has no checkpoint decision ${o.id}`);
      const head = client.pull(d.pr).head;
      return mutate(file, (r) => published(r, { ticket, id: o.id, comment: int(o.comment, "comment"), readBack: fs.readFileSync(abs(o.readBack, "read-back"), "utf8"), head }));
    }
    case "trust-predecessor": return mutate(abs(o.record, "record"), (r) => trustPredecessor(r, { ticket: int(o.ticket, "ticket"), session: o.session, source: o.source }));
    case "abandon": return mutate(abs(o.record, "record"), (r) => abandon(r, { ticket: int(o.ticket, "ticket"), id: o.id, evidence: o.evidence }));
    case "restore":
    case "acceptance-check": {
      let client, trusted = o.trust, record = null;
      const ticket = o.ticket === undefined ? undefined : int(o.ticket, "ticket");
      if (o.record) { const r = withRecord(); client = r.client; record = r.record; trusted = [...trusted, ...trustedCoordinators(record, ticket ?? null)]; }
      else abs(o.checkout, "checkout");
      if (!trusted.length) throw new Error("Name the trusted coordinators with --record or --trust <session> (the parent issue's status names them)");
      client ??= clientFor({ repository: o.repo, ...startRepositories(o.repo, repos ?? readRepos()) }, abs(o.checkout, "checkout"));
      const pr = int(o.pr, "pr"), decisions = restore(client.comments(pr, ticket), { trusted, record, pr });
      return command === "restore" ? { pr, decisions } : { pr, ...acceptanceApplies(decisions, client.pull(pr).head) };
    }
    default: throw new Error("Usage: review-checkpoint.mjs evidence|decide|published|abandon|trust-predecessor|restore|acceptance-check --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
