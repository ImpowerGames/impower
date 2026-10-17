import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { reserveReviewerSlot, releaseReviewerSlot, processIdentity, reviewerSlotStatus } from "./reviewer-slots.mjs";
import { withJob,retryBusy,git,failureDetails,sameIdentity } from './review-job-store.mjs';
import { verifyCodexReviewResult,validateCodexReviewer,verifyReviewerExecutable } from './native-reviewer.mjs';
import {nativeReviewerEnvironment,protectPrivatePath,nativeCodexArgs,codexReviewMode,discardCodexAuthCopy} from './reviewer-security.mjs';
import { resolveReviewer, applyResolvedReviewer, routeVendor } from "./reviewer-defaults.mjs";
import { reviewJobRoot, assertInsideJobRoot } from "./review-job-root.mjs";
import { validateExecutionShape, executionCommands, startExecutionService, executionClientCommand } from "./reviewer-execution.mjs";
import { installFingerprint, installChanges } from "./reviewed-install.mjs";
import { removeProbeCheckouts, snapshotReviewerDirectory } from "./reviewer-probe-cleanup.mjs";
import { readRepos, reviewThread, ticketsRepo } from "../.agents/repos.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => git(cwd,['rev-parse','HEAD']);
const gitStatus = (cwd) => git(cwd,['status','--porcelain']);
export const configuredRoute = (value) => value.replace(/\[[^\]]+\]$/, "");
// Review comments live on the plan's review thread (reviewThread in
// .agents/repos.mjs): the pull request until the cutover, its internal ticket
// after it. A comment is read by id from the thread's repository.
const readReviewComment = (thread, id, cwd) => JSON.parse(execFileSync("gh", ["api", `repos/${thread.repo}/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));
const onThread = (comment, thread) => typeof comment?.issue_url === "string" && comment.issue_url.toLowerCase() === thread.issueUrl.toLowerCase();

export async function verifyReviewComment(id, thread, head, cwd, { readComment = readReviewComment, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 6, notBefore } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let comment;try{comment=readComment(thread,id,cwd);}catch(error){if(attempt===attempts)throw error;}
    if (onThread(comment, thread) && typeof comment.body==='string'&&comment.body.includes(head) && (notBefore===undefined||Number.isFinite(Date.parse(comment.created_at))&&Date.parse(comment.created_at)>=Math.floor(Date.parse(notBefore)/1000)*1000)) return;
    if (attempt < attempts) await wait(1000);
  }
  const where = `${thread.repo}#${thread.number}`;
  throw new Error(notBefore===undefined?`Comment does not verify review thread ${where} and head`:`Comment does not verify review thread ${where}, head and current reviewer launch time ${notBefore}`);
}

const listThreadComments = (thread, since, cwd) => JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${thread.repo}/issues/${thread.number}/comments?per_page=100&since=${encodeURIComponent(since)}`], { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 })).flat();

// A review that exited cleanly without its completion artifact is covered by the one report it posted for the reviewed head since launch.
// Only this launch's private prompt carries reportToken, so a comment containing it is attributable to this reviewer.
export function deriveMissingCompletion(step, thread, head, notBefore, reportToken, cwd, excluded, { listComments = listThreadComments } = {}) {
  if (step.role !== "review") return null;
  if (step.next.length !== 1) throw new Error(`Completion artifact missing and the review declares ${step.next.length} transitions; confirm coverage from the review thread's comments`);
  const floor = Math.floor(Date.parse(notBefore) / 1000) * 1000;
  const reports = listComments(thread, notBefore, cwd).filter((comment) => Number.isSafeInteger(comment.id) && !excluded.has(comment.id) && onThread(comment, thread) && typeof comment.body === "string" && comment.body.includes(reportToken) && comment.body.includes(head) && Date.parse(comment.created_at) >= floor);
  if (!reports.length) return null;
  if (reports.length > 1) throw new Error(`Completion artifact missing and ${reports.length} reports name head ${head} since launch (${reports.map((comment) => comment.id).join(", ")}); confirm which one this reviewer posted`);
  return { head, next: step.next[0], commentIds: [reports[0].id], summary: `Derived from posted report ${reports[0].id}; no completion artifact was found at the launcher's path` };
}

export function checkReviewRound(round, completedRound, finalCorrections, reviewRoundLimit = 3) {
  if (!Number.isInteger(round) || round < 1 || round > reviewRoundLimit || round < completedRound) throw new Error(`Review round must be 1..${reviewRoundLimit} and preserve the completed round count`);
  if (round > completedRound + 1) throw new Error("Review round cannot skip ahead of the recorded count");
  if (finalCorrections && completedRound >= reviewRoundLimit) throw new Error(`Final corrections after round ${reviewRoundLimit} require explicit user direction for further review; no automatic review`);
}

// A round's reviewers run one at a time and the writer may correct between them,
// so a reviewer the round still plans may launch on a head the last one did not see.
// `reviewers` is the planned count or the planned reviewer ids. With named
// reviewers the completed count holds distinct planned reviewers, so a retried
// attempt never spends another reviewer's place.
export function plannedReviewerPending(round, completedRound, completedRoundReviews, reviewers) {
  const planned = Array.isArray(reviewers) ? reviewers.length : reviewers;
  return round === completedRound && Number.isInteger(completedRoundReviews) && Number.isInteger(planned) && completedRoundReviews < planned;
}

const reviewerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// A step naming its planned reviewers names its own place among them; a retry
// of that place carries a higher attempt and keeps the same reviewerId.
function validateReviewerIdentity(name, step) {
  const named = Array.isArray(step?.reviewers);
  if (named && (step.reviewers.length < 1 || step.reviewers.length > 3 || !step.reviewers.every((id) => typeof id === "string" && reviewerIdPattern.test(id)) || new Set(step.reviewers).size !== step.reviewers.length)) throw new Error(`Step ${name} reviewers must be its round's planned reviewer count from 1 through 3, or its 1 to 3 distinct planned reviewer ids`);
  if (step?.reviewerId === undefined && step?.attempt === undefined) {
    if (named) throw new Error(`Step ${name} names its round's planned reviewers, so it needs reviewerId, the planned reviewer it launches`);
    return;
  }
  if (!named) throw new Error(`Step ${name} reviewerId and attempt need reviewers listing the round's planned reviewer ids`);
  if (!step.reviewers.includes(step.reviewerId)) throw new Error(`Step ${name} reviewerId must be one of its planned reviewers ${step.reviewers.join(", ")}; a reviewer added after the round was planned needs a new round`);
  if (step.attempt !== undefined && (!Number.isSafeInteger(step.attempt) || step.attempt < 1)) throw new Error(`Step ${name} attempt must be a positive integer`);
}

// Validated completions of the completed round, keyed by planned reviewer id,
// each holding the attempt that completed.
function validateCompletedRoundReviewers(config) {
  const record = config.completedRoundReviewers, planned = config.plannedRoundReviewers;
  // A count-form round journals both as null; null and omission mean the same.
  if (record == null && planned == null) return;
  if (!Array.isArray(planned) || planned.length < 1 || planned.length > 3 || !planned.every((id) => typeof id === "string" && reviewerIdPattern.test(id)) || new Set(planned).size !== planned.length) throw new Error("Supply plannedRoundReviewers from the journal with completedRoundReviewers: the completed round's 1 to 3 distinct planned reviewer ids");
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Supply completedRoundReviewers from the journal as an object of planned reviewer ids and their completed attempts");
  const entries = Object.entries(record);
  if (!entries.length || !entries.every(([id, attempt]) => planned.includes(id) && Number.isSafeInteger(attempt) && attempt >= 1)) throw new Error("completedRoundReviewers maps each completed reviewer id of plannedRoundReviewers to its positive completed attempt");
  if (config.completedRoundReviews !== entries.length) throw new Error("Supply completedRoundReviewers with completedRoundReviews equal to its number of reviewers, both from the journal's latest completed row");
}

// Refuses a launch whose identity the round's record cannot place: a named
// reviewer without the round's record, planned reviewers that differ from the
// ones the round started with, a retry that does not advance the attempt, or a
// mix of named and unnamed reviewers in one round.
export function checkReviewerPlace(step, completedRound, completedRoundReviewers, plannedRoundReviewers) {
  if (step.round !== completedRound) return;
  if (step.reviewerId === undefined) {
    if (completedRoundReviewers) throw new Error(`Round ${step.round} records reviewers ${Object.keys(completedRoundReviewers).join(", ")}; its later reviewers need reviewerId and the planned reviewer ids`);
    return;
  }
  if (!completedRoundReviewers || !plannedRoundReviewers) throw new Error(`Supply completedRoundReviewers, plannedRoundReviewers and completedRoundReviews from the journal: reviewer ${step.reviewerId} in round ${step.round} needs the round's record to know whether it retries one`);
  if (step.reviewers.join("\n") !== plannedRoundReviewers.join("\n")) throw new Error(`Round ${step.round} planned reviewers ${plannedRoundReviewers.join(", ")}; the step's planned reviewers ${step.reviewers.join(", ")} differ, and a round's planned reviewers cannot change once it has started`);
  const previous = Object.hasOwn(completedRoundReviewers, step.reviewerId) ? completedRoundReviewers[step.reviewerId] : undefined;
  if (previous !== undefined && (step.attempt ?? 1) <= previous) throw new Error(`Reviewer ${step.reviewerId} completed attempt ${previous} in round ${step.round}; a retry needs a higher attempt`);
}

// --- Reading launch journals ------------------------------------------------

// A journal's rows, one JSON object per line.
export function readJournalRows(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`${file} line ${i + 1} is not JSON`); }
  });
}

// What a journal records about one launch: its exit and whether a delegated
// execution service drained, its running and identified rows, a child
// confirmed absent, a slot reservation, and the launch's last row. Lock
// recovery and the round accounting below judge a launch's end from these
// facts, each with its own policy.
export function launchEvidence(rows, index) {
  const of = rows.filter((row) => row.index === index);
  const find = (event) => of.find((row) => row.event === event) ?? null;
  return { exited: find("exited"), service: find("execution-service"), running: find("running"), identified: find("identified"), confirmedAbsent: Boolean(find("confirmed-absent")), reserved: Boolean(find("reserved")), last: of.at(-1) ?? null };
}

const TERMINAL_ROWS = new Set(["finished", "blocked", "report-posted"]);

// Round accounting across the launch journals of one PR's review jobs, by
// the rules the launcher enforces on a recovery plan. Each review launch
// carries its round, its reviewer place (reviewerId and attempt), the plan
// it declared and its evidence; each validated completion its reviewed head
// and reports, including a report the coordinator posted for it. A round's
// plan (its named reviewers, or the count its step declares) is fixed at the
// round's first launch, and a later declaration of another is recorded as a
// change; the round is complete once each named reviewer has a completion,
// or once the completions present number the declared count. `recovery`
// holds the plan fields a recovery plan carries from the latest validated
// completion: completedReviewRound, reviewedHead, completedRoundReviews,
// completedRoundReviewers and plannedRoundReviewers.
export function reviewAccounting(journals) {
  const launches = [], completions = [], files = [];
  const byTime = (a, b) => Date.parse(a.time) - Date.parse(b.time);
  for (const { file, rows, plan } of journals) {
    const last = rows.at(-1)?.event ?? null;
    files.push({ file, last, terminal: TERMINAL_ROWS.has(last), unconfirmedChild: rows.some((row) => row.event === "blocked" && /unconfirmed/.test(row.reason ?? "")) });
    const launchOf = new Map(), completionOf = new Map();
    for (const row of rows) {
      if (row.event === "launching" && row.role === "review") {
        const declared = plan?.steps && Object.hasOwn(plan.steps, row.step) ? plan.steps[row.step]?.reviewers : undefined;
        const launch = { file, index: row.index, time: row.time, round: row.round, reviewerId: row.reviewerId ?? null, attempt: row.attempt ?? 1, plannedReviewers: row.plannedReviewers ?? null, plannedCount: !plan ? null : Array.isArray(declared) ? declared.length : Number.isSafeInteger(declared) ? declared : 1, evidence: launchEvidence(rows, row.index), terminal: TERMINAL_ROWS.has(last) };
        launch.head = launch.evidence.running?.head ?? null;
        launchOf.set(row.index, launch);
        launches.push(launch);
      }
      if (row.event === "completed" && launchOf.has(row.index)) {
        const launch = launchOf.get(row.index);
        const completion = { file, time: row.time, round: launch.round, reviewerId: row.reviewerId ?? null, attempt: row.attempt ?? 1, reviewedHead: row.reviewedHead, comments: [...(row.commentIds ?? [])], completedRoundReviews: row.completedRoundReviews ?? null, plannedCount: launch.plannedCount, plannedRoundReviewers: row.plannedRoundReviewers ?? null, pendingReviewers: row.pendingReviewers ?? null };
        completionOf.set(row.index, completion);
        completions.push(completion);
      }
      if (row.event === "report-posted" && completionOf.has(row.index) && Number.isSafeInteger(row.commentId)) completionOf.get(row.index).comments.push(row.commentId);
    }
  }
  launches.sort(byTime);
  completions.sort(byTime);
  const declares = (e) => e.plannedRoundReviewers ?? e.plannedReviewers;
  // A count-form launch whose plan is not here has an unknown count, which
  // neither fixes nor changes the round's plan, and leaves it incomplete.
  const planOf = (e) => (declares(e) ? declares(e).join(", ") : e.plannedCount === null ? null : `${e.plannedCount} unnamed`);
  const rounds = new Map();
  for (const e of [...launches.map((l) => ({ ...l, launch: true })), ...completions].sort(byTime)) {
    const r = rounds.get(e.round) ?? { round: e.round, planned: declares(e) ?? null, plannedCount: e.plannedCount, plan: planOf(e), completedReviewers: {}, counted: 0, seen: 0, complete: false, changed: [] };
    rounds.set(e.round, r);
    if (r.plan === null && planOf(e) !== null) { r.plan = planOf(e); r.plannedCount = e.plannedCount; }
    else if (planOf(e) !== null && planOf(e) !== r.plan) r.changed.push({ file: e.file, declared: planOf(e) });
    if (e.plannedCount === null && !declares(e)) r.unknownPlans = [...new Set([...(r.unknownPlans ?? []), e.file])];
    if (e.launch) continue;
    // A reviewer id may name an inherited property (constructor, toString),
    // so the completed attempt is read as an own property only, as
    // checkReviewerPlace reads it.
    if (e.reviewerId) r.completedReviewers[e.reviewerId] = Math.max(Object.hasOwn(r.completedReviewers, e.reviewerId) ? r.completedReviewers[e.reviewerId] : 0, e.attempt);
    r.counted = Math.max(r.counted, e.completedRoundReviews ?? 0);
    r.seen++;
    r.complete = r.planned ? r.planned.every((id) => Object.hasOwn(r.completedReviewers, id)) : r.plannedCount !== null && Math.min(r.counted, r.seen) >= r.plannedCount;
    e.complete = r.complete;
  }
  for (const r of rounds.values()) {
    r.pending = r.planned ? r.planned.filter((id) => !Object.hasOwn(r.completedReviewers, id)) : null;
    r.completedCount = r.planned ? Object.keys(r.completedReviewers).length : Math.min(r.counted, r.seen);
  }
  const completedRound = Math.max(0, ...completions.map((c) => c.round));
  const latest = completions.filter((c) => c.round === completedRound).at(-1) ?? null;
  const current = rounds.get(completedRound);
  return {
    files, launches, completions, rounds: [...rounds.values()].sort((a, b) => a.round - b.round),
    completedRound, startedRound: Math.max(0, ...launches.map((l) => l.round)), reviewedHead: latest?.reviewedHead ?? null,
    recovery: { completedReviewRound: completedRound, reviewedHead: latest?.reviewedHead ?? null, completedRoundReviews: current ? current.completedCount : null, completedRoundReviewers: current?.planned ? current.completedReviewers : null, plannedRoundReviewers: current?.planned ?? null },
  };
}

export function verifyNativeReviewResult(output,format='claude-json') {
  if(format==='codex-jsonl')return verifyCodexReviewResult(output);
  if(format!=='claude-json')throw new Error('Unsupported native reviewer result transport');
  if(fs.statSync(output).size>16*1024*1024)throw new Error('Native reviewer result exceeds bounded inspection');
  const text=fs.readFileSync(output,'utf8').trim();
  let result;try{result=JSON.parse(text.split('\n').at(-1));}catch{throw new Error('Missing final native reviewer JSON result');}
  if(result.type!=='result'||result.subtype!=='success'||result.is_error!==false||result.stop_reason!=='end_turn')throw new Error('Native reviewer failed or interrupted');
}

export function validateReviewRecovery(config) {
  const limit=config.reviewRoundLimit??3;
  if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('reviewRoundLimit must be an integer from 1 through 10');
  if(limit>3&&(typeof config.extendedReviewAuthorization!=='string'||!config.extendedReviewAuthorization.trim()))throw new Error('Rounds beyond 3 require explicit user authorization in extendedReviewAuthorization');
  if(limit<=3&&config.extendedReviewAuthorization!==undefined)throw new Error('extendedReviewAuthorization is only valid when reviewRoundLimit exceeds 3');
  if(!Number.isInteger(config.completedReviewRound)||config.completedReviewRound<0||config.completedReviewRound>limit)throw new Error(`Supply completedReviewRound from 0 through ${limit}, including on recovery`);
  if((config.completedReviewRound===limit&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections!==undefined&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections&&config.completedReviewRound<3))throw new Error(`Supply the journal's boolean finalCorrections (valid at round 3 or later); recovery at the configured limit ${limit}, including a pending serial reviewer, requires it. Carry completedReviewRound, reviewedHead and completedRoundReviews forward too; unchanged HEAD does not establish correction state`);
  if(config.completedReviewRound>0&&!/^[a-f0-9]{40}$/.test(config.reviewedHead??''))throw new Error('Supply reviewedHead from the journal when recovering a review round');
  if(config.completedRoundReviews!=null&&(!Number.isInteger(config.completedRoundReviews)||config.completedRoundReviews<1||config.completedReviewRound<1))throw new Error('Supply completedRoundReviews from the journal as a positive integer, and only with a nonzero completedReviewRound');
  validateCompletedRoundReviewers(config);
}

const planFields = ["pr", "ticket", "first", "completedReviewRound", "reviewedHead", "completedRoundReviews", "completedRoundReviewers", "plannedRoundReviewers", "finalCorrections", "reviewRoundLimit", "extendedReviewAuthorization", "slotWaitSeconds", "reportPosting"];

// A review step's lens is the value scripts/build-review-prompt.mjs received.
// An author-experience lens needs the editor, so a lens step that declares no
// editor operation gains the author grant here, before the plan is validated.
export const authorExperienceLenses = ["author-experience", "author-experience (short)"];
export const authorEditorGrant = Object.freeze({ id: "author", kind: "editor", maxRequests: 20, timeoutSeconds: 600 });
export function applyLensEditorGrant(config) {
  for (const [name, step] of Object.entries(config.steps ?? {})) {
    if (!step || typeof step !== "object" || step.lens === undefined) continue;
    if (step.role !== "review") throw new Error(`Step ${name} lens is only supported on review steps`);
    if (typeof step.lens !== "string" || !step.lens.trim()) throw new Error(`Step ${name} lens must be the non-empty lens its prompt was built with`);
    if (typeof step.prompt === "string" && fs.existsSync(step.prompt)) {
      const heading = /### Adversarial review — (.+?) \(<MODEL>\)/.exec(fs.readFileSync(step.prompt, "utf8"))?.[1];
      if (heading !== undefined && heading !== step.lens) throw new Error(`Step ${name} lens ${step.lens} disagrees with its prompt heading ${heading}`);
    }
    const lenses = step.lens.split(",").map((lens) => lens.trim());
    if (!lenses.some((lens) => authorExperienceLenses.includes(lens))) continue;
    if (step.execution !== undefined && !Array.isArray(step.execution)) continue;
    if ((step.execution ?? []).some((op) => op?.kind === "editor")) continue;
    step.execution = [...(step.execution ?? []), { ...authorEditorGrant }];
  }
}

// The coordinator environment runs the delegated editor, so its driver
// preflight must pass before a reviewer is spent discovering it cannot.
export async function driverPreflight({ cwd, env }) {
  const driver = path.join(cwd, ".agents", "skills", "drive-web-editor", "driver.mjs");
  return await new Promise((resolve) => {
    let output = "";
    const child = spawn(process.execPath, [driver, "preflight"], { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => resolve({ passed: false, failing: [`driver preflight did not start: ${error.message}`] }));
    child.on("close", (code) => {
      const failing = output.split(/\r?\n/).filter((line) => /^FAIL\b/.test(line.trim())).map((line) => line.trim());
      resolve({ passed: code === 0 && !failing.length, failing: failing.length ? failing : code === 0 ? [] : [`driver preflight exited ${code}`] });
    });
  });
}

// Checks the fields the chain reads only later, so a malformed plan is refused
// before any lock, journal, slot or child exists.
export function validatePlanShape(config) {
  if (!Number.isSafeInteger(config.pr) || config.pr < 1) throw new Error("Supply the top-level pr as a positive integer PR number");
  if (!config.steps || typeof config.steps !== "object" || Array.isArray(config.steps) || !Object.keys(config.steps).length) throw new Error("Supply steps as an object of named steps");
  if (typeof config.first !== "string" || !config.first) throw new Error("Supply the top-level first as the name of a step");
  if (!Object.hasOwn(config.steps, config.first)) throw new Error(`Unknown step: ${config.first}`);
  for (const [name, step] of Object.entries(config.steps)) {
    validateExecutionShape(step);
    const misplaced = planFields.filter((field) => Object.hasOwn(step ?? {}, field));
    if (misplaced.length) throw new Error(`Move ${misplaced.join(", ")} from step ${name} to the top level of the plan; only round and reviewers, not completedReviewRound, belong on a review step`);
    if (step?.reviewers !== undefined && !Array.isArray(step.reviewers) && (!Number.isInteger(step.reviewers) || step.reviewers < 1 || step.reviewers > 3)) throw new Error(`Step ${name} reviewers must be its round's planned reviewer count, an integer from 1 through 3, or its planned reviewer ids`);
    validateReviewerIdentity(name, step);
  }
  // A reviewer without GitHub access leaves its report for the coordinator to
  // post, which the chain cannot await, so such a plan holds one review.
  if (config.reportPosting !== undefined) {
    if (config.reportPosting !== "coordinator") throw new Error('reportPosting must be "coordinator" when set; omit it when the reviewer posts its own report');
    const steps = Object.values(config.steps);
    if (config.maxSteps !== 1 || steps.length !== 1 || steps[0]?.role !== "review" || steps[0].nativeResult !== "codex-jsonl" || JSON.stringify(steps[0].next) !== "[null]") throw new Error('A coordinator-posted report needs a plan of one native Codex review: maxSteps 1, a single review step with nativeResult "codex-jsonl" and next [null]');
  }
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const normalizeBody = (text) => text.replace(/\r\n/g, "\n").trimEnd();

// The reviewer's final message is its report when the coordinator posts it.
export function coordinatorReport(file, head, reportToken) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch (error) { throw new Error(`Reviewer report missing at ${file}: ${error.message}`); }
  // The token must be the report's last line: a quoted prompt or an
  // interrupted answer can contain it without the report being complete.
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length || !text.includes(head) || lines.at(-1) !== reportToken) throw new Error(`Reviewer report at ${file} must name reviewed head ${head} and end with its report token`);
  return { report: file, reportSha256: sha256(text) };
}

// A coordinator whose host appends an attribution footer to every comment
// posts the report followed by a rule and one "Generated by" line; nothing
// else may follow the report.
const attributionFooter = /\n+---\n_Generated by [^\n]*_$/;

// What a validated review completion makes of the round accounting its launch
// started from: the reviewer's place in its round (a retried attempt replaces
// its reviewer's place instead of taking another), the round and head it
// completes, the planned reviewers still pending, and whether final
// corrections remain accepted. The run loop and record-report both write a
// `completed` row from this, so a completion recorded after the fact carries
// the same fields as one the launcher wrote at the reviewer's exit.
export function completeReviewAccounting(before, step, head) {
  const newRound = step.round > before.completedRound;
  let { completedRoundReviews, completedRoundReviewers, plannedRoundReviewers } = before;
  if (step.reviewerId !== undefined && (newRound || completedRoundReviewers)) {
    completedRoundReviewers = { ...(newRound ? {} : completedRoundReviewers), [step.reviewerId]: step.attempt ?? 1 };
    plannedRoundReviewers = step.reviewers;
    completedRoundReviews = Object.keys(completedRoundReviewers).length;
  } else {
    completedRoundReviewers = null;
    plannedRoundReviewers = null;
    completedRoundReviews = newRound ? 1 : completedRoundReviews === null ? null : completedRoundReviews + 1;
  }
  const finalCorrections = newRound || head !== before.reviewedHead ? false : before.finalCorrections;
  const pendingReviewers = plannedRoundReviewers ? plannedRoundReviewers.filter((id) => !Object.hasOwn(completedRoundReviewers, id)) : undefined;
  return { completedRound: step.round, reviewedHead: head, completedRoundReviews, completedRoundReviewers, plannedRoundReviewers, ...(pendingReviewers ? { pendingReviewers } : {}), finalCorrections };
}

// The reason the run loop blocks a review that exited cleanly with a
// completion artifact naming no posted comment: the reviewer wrote its report
// but could not post it (the shared GitHub GraphQL quota was exhausted). Its
// journal has no `completed` row, and record-report completes it once the
// coordinator posts that report.
const NEEDS_POSTED_IDS = "Review/adjudication needs posted comment IDs";

// A journal that ended `blocked` on NEEDS_POSTED_IDS after a clean exit, read
// as the review it holds: the launch's report file (the --output-last-message
// argument the launch recorded), its completion artifact and the accounting
// state it started from. Anything else about the journal is refused.
function blockedReview(rows, blocked) {
  if (blocked.reason !== NEEDS_POSTED_IDS) throw new Error(`Journal does not end awaiting a coordinator-posted report, and its blocked reason is not "${NEEDS_POSTED_IDS}"`);
  const launching = rows.findLast((row) => row.event === "launching");
  if (!launching || launching.role !== "review" || typeof launching.reportToken !== "string" || !Number.isSafeInteger(launching.index)) throw new Error("Blocked journal records no review launch with a report token");
  const { index } = launching;
  const exited = rows.find((row) => row.event === "exited" && row.index === index);
  if (!exited || exited.code !== 0 || typeof exited.time !== "string") throw new Error(`Launch ${index} has no confirmed clean exit (an exited row with code 0), so its report cannot stand`);
  if (rows.some((row) => row.event === "completed" && row.index === index)) throw new Error(`Launch ${index} already has a completed row`);
  const args = Array.isArray(launching.args) ? launching.args : [];
  const at = args.findIndex((arg) => ["--output-last-message", "-o"].includes(arg));
  if (at < 0 || typeof args[at + 1] !== "string") throw new Error(`Launch ${index} recorded no reviewer report file (no --output-last-message argument), so no saved report is attributable to it`);
  const report = coordinatorReport(args[at + 1], launching.head, launching.reportToken);
  let done;
  try { done = read(launching.completion); }
  catch (error) { throw new Error(`Launch ${index} completion artifact at ${launching.completion} is unreadable: ${error.message}`); }
  if (done?.head !== launching.head || !Array.isArray(done.commentIds) || done.commentIds.length || typeof done.summary !== "string" || !done.summary.trim() || !(done.next === null || typeof done.next === "string")) throw new Error(`Launch ${index} completion artifact at ${launching.completion} must name head ${launching.head}, no comment IDs, a summary and its transition`);
  const before = { completedRound: launching.completedRound, reviewedHead: launching.reviewedHead ?? null, completedRoundReviews: launching.completedRoundReviews ?? null, completedRoundReviewers: launching.completedRoundReviewers ?? null, plannedRoundReviewers: launching.plannedRoundReviewers ?? null, finalCorrections: launching.finalCorrections ?? false };
  const step = { round: launching.round, reviewerId: launching.reviewerId, attempt: launching.attempt, reviewers: launching.plannedReviewers };
  // The completion is dated at the reviewer's exit, when the launcher would
  // have written it, so a reviewer that later completed on a corrected head
  // keeps its place as the round's latest; recordedAt says when the row was
  // written. The comment is counted from the report-posted row, as for a
  // coordinator-posted report, and named here so a retry after an
  // interrupted record cannot substitute another comment.
  const completed = { time: exited.time, event: "completed", index, step: launching.step, head: done.head, next: done.next, commentIds: [], summary: done.summary, ...(step.reviewerId !== undefined ? { reviewerId: step.reviewerId, attempt: step.attempt ?? 1 } : {}), ...completeReviewAccounting(before, step, launching.head), postedBy: "coordinator" };
  return { pending: { index, step: launching.step, head: launching.head, ...report }, completed };
}

// A read-back's text in the encoding a shell redirect wrote it: UTF-8, with or
// without a byte order mark, or UTF-16 with one (Windows PowerShell 5.1's
// default for `>`).
function readBackText(file) {
  const bytes = fs.readFileSync(file);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2)).swap16().toString("utf16le");
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Records the comment the coordinator posted for a reviewer that could not
// post its own report: one without GitHub access (its journal ends
// `report-awaiting-post`), or one whose post failed after a clean exit (its
// journal ends `blocked` on NEEDS_POSTED_IDS, and takes the `completed` row
// the launcher could not write). The read-back is the posted comment as
// GitHub's REST API returns it, read by id from the review thread's
// repository; a coordinator without a gh login (a cloud session) reads it
// through its own integration, so the command takes the read-back rather than
// reading GitHub. Its `id` must be the comment ID, its `issue_url` the review
// thread the journal's coordinator row names, and its body one line saying it
// is posted on the reviewer's behalf, a blank line, and the reviewer's report
// verbatim, with at most the host's attribution footer after it. A journal
// written before the launcher recorded a thread takes a comment on an issue of
// the code repository while the switch is off. A journal whose last rows are
// this command's own rows for this same comment (its `finished` row was
// never written) takes the missing rows without a second post.
export function recordCoordinatorReport(journalFile, commentId, readBackFile, { repos = readRepos() } = {}) {
  if (!/^[1-9][0-9]*$/.test(String(commentId)) || !Number.isSafeInteger(Number(commentId))) throw new Error("Supply the posted comment's numeric ID");
  const rows = fs.readFileSync(journalFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  // The row the record rests on, and the rows this command wrote after it
  // before an interruption: `report-posted` after an awaiting row, or
  // `completed` then `report-posted` after a blocked row.
  const anchorAt = rows.findLastIndex((row) => row.event === "report-awaiting-post" || row.event === "blocked");
  const anchor = anchorAt < 0 ? undefined : rows[anchorAt];
  const written = anchorAt < 0 ? [] : rows.slice(anchorAt + 1);
  const expected = anchor?.event === "blocked" ? ["completed", "report-posted"] : ["report-posted"];
  if (!anchor || written.length > expected.length || !written.every((row, i) => row.event === expected[i])) throw new Error("Journal does not end awaiting a coordinator-posted report");
  let pending, completed;
  if (anchor.event === "blocked") ({ pending, completed } = blockedReview(rows.slice(0, anchorAt + 1), anchor));
  else pending = anchor;
  const report = fs.readFileSync(pending.report, "utf8");
  if (sha256(report) !== pending.reportSha256) throw new Error(`Reviewer report at ${pending.report} changed since the launcher recorded it`);
  let posted;
  try { posted = JSON.parse(readBackText(readBackFile)); }
  catch (error) { throw new Error(`The read-back ${readBackFile} must be the posted comment as GitHub's REST API returns it, with its id, issue_url and body (gh api repos/<repository>/issues/comments/<id>): ${error.message}`); }
  if (typeof posted?.body !== "string") throw new Error(`The read-back ${readBackFile} has no comment body; supply the comment as GitHub's REST API returns it, with its id, issue_url and body`);
  const body = normalizeBody(posted.body);
  const content = normalizeBody(body.replace(attributionFooter, ""));
  const split = content.indexOf("\n\n");
  const prefix = split > 0 ? content.slice(0, split) : "";
  if (!prefix || prefix.includes("\n") || !/behalf/i.test(prefix) || content.slice(split + 2) !== normalizeBody(report)) throw new Error("The posted comment must be one line saying it is posted on the reviewer's behalf and why, a blank line, then the reviewer's report verbatim");
  const record = { event: "report-posted", index: pending.index, step: pending.step, head: pending.head, commentId: Number(commentId), postedBy: "coordinator", readBackSha256: sha256(body) };
  // Every row this command writes names the comment and read-back, so the
  // first row to survive an interruption fixes them for the retry.
  const recorded = written.findLast((row) => row.event === "report-posted" || row.event === "completed");
  if (recorded && (recorded.commentId !== record.commentId || recorded.readBackSha256 !== record.readBackSha256)) throw new Error(`Journal already records comment ${recorded.commentId} for this report; a different comment or read-back cannot complete it`);
  if (Number(posted.id) !== record.commentId) throw new Error(`The read-back is comment ${posted.id ?? "with no id"}, not comment ${commentId}`);
  const thread = rows.find((row) => row.event === "coordinator")?.thread;
  if (thread !== undefined) {
    if (typeof thread?.repo !== "string" || !Number.isSafeInteger(thread.number) || typeof thread.issueUrl !== "string") throw new Error("Journal's coordinator row names a malformed review thread; inspect the journal by hand");
    if (!onThread(posted, thread)) throw new Error(`Comment ${commentId} is on ${posted.issue_url ?? "no issue"}, not review thread ${thread.repo}#${thread.number}; post the report there`);
  } else {
    // A launcher that predates review threads posted on the pull request and
    // recorded no thread, so its journal takes a comment on an issue of the
    // code repository while that repository holds the review conversation.
    if (ticketsRepo(repos) !== repos.code) throw new Error(`Journal's coordinator row names no review thread: it was written before the launcher recorded one, when reviews were posted on the pull request, and with the cutover switch on its report cannot be recorded against ${repos.internal}`);
    const prefix = `https://api.github.com/repos/${repos.code}/issues/`;
    if (typeof posted.issue_url !== "string" || !posted.issue_url.toLowerCase().startsWith(prefix.toLowerCase()) || !/^[1-9][0-9]*$/.test(posted.issue_url.slice(prefix.length))) throw new Error(`Comment ${commentId} is on ${posted.issue_url ?? "no issue"}, not a pull request in ${repos.code}, where this journal's launcher posted reviews; post the report there`);
  }
  const now = new Date().toISOString();
  const missing = [
    ...(completed && !written.some((row) => row.event === "completed") ? [{ ...completed, recordedAt: now, commentId: record.commentId, readBackSha256: record.readBackSha256 }] : []),
    ...(written.some((row) => row.event === "report-posted") ? [] : [record]),
    { event: "finished" },
  ];
  const fd = fs.openSync(journalFile, "a");
  try {
    for (const row of missing) {
      fs.writeSync(fd, JSON.stringify({ time: now, ...row }) + "\n");
      fs.fsyncSync(fd);
    }
  } finally { fs.closeSync(fd); }
}

// Releases a worktree lock whose coordinator is gone. The lock is removed only
// when it was written on this host, its coordinator's recorded OS start
// identity is absent or reused, and its journal shows no launched child that
// may still run; every other state, including a lock or journal it cannot
// parse, refuses and leaves the lock in place. A copy of the lock is kept in
// the job directory beside the journal before the lock is removed. Nothing is
// signalled and nothing but the verified lock file is deleted. Recovery holds
// the exclusive marker `<lock>.recovery` throughout, which excludes a second
// recovery and makes a coordinator that takes the lock meanwhile give it up.
export function recoverHandoffLock(worktree, { identifyProcess = processIdentity, host = os.hostname() } = {}) {
  const lock = git(fs.realpathSync.native(worktree), ["rev-parse", "--path-format=absolute", "--git-path", "agent-handoff.lock"]);
  const recovery = lockRecoveryMarker(lock);
  let marker;
  try { marker = fs.openSync(recovery, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Recovery marker exists at ${recovery}: another recovery is running or was interrupted; inspect its owner before removing it`);
    throw error;
  }
  try {
    fs.writeSync(marker, JSON.stringify({ pid: process.pid, processIdentity: identifyProcess(process.pid), host, startedAt: new Date().toISOString(), lock }) + "\n");
    fs.fsyncSync(marker);
    return recoverMarkedLock(lock, identifyProcess, host);
  } catch (error) {
    // A lock that could not be put back stays protected by the marker, so no
    // coordinator takes the worktree while its record sits aside.
    if (error.keepMarker) { fs.closeSync(marker); marker = undefined; error.message += `; the recovery marker ${recovery} is kept until that record is restored by hand`; }
    throw error;
  } finally { if (marker !== undefined) { fs.closeSync(marker); fs.unlinkSync(recovery); } }
}

// The lock path's recovery marker, which a coordinator checks after it takes the lock.
export const lockRecoveryMarker = (lock) => lock + ".recovery";
const validIdentity = (value) => !!value && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.start === "string" && value.start.length > 0;

function recoverMarkedLock(lock, identifyProcess, host) {
  let text;
  try { text = fs.readFileSync(lock, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { alreadyAbsent: lock }; throw error; }
  const refuse = (why) => new Error(`Lock kept at ${lock}: ${why}`);
  let record;
  try { record = JSON.parse(text); } catch { throw refuse("its record is empty or unreadable, so its coordinator may still be starting; inspect it by hand"); }
  const owner = record?.processIdentity;
  if (!validIdentity(owner) || owner.pid !== record.pid) throw refuse("it records no OS start identity for its coordinator");
  if (typeof record.host !== "string" || !record.host) throw refuse("it records no source host, so a locally absent PID does not show its coordinator is gone");
  if (record.host !== host) throw refuse(`it was written on host ${record.host}, not ${host}; recover it from that host`);
  if (typeof record.journal !== "string" || !path.isAbsolute(record.journal)) throw refuse("it names no absolute journal path");
  if (sameIdentity(owner, identifyProcess(owner.pid))) throw refuse(`its coordinator (PID ${owner.pid}) is still running; await its exit`);
  let rows = [], journalFound = true;
  try { rows = readJournalRows(record.journal); }
  catch (error) {
    journalFound = false;
    // The coordinator opens its journal before it launches any child.
    if (error.code !== "ENOENT") throw refuse(`its journal ${record.journal} is unreadable (${error.message}); a child it launched may still run`);
  }
  const coordinatorRow = rows.find((row) => row.event === "coordinator");
  if (journalFound && !sameIdentity(coordinatorRow?.processIdentity, owner)) throw refuse(`its journal ${record.journal} ${rows.length ? "names a different coordinator" : "is empty, so the rows of a child it launched may be lost"}`);
  if (rows.some((row) => row.event === "blocked" && /unconfirmed/.test(row.reason ?? ""))) throw refuse("its coordinator reported a child whose exit is unconfirmed; confirm that child's exit by hand");
  const launch = rows.findLast((row) => row.event === "launching");
  if (launch && !Number.isSafeInteger(launch.index)) throw refuse(`its journal ${record.journal} records a launch without a step index`);
  const evidence = launch ? launchEvidence(rows, launch.index) : null;
  const exited = evidence?.exited;
  // A delegated command may run detached and outlive the coordinator; only an
  // exit row recording a clean drain of the service shows it has stopped.
  const service = evidence?.service;
  if (service && exited?.executionDrained !== true) throw refuse(`step ${launch.step} started a delegated execution service (${service.directory}) ${exited ? "whose shutdown failed or was not recorded" : "and its exit was never journalled"}, so its commands may still run; confirm they have exited by hand`);
  if (launch && !exited) {
    const running = evidence.running;
    if (!running) {
      // Waiting for a slot or a probed route precede the reserved row; the
      // child is spawned only after that row.
      if (!["waiting", "route-probed"].includes(evidence.last.event)) throw refuse(`step ${launch.step} may have spawned a child before its running row; confirm no child of the coordinator runs and inspect it by hand`);
    } else if (!evidence.confirmedAbsent) {
      const identified = evidence.identified;
      const child = identified?.childIdentity;
      if (identified && (!validIdentity(child) || child.pid !== running.pid)) throw refuse(`its journal records a malformed OS identity for child PID ${running.pid}; confirm the child's exit by hand`);
      const live = child ? identifyProcess(child.pid) : identifyProcess(running.pid);
      if (child ? sameIdentity(child, live) : live) throw refuse(child ? `its child (PID ${child.pid}) is still running; await its exit` : `PID ${running.pid} of its child is in use and the journal records no OS start identity to tell reuse apart; confirm the child's exit by hand`);
    }
  }
  const claimed = `${lock}.recovering-${randomUUID()}`;
  try { fs.renameSync(lock, claimed); }
  catch (error) { if (error.code === "ENOENT") return { alreadyAbsent: lock }; throw error; }
  // Every failure from here on puts the record back first. Linking back never
  // replaces a lock another coordinator took meanwhile.
  const restore = (why) => {
    try { fs.linkSync(claimed, lock); }
    catch (error) { return Object.assign(refuse(`${why}; restoring it failed (${error.message}), so the claimed record is at ${claimed}`), { keepMarker: true }); }
    try { fs.unlinkSync(claimed); }
    catch (error) { return refuse(`${why}; the lock is restored, and a duplicate of it remains at ${claimed} (${error.message})`); }
    return refuse(why);
  };
  const copy = path.join(path.dirname(record.journal), `agent-handoff.lock.recovered-${Date.now()}.json`);
  let failure;
  // Under the marker no one else moves the lock; a changed record is put back.
  try { if (fs.readFileSync(claimed, "utf8") !== text) failure = "it changed during recovery; inspect it again"; }
  catch (error) { failure = `the claimed record could not be read back (${error.message})`; }
  if (!failure) {
    try { fs.mkdirSync(path.dirname(copy), { recursive: true }); fs.copyFileSync(claimed, copy, fs.constants.COPYFILE_EXCL); }
    catch (error) { failure = `its copy could not be kept at ${copy}: ${error.message}`; }
  }
  if (failure) throw restore(failure);
  // The lock is released and its copy kept; a leftover claimed file is reported, not fatal.
  try { fs.unlinkSync(claimed); }
  catch (error) { return { recovered: lock, copy, coordinator: owner, leftover: claimed, leftoverError: error.message }; }
  return { recovered: lock, copy, coordinator: owner };
}

export function validateNativeReviewArgs(review) {
  if(!['default','acceptEdits','plan','dontAsk'].includes(review.permissions))throw new Error('Unsupported native reviewer permission mode');
  const values=new Set(['--model','-m','--effort','--permission-mode','--output-format','--allowedTools','--disallowedTools','--tools']);
  const switches=new Set(['-p','--print','--verbose','--no-session-persistence']);
  for(let i=0;i<review.args.length;i++) {
    const arg=review.args[i];
    if(switches.has(arg))continue;
    if(values.has(arg)&&typeof review.args[i+1]==='string'&&!review.args[i+1].startsWith('-')){i++;continue;}
    throw new Error(`Unsupported automatic native reviewer argument: ${arg}`);
  }
}

// Retries the atomic reservation while every slot is occupied, until one frees
// or the bound expires. It runs before any spawn and under the worktree lock,
// so a wait never races a separate status poll. Other reservation failures
// (store access, identity) are not waited out.
// Every retry checks the deadline first, so no reservation is attempted once
// the bound has passed, however late a timer fires.
export async function reserveWithinBound(root, seconds, onWaiting, pollMs = 1000) {
  const deadline = Date.now() + seconds * 1000;
  for (let attempt = 0; ; attempt++) {
    try { return reserveReviewerSlot(root); }
    catch (error) {
      if (error.code !== "ESLOTSFULL" || seconds === 0) throw error;
      if (attempt === 0) onWaiting(reviewerSlotStatus(root).filter((slot) => slot.reservation || slot.recovery).map((slot) => slot.index));
      const remaining = deadline - Date.now();
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
      if (Date.now() >= deadline) {
        error.message += ` after waiting ${seconds} seconds`;
        throw error;
      }
    }
  }
}

export function validateSlotWait(value) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 3600)) throw new Error("slotWaitSeconds must be an integer from 0 through 3600");
}

// Provider messages that mean the route itself cannot answer: usage and rate
// limits, rejected credentials, and a CLI too old for the requested model.
// Status codes count only as a status line renders them, and authentication
// only beside a failure word, so a benign line naming either is not a cause.
const routeFailurePattern = /hit your .*limit|usage limit|rate limit|too many requests|\b(401|429)\s+(unauthori[sz]ed|too many)|(status|http|error)\W{0,3}(401|429)\b|unauthori[sz]ed|incorrect api key|invalid api key|not logged in|please run .*login|failed to authenticate|authentication (failed|error|required|expired)|API Error: 400|requires (a newer|claude code|version)|update claude code|model .*(not found|not available|not supported|does not exist)|quota exceeded|exceeded .*quota/i;
export const reviewerProbePrompt = "Reviewer route probe: reply with the single word OK and do nothing else.";

// Native Claude `--output-format json` puts long metadata ahead of its result,
// so a line is read as JSON first and its semantic message (result, error,
// message) is classified and named whole. A line that is not JSON, or names no
// failing message, is classified as text.
function semanticMessages(line) {
  let parsed;
  try { parsed = JSON.parse(line); } catch { return undefined; }
  if (!parsed || typeof parsed !== "object") return undefined;
  const fields = [parsed.result, parsed.error, parsed.error?.message, parsed.message];
  return fields.filter((field) => typeof field === "string");
}

// The excerpt is capped for display but always holds the failure it names, so
// a match far into a long message is not cut away. A usage limit outranks an
// earlier failure in the same message, because the excerpt is what the fallback
// classification reads and only a usage limit permits a same-vendor reviewer.
function failureExcerpt(text) {
  const match = usageLimitPattern.exec(text) ?? routeFailurePattern.exec(text);
  if (!match || match.index + match[0].length <= 400) return text.trim().slice(0, 400);
  // Every pattern alternative that spans text joins two fixed words with `.*`,
  // so a span longer than the cap keeps its two ends and still matches.
  const span = match[0].length > 400 ? `${match[0].slice(0, 190)} … ${match[0].slice(-190)}` : text.slice(Math.max(0, match.index - Math.min(20, 400 - match[0].length)));
  return span.trim().slice(0, 400);
}

export function routeFailure(text) {
  for (const line of text.split(/\r?\n/).reverse()) {
    for (const message of semanticMessages(line) ?? []) {
      const found = message.split(/\r?\n/).reverse().find((candidate) => routeFailurePattern.test(candidate));
      if (found) return failureExcerpt(found);
    }
    if (routeFailurePattern.test(line)) return failureExcerpt(line);
  }
  return undefined;
}

function logTail(file, bytes = 16384) {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size, length = Math.min(size, bytes), buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      return buffer.toString("utf8");
    } finally { fs.closeSync(fd); }
  } catch { return ""; }
}

export function exitFailure(name, output, diagnostics) {
  const found = routeFailure(logTail(output) + (diagnostics === output ? "" : "\n" + logTail(diagnostics)));
  return new Error(`Role ${name} failed${found ? `; route unavailable: ${found}` : ""}; inspect ${output}`);
}

// The route failures that mean the provider's allowance is spent, as opposed
// to a rejected credential or a CLI too old for the model.
const usageLimitPattern = /hit your .*limit|usage limit|rate limit|too many requests|\b429\s+too many|(status|http|error)\W{0,3}429\b|quota exceeded|exceeded .*quota/i;
export const usageLimitWindowMs = 6 * 60 * 60 * 1000;

// Review is cross-vendor. A reviewer of the writer's own vendor, whether the
// defaults' fallback or an explicit route, launches only when the plan names a
// journal in which this launcher recorded a cross-vendor reviewer blocked by a
// usage limit within the window. Routes of neither known vendor are not judged.
export function checkCrossVendor(config, root, now = Date.now()) {
  const vendor = routeVendor(config.writer);
  const evidence = config.usageLimitJournal;
  const authorization = config.sameVendorAuthorization;
  if (vendor === null || vendor !== routeVendor(config.reviewer)) {
    if (evidence !== undefined || authorization !== undefined) throw new Error("usageLimitJournal and sameVendorAuthorization apply only to a reviewer of the writer's vendor");
    return undefined;
  }
  // The user may ask for a same-vendor reviewer outright; the plan then
  // carries their request verbatim in place of the journal.
  if (authorization !== undefined) {
    if (typeof authorization !== "string" || !authorization.trim()) throw new Error("sameVendorAuthorization must carry the user's request for a same-vendor reviewer verbatim");
    if (evidence !== undefined) throw new Error("Supply usageLimitJournal or sameVendorAuthorization, not both");
    return { sameVendorAuthorization: authorization };
  }
  const refuse = (why) => new Error(`Reviewer ${config.reviewer} shares the writer's vendor, which is allowed only after the cross-vendor default was blocked by a usage limit, or on the user's explicit request carried in sameVendorAuthorization: ${why}`);
  if (typeof evidence !== "string" || !path.isAbsolute(evidence)) throw refuse("launch the cross-vendor default first and, if its journal ends blocked by a usage limit, supply that journal's absolute path as usageLimitJournal");
  assertInsideJobRoot([["usageLimitJournal", evidence]], root, "the blocked cross-vendor plan's journal");
  let rows;
  try { rows = fs.readFileSync(evidence, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { throw refuse(`usageLimitJournal ${evidence} is unreadable (${error.message})`); }
  const launch = rows.findLastIndex((row) => row.event === "launching" && row.role === "review" && ![null, vendor].includes(routeVendor(String(row.model ?? ""))));
  if (launch < 0) throw refuse(`${evidence} records no cross-vendor reviewer launch`);
  const blocked = rows.slice(launch + 1).find((row) => row.event === "blocked");
  if (!blocked || !usageLimitPattern.test(blocked.reason ?? "")) throw refuse(`${evidence} does not end blocked by a usage limit${blocked ? ` (${String(blocked.reason).slice(0, 200)})` : ""}; any other failure is fixed or reported, not reviewed around`);
  const age = now - Date.parse(blocked.time);
  if (!(age >= 0 && age <= usageLimitWindowMs)) throw refuse(`${evidence} was blocked at ${blocked.time}, more than ${usageLimitWindowMs / 3600000} hours ago; launch the cross-vendor default again`);
  return { usageLimitJournal: evidence, usageLimitRoute: rows[launch].model, usageLimitReason: blocked.reason, usageLimitTime: blocked.time };
}

// A probe with the review step's own executable, arguments and environment
// shows whether the route answers before a reviewer slot is reserved. A route
// answers only when it exits 0 and its output carries the requested OK. Every
// Codex step's report file is left out so the probe never writes the report
// the real launch creates.
export async function probeReviewerRoute(step, args, { cwd, env, timeoutMs = 120000 }) {
  const codex = step.nativeResult === "codex-jsonl" || step.args[0] === "exec";
  const probeArgs = [];
  for (let index = 0; index < args.length; index++) {
    if (codex && ["--output-last-message", "-o"].includes(args[index])) index++;
    else probeArgs.push(args[index]);
  }
  const child = spawn(step.executable, probeArgs, { cwd, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let text = "";
  child.stdout.on("data", (chunk) => { text = (text + chunk).slice(-65536); });
  child.stderr.on("data", (chunk) => { text = (text + chunk).slice(-65536); });
  child.stdin.on("error", () => {});
  child.stdin.end(reviewerProbePrompt + "\n");
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
  const { code, error } = await new Promise((resolve) => {
    child.once("error", (spawnError) => resolve({ code: null, error: spawnError }));
    child.once("close", (exitCode) => resolve({ code: exitCode }));
  });
  clearTimeout(timer);
  const answered = /\bOK\b/i.test(text);
  if (code === 0 && !timedOut && answered) return;
  const detail = error ? error.message : timedOut ? `no answer within ${Math.round(timeoutMs / 1000)} seconds` : routeFailure(text) ?? (code === 0 ? `exited 0 without answering OK${text.trim() ? `: ${text.trim().split(/\r?\n/).at(-1).slice(0, 400)}` : " (no output)"}` : text.trim().split(/\r?\n/).at(-1)?.slice(0, 400));
  let version = "";
  if (!codex) {
    try { version = `; installed CLI ${execFileSync(step.executable, ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true }).trim()}`; } catch {}
  }
  throw new Error(`Reviewer route ${step.model} unavailable before slot reservation: ${detail || `exit code ${code}`}${version}; ${usageLimitPattern.test(detail ?? "") ? "wait for the limit to reset, or name this plan's journal as usageLimitJournal in a plan for a same-vendor reviewer" : "repair the route or wait for it to recover; this failure does not permit a same-vendor reviewer"}`);
}

// Configuration is a local, caller-authored artifact. Comments and child output
// can select a declared transition but can never supply executable commands.
// Every step's Codex authentication secret leaves the launcher's environment
// for the run, so no child it or its helpers start (git, gh, the version
// probe, the route probe, the reviewer) inherits it; the reviewer's own
// environment is built from a source holding only its step's secret.
export function withholdCodexAuthSecrets(config, env = process.env) {
  const names = [...new Set(Object.values(config.steps ?? {}).map((step) => step?.permissions?.codexAuthEnv).filter((name) => typeof name === "string"))];
  const values = Object.fromEntries(names.filter((name) => Object.hasOwn(env, name)).map((name) => [name, env[name]]));
  for (const name of names) delete env[name];
  return { names, values, restore: () => { for (const [name, value] of Object.entries(values)) env[name] = value; } };
}

export async function runHandoff(configFile, options = {}) {
  const config = read(configFile);
  const withheld = withholdCodexAuthSecrets(config);
  try { return await runHandoffWithheld(configFile, config, options, withheld); }
  finally { withheld.restore(); }
}

async function runHandoffWithheld(configFile, config, { slotRoot, identifyProcess = processIdentity, automaticJob, jobRoot, repos = readRepos(), listComments = listThreadComments, probeTimeoutMs, editorPreflight = driverPreflight, probeCleanup = removeProbeCheckouts, startExecution = startExecutionService } = {}, withheld) {
  if (config.continuation) throw new Error('Automatic continuation requires review-supervisor capability preflight');
  applyLensEditorGrant(config);
  validatePlanShape(config);
  const thread = reviewThread(config, repos);
  const cwd = fs.realpathSync.native(config.worktree);
  const journal = path.resolve(config.journal);
  const relative = path.relative(cwd, journal);
  if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) throw new Error("Journal must be outside the worktree");
  const root = jobRoot ?? reviewJobRoot(cwd);
  // A Codex reviewer's private directory is declared in its permissions; a
  // Claude reviewer's directory exists only inside its built prompt, which
  // scripts/build-review-prompt.mjs checks when it fills REVDIR and DIFF.
  assertInsideJobRoot([["plan file", configFile], ["journal", journal], ...Object.entries(config.steps).flatMap(([name, step]) => [[`step ${name} prompt`, step?.prompt], ...(step?.permissions?.cwd !== undefined ? [[`step ${name} reviewer directory`, step.permissions.cwd]] : [])])], root, `in pr-${config.pr}${path.sep}round-<R>`);
  const selection = resolveReviewer(config, cwd);
  config.reviewer = selection.reviewer;
  if (!config.writer || !config.reviewer || configuredRoute(config.writer) === configuredRoute(config.reviewer)) throw new Error("Supply distinct writer and reviewer model routes");
  if (selection.resolved) for (const [name, step] of Object.entries(config.steps)) if (step.role === "review") config.steps[name] = applyResolvedReviewer(step, selection);
  const sameVendor = checkCrossVendor(config, root);
  const reviewerRow = { ...(selection.resolved ? { reviewerEffort: selection.reviewerEffort, reviewerResolved: { writerEffort: config.writerEffort, rowWriterEffort: selection.rowWriterEffort, matchedOn: selection.matchedOn, ticketEffort: selection.ticketEffort, fallback: selection.fallback, index: selection.index } } : {}), ...(sameVendor ? { sameVendor } : {}) };
  const reviewRoundLimit = config.reviewRoundLimit ?? 3;
  validateReviewRecovery(config);
  if (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 30) throw new Error("maxSteps must be 1..30");
  validateSlotWait(config.slotWaitSeconds);
  const slotWaitSeconds = config.slotWaitSeconds ?? 0;
  if (fs.existsSync(journal)) throw new Error("Journal exists; inspect recorded process and completion before authoring a recovery plan");
  // The secrets are withheld from process.env above; the probe's environment
  // is a copy of what remains, and a step's source holds its own secret only.
  const authSecrets = withheld.names;
  const probeEnv = { ...process.env };
  for (const name of authSecrets) delete probeEnv[name];
  const secretSourceFor = (step) => {
    const name = step.permissions?.codexAuthEnv;
    return name !== undefined && Object.hasOwn(withheld.values, name) ? { ...process.env, [name]: withheld.values[name] } : { ...process.env };
  };
  for (const step of Object.values(config.steps)) {
    if (step.execution) executionCommands(step.execution, cwd);
    if(step.nativeResult!==undefined&&!['claude-json','codex-jsonl'].includes(step.nativeResult))throw new Error('Unsupported native reviewer result transport');
    if(step.nativeResult==='codex-jsonl') {
      validateCodexReviewer(step,{reviewer:config.reviewer,worktree:cwd,jobDir:path.dirname(journal),secretSource:secretSourceFor(step)});
      verifyReviewerExecutable({...step,transport:'native-codex-jsonl'},{env:probeEnv});
    }
    if (step.role === "review" && (!Number.isInteger(step.round) || step.round < 1 || step.round > reviewRoundLimit)) throw new Error(`Review round must be 1..${reviewRoundLimit} on every review step before launch`);
    if (!["implement", "review", "adjudicate"].includes(step.role) || !path.isAbsolute(step.executable) || !Array.isArray(step.args) || !step.args.every((a) => typeof a === "string") || !path.isAbsolute(step.prompt)) throw new Error("Each role needs an absolute executable, argument array and prompt file");
    if (!step.model || step.model !== (step.role === "review" ? config.reviewer : config.writer)) throw new Error("Step model must match its caller-supplied role route");
    const explicit = step.args.findIndex((a) => a === "--model" || a === "-m");
    const agent = step.args.indexOf("--agent");
    if (explicit >= 0) {
      if (step.args[explicit + 1] !== step.model) throw new Error("Model argument does not match the declared route");
    } else if (agent >= 0 && /^reviewer-[a-z0-9-]+$/.test(step.args[agent + 1] ?? "")) {
      const definition = fs.readFileSync(path.join(cwd, ".claude", "agents", step.args[agent + 1] + ".md"), "utf8");
      if (/^model:\s*(.+)$/m.exec(definition)?.[1].trim() !== step.model) throw new Error("Agent definition does not match the declared route");
    } else throw new Error("Launch must explicitly select its model or a checked pinned agent definition");
    if (!Array.isArray(step.next) || !step.next.length || !step.next.every((name) => name === null || Object.hasOwn(config.steps, name))) throw new Error("Each step needs declared next transitions");
  }
  if (Object.values(config.steps).some((step) => step.execution?.some((op) => op.kind === "editor"))) {
    const preflight = await editorPreflight({ cwd, env: probeEnv });
    if (!preflight?.passed) throw new Error(`Editor driver preflight failed before launch: ${(preflight?.failing ?? []).join("; ") || "no passing result"}; repair the coordinator environment (run node .agents/skills/drive-web-editor/driver.mjs preflight) before granting an editor operation`);
  }
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const lock =git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-handoff.lock']);
  let owner;
  try { owner = fs.openSync(lock, "wx"); }
  catch(error) {
    if(error.code==="EEXIST")throw new Error(`EEXIST: a coordinator already owns this worktree; inspect ${lock} and await confirmed exit, or, once its coordinator is gone, run node scripts/agent-handoff.mjs recover-lock ${cwd}`);
    throw error;
  }
  // A lock taken while a recovery runs is given up, so the recovery never
  // moves aside a lock that a live coordinator owns.
  let recovering = true;
  try { fs.lstatSync(lockRecoveryMarker(lock)); }
  catch (error) { if (error.code === "ENOENT") recovering = false; else { fs.closeSync(owner); fs.unlinkSync(lock); throw error; } }
  if (recovering) { fs.closeSync(owner); fs.unlinkSync(lock); throw new Error(`A lock recovery is running for this worktree (${lockRecoveryMarker(lock)}); await it, then launch again`); }
  let fd;
  const append = (row) => { fs.writeSync(fd, JSON.stringify({ time: new Date().toISOString(), ...row }) + "\n"); fs.fsyncSync(fd); };
  let current = config.first;
  let completedRound = config.completedReviewRound;
  let reviewedHead = config.reviewedHead ?? null;
  let completedRoundReviews = config.completedRoundReviews ?? null;
  let completedRoundReviewers = config.completedRoundReviewers ?? null;
  let plannedRoundReviewers = config.plannedRoundReviewers ?? null;
  let finalCorrections = config.finalCorrections ?? false;
  let activeChild, pendingReport;
  // Set once a Codex reviewer's exit is confirmed and taken by the first
  // runProbeCleanup, which runs after validation or, when a later step throws,
  // before the blocked row: an exited reviewer's probe checkouts never wait on
  // its report passing.
  let pendingProbeCleanup = null;
  const runProbeCleanup = () => {
    const cleanup = pendingProbeCleanup;
    pendingProbeCleanup = null;
    if (!cleanup) return;
    const { index, step, directory, preserve, keep } = cleanup;
    try {
      const result = probeCleanup(directory, { preserve, keep: keep && fs.existsSync(keep) ? [keep] : [] });
      append({ event: result.skipped ? "probe-cleanup-skipped" : "probe-checkouts-removed", index, step, directory, ...result });
    } catch (error) { append({ event: "probe-cleanup-failed", index, step, directory, reason: error.message }); }
  };
  const usedReports=new Set();
  const coordinatorPosts = config.reportPosting === "coordinator";
  try {
    const freeze=git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-review-job.json']);
    if(fs.existsSync(freeze)) {
      const claim=read(freeze);
      if(claim.jobId!==automaticJob?.jobId||fs.realpathSync.native(claim.jobDir)!==fs.realpathSync.native(automaticJob.jobDir))throw new Error('Worktree reserved by automatic review job; claim or cancel that job first');
    } else if(automaticJob)throw new Error('Automatic review ownership marker missing');
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), host: os.hostname(), startedAt: new Date().toISOString(), journal }));
    fd = fs.openSync(journal, "wx");
    // Job cleanup retains a job directory while any process a journal names is running.
    append({ event: "coordinator", pid: process.pid, processIdentity: processIdentity(process.pid), thread });
    for (let index = 0; current; index++) {
      if(automaticJob)await retryBusy(()=>withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled; no further reviewer dispatch');}));
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      const plannedPending = step.role === "review" && plannedReviewerPending(step.round, completedRound, completedRoundReviews, step.reviewers);
      if (step.role === "review") {
        checkReviewRound(step.round, completedRound, finalCorrections && !plannedPending, reviewRoundLimit);
        checkReviewerPlace(step, completedRound, completedRoundReviewers, plannedRoundReviewers);
      }
      const head = gitHead(cwd), status = gitStatus(cwd);
      if (status) throw new Error("Handoff requires a clean committed worktree");
      const install = step.role === "review" ? installFingerprint(cwd) : null;
      if (step.role === "review" && step.round === completedRound && head !== reviewedHead && !plannedPending) throw new Error("A pending lens in the same round requires the recorded reviewed head unless the round still plans a reviewer (the step's reviewers above completedRoundReviews); corrections after its last planned reviewer need a new round");
      const artifacts = fs.mkdtempSync(path.join(path.dirname(journal), `handoff-${index}-${step.role}-`));
      if(step.nativeResult==='codex-jsonl')protectPrivatePath(artifacts);
      const writable=step.nativeResult==='codex-jsonl'?fs.realpathSync.native(fs.mkdtempSync(path.join(path.dirname(journal),`completion-${index}-`))):artifacts;
      const completion = path.join(writable, "completion.json");
      const output = path.join(artifacts, "process.log");
      const reportToken = `handoff-report-${randomUUID()}`;
      const args=step.nativeResult==='codex-jsonl'?nativeCodexArgs(step,writable):step.args;
      const reportFile = coordinatorPosts ? args[args.findIndex((arg) => ["--output-last-message", "-o"].includes(arg)) + 1] : undefined;
      const prompt = fs.readFileSync(step.prompt, "utf8") + (coordinatorPosts
        ? `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}. This launch gives you no GitHub access: do not post, and do not run gh. Your final message is your complete report, which the coordinator posts verbatim on your behalf; end it with the line \`${reportToken}\`. Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":null,"commentIds":[],"summary":"<result>"}. Do not mark ready or merge. Do not modify repository files during review.\n`
        : `\n\nHandoff contract: role=${step.role}, configured model=${step.model}, reviewed head=${head}.${step.role === "review" ? ` End your posted report with the line \`${reportToken}\`.` : ""} Write ${completion} with the editor tool as JSON: {"head":"<actual HEAD>","next":"<declared transition or null>","commentIds":[<numeric GitHub comment IDs>],"summary":"<result>"}. Allowed next steps: ${JSON.stringify(step.next)}. Review and adjudication must post their complete report/dispositions before completion; include those IDs. Do not mark ready or merge. Do not modify repository files during review.\n`);
      const diagnostics=step.nativeResult?path.join(artifacts,'stderr.log'):output;
      const reportNotBefore=new Date().toISOString();
      // What the reviewer directory holds before the reviewer runs is never cleaned up afterwards.
      const reviewerHad = step.role === "review" && step.nativeResult === "codex-jsonl" ? snapshotReviewerDirectory(step.permissions.cwd) : null;
      append({ event: "launching", index, step: current, role: step.role, model: step.model, ...(step.role === "review" ? reviewerRow : {}), ...(reviewerHad ? { reviewerDirectory: step.permissions.cwd, reviewerHad: [...reviewerHad] } : {}), round: step.round, ...(step.reviewerId !== undefined ? { reviewerId: step.reviewerId, attempt: step.attempt ?? 1, plannedReviewers: step.reviewers } : {}), completedRound, reviewedHead, completedRoundReviews, completedRoundReviewers, plannedRoundReviewers, finalCorrections, head, output, diagnostics, completion, args,reportNotBefore,reportToken,...(coordinatorPosts ? { reportPosting: "coordinator", report: reportFile } : {}) });
      const log = fs.openSync(output, "wx");
      let stderr;
      try{stderr=diagnostics===output?log:fs.openSync(diagnostics,'wx');}catch(error){fs.closeSync(log);throw error;}
      const closeLogs=()=>{try{fs.closeSync(log);}finally{if(stderr!==log)fs.closeSync(stderr);}};
      let slot,env;
      const discardAuth=()=>discardCodexAuthCopy(step,env);
      try {
        // The source holds this step's secret only; the helper children the
        // builder starts (gh) receive the source without it.
        env=step.role==='review'?nativeReviewerEnvironment(step,artifacts,secretSourceFor(step),{worktree:cwd,reportPosting:config.reportPosting}):{...process.env};
        for (const name of authSecrets) delete env[name];
        // Never inherit a service grant from a parent review or unrelated task.
        for (const key of Object.keys(env)) if (/^IMPOWER_REVIEW_EXECUTION_/i.test(key)) delete env[key];
        if (step.role === "review") {
          await probeReviewerRoute(step, args, { cwd, env, timeoutMs: probeTimeoutMs });
          append({event:"route-probed",index,model:step.model});
        }
      } catch (error) { closeLogs(); discardAuth(); throw error; }
      try { slot = step.role === "review" ? await reserveWithinBound(slotRoot, slotWaitSeconds, (occupied) => append({event:"waiting",index,slotWaitSeconds,occupied})) : null; }
      catch (error) { closeLogs(); discardAuth(); throw error; }
      if (slot) {
        // A failed reservation row refuses before the spawn, so the launch's
        // cleanup (logs, the authentication copy, the slot) is this block's.
        try {
          slot.append({phase:"launching",head,output,completion,journal});
          append({event:"reserved",index,slot:slot.file,token:slot.token,owner:slot.owner});
        } catch (error) {
          closeLogs(); discardAuth();
          try { releaseReviewerSlot(slot); } catch (releaseError) { error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`; }
          throw error;
        }
      }
      let child,childError,exited,launchError,executionService,executionClose,executionFailure;
      // Service errors are reported only after the owned command has drained.
      // They must not bypass confirmed reviewer-exit journalling or slot release.
      const drainExecution = async () => {
        if (!executionService) return;
        executionClose ??= executionService.close().catch(error => { executionFailure = error; });
        await executionClose;
      };
      const executionClient = executionClientCommand(cwd);
      const executionPrompt = step.execution ? `\nLauncher execution service: the caller authorized these operations: ${step.execution.map(op => op.id).join(", ")}. Use the command ${executionClient} with no argument to list their exact commands. For tests and benchmarks, one operation ID requests and awaits its fixed-input result; each such ID runs once and later requests return its retained result. Editor operations instead require the bounded request JSON described below, with a separate requestId for each attempt. Requests execute outside the reviewer sandbox through the coordinator, against reviewed head ${head}; Vitest retains its machine-wide reservation and process census. Read the actual test summaries or benchmark report in output; exit zero alone does not establish coverage. Do not print the service environment token. Other commands, arbitrary flags, external projects and reviewer-authored probes are not delegated.\n` : "";
      const accessPrompt = step.nativeResult === "codex-jsonl" && codexReviewMode(step) === "full-access" ? `\nExecution access: you run without a sandbox, as the user, under the repository's shared hook policy (typed issues, shared stash, local test runs, write hazards). The reviewed checkout ${cwd} is frozen: do not modify it. For executable evidence, clone reviewed head ${head} into your private directory, install dependencies there with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1, and run tests, including probes you write, only through node scripts/test-suite.mjs run <package-dir> <test-file> [test-file ...] --wait <seconds> (with a package directory such as packages/sparkdown), which takes the machine-wide reservation. Record each command and its result in your report.${step.execution?.some(op => op.kind === "editor") ? ` For the editor, the delegated operation described below is the primary route. As a secondary route, the drive-web-editor skill is at ${path.join(cwd, ".agents", "skills", "drive-web-editor", "SKILL.md")}; running its driver from the frozen checkout is permitted, because driver state and the browser profile live outside the checkout.` : ""}\n` : "";
      const editorPrompt = step.execution?.some(op => op.kind === "editor") ? `\nEditor delegation: read ${path.join(cwd, ".agents/skills/review-pr/references/editor-delegation.md")}. For an editor operation, use ${executionClient} <operation-id> <absolute-request.json>. Write that JSON with your editor tool in your private directory. The coordinator starts the supported editor/player driver, applies bounded UI data and returns its transcript. The client saves PNG copies in your current private directory; open and inspect those images. Each requestId runs once; use a fresh requestId for a new attempt and repeat the identical request to retrieve retained evidence. The operation's maxRequests bounds attempts. The coordinator owns and stops this separate session after your process exits. Do not run up/down directly for this delegation or claim the lens was performed without inspecting successful task evidence and screenshots.\n` : "";
      try {
        if (step.execution) {
          const directory = fs.mkdtempSync(path.join(artifacts, "execution-"));
          executionService = await startExecution({ operations: step.execution, root: cwd, directory, head });
          Object.assign(env, executionService.environment);
          append({ event: "execution-service", index, head, directory, operations: step.execution });
        }
        const launch=()=>{
          child=spawn(step.executable,args,{cwd,env,shell:false,windowsHide:true,stdio:['pipe',log,stderr]});
          activeChild=child;
          exited=new Promise(resolve=>{child.on('error',error=>{childError=error.message;});child.once('close',(code,signal)=>resolve({code,signal,error:childError}));});
        };
        if(automaticJob)await retryBusy(()=>{if(child)throw new Error('Spawn completed but admission cleanup failed; preserve owned child');return withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled');launch();});});else launch();
      } catch(error){
        if(child)launchError=error;
        else {closeLogs();discardAuth();await drainExecution();if(executionFailure)error.message+=`; delegated execution: ${executionFailure.message}`;if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message+=`; reservation retained at ${slot.file}: ${releaseError.message}`;}}throw error;}
      }
      let result;
      const reportFlag = args.findIndex((arg) => ["--output-last-message", "-o"].includes(arg));
      const probeCleanupAfterExit = reviewerHad ? { index, step: current, directory: step.permissions.cwd, preserve: reviewerHad, keep: reportFlag >= 0 ? args[reportFlag + 1] : undefined } : null;
      try {
        child.stdin.on("error", () => {});
        let identityRow;
        if (slot && child.pid) {
          try {
            const childIdentity = identifyProcess(child.pid);
            slot.append({phase:childIdentity ? "running" : "exited",child:childIdentity,head,output,completion,journal});
            identityRow={event:childIdentity ? "identified" : "confirmed-absent",index,step:current,childIdentity,slot:slot.file,token:slot.token};
          }
          catch (error) { identityRow={event:"identity-uncertain",index,reason:error.message}; }
        }
        append({ event: "running", index, step: current, pid: child.pid, startedAt: new Date().toISOString(), head, output, completion });
        if(identityRow)append(identityRow);
        if(launchError)throw launchError;
        child.stdin.end(prompt + accessPrompt + executionPrompt + editorPrompt);
        result = await exited;
        activeChild = null;
        pendingProbeCleanup = probeCleanupAfterExit;
      } catch(error) {
        // The handle belongs to the child just spawned here. Close its input
        // and terminate that child, retaining ownership until close is observed.
        child.stdin.destroy();
        const waitForClose = (ms) => new Promise(resolve=>{
          const timer=setTimeout(()=>resolve(null),ms);
          exited.then(value=>{clearTimeout(timer);resolve(value);});
        });
        let undelivered=false;
        const terminate=(signal)=>{try{if(!child.kill(signal))undelivered=true;}catch(killError){error.message += `; owned-child termination failed: ${killError.message}`;}};
        terminate();
        let stopped=await waitForClose(5000);
        if(!stopped){terminate("SIGKILL");stopped=await waitForClose(5000);}
        await drainExecution();
        if(executionFailure)error.message += `; delegated execution: ${executionFailure.message}`;
        if(stopped){
          activeChild=null;
          // The observed close is the stopped reviewer's exit evidence, which
          // the journal cleanup command requires before it removes anything.
          try { append({ event: "exited", index, step: current, ...stopped, stopped: true }); }
          catch(journalError){error.message += `; stopped-child exit journal write failed: ${journalError.message}`;}
          pendingProbeCleanup = probeCleanupAfterExit;
          if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`;}}
        } else {
          child.unref();
          if(undelivered)error.message += "; owned-child termination request was not delivered";
          error.message += `; child exit unconfirmed (PID ${child.pid}): preserve the worktree lock${slot ? " and reviewer reservation at " + slot.file + "; inspect any recorded OS identity in that slot" : ""}`;
        }
        if(childError)error.message += `; child process error: ${childError}`;
        throw error;
      } finally {
        closeLogs();
        // A running reviewer still needs its authentication.
        if (!activeChild) discardAuth();
        await drainExecution();
      }
      // executionDrained records whether the delegated service closed cleanly;
      // lock recovery accepts a service-bearing launch only on true.
      try { append({ event: "exited", index, step: current, ...result, ...(executionService ? { executionDrained: !executionFailure } : {}) }); }
      catch(error){
        error.message=`Child exit confirmed (code ${result.code}); exit journal write failed: ${error.message}; completion and report validation has not run`;
        if(executionFailure)error.message += `; delegated execution: ${executionFailure.message}`;
        if(slot){try{releaseReviewerSlot(slot);}catch(releaseError){error.message += `; reservation retained at ${slot.file}: ${releaseError.message}`;}}
        throw error;
      }
      if(slot){try{releaseReviewerSlot(slot);}catch(error){throw new Error(`Child exit confirmed (code ${result.code}); reservation retained at ${slot.file}: ${error.message}; completion and report validation has not run${executionFailure ? `; delegated execution: ${executionFailure.message}` : ""}`);}}
      if(executionFailure)throw executionFailure;
      if (result.code !== 0) throw exitFailure(current, output, diagnostics);
      if(step.nativeResult){const native=verifyNativeReviewResult(output,step.nativeResult);if(native?.warnings?.length)append({event:"reviewer-warnings",index,step:current,warnings:native.warnings});}
      if (step.role === "review") {
        const changedPaths = gitStatus(cwd).split("\n").filter(Boolean).length;
        if (gitHead(cwd) !== head || changedPaths) throw new Error(`Review changed the frozen head or worktree${changedPaths ? ` (${changedPaths} changed paths; restore them before trusting any evidence)` : ""}`);
        const damage = installChanges(install, installFingerprint(cwd));
        if (damage.length) throw new Error(`Review changed the reviewed install: ${damage.join("; ")}; restore these before any later step or local test`);
      }
      // A coordinator-posted report is the reviewer's final message, checked
      // before the completion artifact so a missing artifact can rest on it.
      const awaiting = coordinatorPosts ? { index, step: current, head, ...coordinatorReport(reportFile, head, reportToken) } : undefined;
      let done;
      try { done = read(completion); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        done = awaiting ? { head, next: null, commentIds: [], summary: `Derived from the reviewer's final report ${reportFile}; no completion artifact was found at the launcher's path` } : deriveMissingCompletion(step, thread, head, reportNotBefore, reportToken, cwd, usedReports, { listComments });
        if (!done) { error.message += `; no report naming head ${head} was posted since launch`; throw error; }
        append({ event: "completion-artifact-missing", index, step: current, completion, commentIds: done.commentIds });
      }
      if (done.head !== gitHead(cwd) || typeof done.summary !== "string" || !done.summary.trim() || !Array.isArray(done.commentIds) || !done.commentIds.every(Number.isSafeInteger)) throw new Error("Invalid or stale completion artifact");
      if (!(step.next.includes(done.next))) throw new Error("Undeclared transition");
      if (awaiting && done.commentIds.length) throw new Error("A reviewer without GitHub access reported posted comment IDs; its report is posted by the coordinator");
      if (step.role !== "implement" && !awaiting && !done.commentIds.length) throw new Error(NEEDS_POSTED_IDS);
      for (const id of done.commentIds) {
        if(automaticJob&&usedReports.has(id))throw new Error('Each automatic reviewer requires distinct report IDs');
        await verifyReviewComment(id, thread, done.head, cwd,{notBefore:automaticJob?reportNotBefore:undefined});
        usedReports.add(id);
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      // The reviewer's probe clones and installs go once its exit is confirmed;
      // a skipped or failed cleanup never voids the validated review.
      runProbeCleanup();
      let pendingReviewers;
      if (step.role === "review") {
        const after = completeReviewAccounting({ completedRound, reviewedHead, completedRoundReviews, completedRoundReviewers, plannedRoundReviewers, finalCorrections }, step, head);
        ({ completedRound, reviewedHead, completedRoundReviews, completedRoundReviewers, plannedRoundReviewers, finalCorrections, pendingReviewers } = after);
      }
      if (step.role !== "review" && completedRound === reviewRoundLimit && done.head !== reviewedHead) finalCorrections = true;
      append({ head:done.head,next:done.next,commentIds:done.commentIds,summary:done.summary,event: "completed", index, step: current, ...(step.role === "review" && step.reviewerId !== undefined ? { reviewerId: step.reviewerId, attempt: step.attempt ?? 1 } : {}), completedRound, reviewedHead, completedRoundReviews, completedRoundReviewers, plannedRoundReviewers, ...(pendingReviewers ? { pendingReviewers } : {}), finalCorrections });
      pendingReport = awaiting;
      current = done.next;
    }
    // The chain finishes when record-report adds the posted comment's ID.
    if (pendingReport) append({ event: "report-awaiting-post", ...pendingReport });
    else append({ event: "finished" });
  } catch (error) {
    if (fd !== undefined) {
      // A step that threw after its reviewer exited still frees the disk.
      try { runProbeCleanup(); }
      catch(journalError){error.message += `; probe cleanup journal write failed: ${journalError.message}`;}
      try { append({ event: "blocked", ...failureDetails(error) }); }
      catch(journalError){error.message += `; blocked journal write failed: ${journalError.message}`;}
    }
    throw error;
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { try { fs.closeSync(owner); } finally { if (!activeChild) fs.unlinkSync(lock); } }
  }
  return { journal, pendingReport, thread };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "record-report") {
    try {
      if (process.argv.length !== 6) throw new Error("Usage: node scripts/agent-handoff.mjs record-report <absolute-journal> <comment-id> <read-back-comment-json>");
      recordCoordinatorReport(process.argv[3], process.argv[4], process.argv[5]);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else if (process.argv[2] === "recover-lock") {
    try {
      if (process.argv.length !== 4) throw new Error("Usage: node scripts/agent-handoff.mjs recover-lock <worktree>");
      console.log(JSON.stringify(recoverHandoffLock(process.argv[3])));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else runHandoff(process.argv[2]).then(({ journal, pendingReport, thread }) => {
    if (pendingReport) console.log(`Reviewer report awaiting the coordinator's post: ${pendingReport.report}. Post it verbatim on review thread ${thread.repo}#${thread.number} after one line saying it is posted on the reviewer's behalf and why, read the comment back by id as JSON (gh api repos/${thread.repo}/issues/comments/<comment-id> > <read-back.json>, or the comment object your GitHub integration returns, with its id, issue_url and body), then run: node scripts/agent-handoff.mjs record-report ${journal} <comment-id> <read-back.json>`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
