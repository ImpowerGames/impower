import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { reserveReviewerSlot, releaseReviewerSlot, processIdentity, reviewerSlotStatus } from "./reviewer-slots.mjs";
import { withJob,retryBusy,git,failureDetails } from './review-job-store.mjs';
import { verifyCodexReviewResult,validateCodexReviewer,verifyReviewerExecutable } from './native-reviewer.mjs';
import {nativeReviewerEnvironment,protectPrivatePath,nativeCodexArgs,codexReviewMode,discardCodexAuthCopy} from './reviewer-security.mjs';
import { resolveReviewer, applyResolvedReviewer, routeVendor } from "./reviewer-defaults.mjs";
import { reviewJobRoot, assertInsideJobRoot } from "./review-job-root.mjs";
import { validateExecutionShape, executionCommands, startExecutionService, executionClientCommand } from "./reviewer-execution.mjs";
import { installFingerprint, installChanges } from "./reviewed-install.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const gitHead = (cwd) => git(cwd,['rev-parse','HEAD']);
const gitStatus = (cwd) => git(cwd,['status','--porcelain']);
export const configuredRoute = (value) => value.replace(/\[[^\]]+\]$/, "");
const readReviewComment = (id, cwd) => JSON.parse(execFileSync("gh", ["api", `repos/ImpowerGames/impower/issues/comments/${id}`], { cwd, encoding: "utf8", windowsHide: true }));

export async function verifyReviewComment(id, pr, head, cwd, { readComment = readReviewComment, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 6, notBefore } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let comment;try{comment=readComment(id,cwd);}catch(error){if(attempt===attempts)throw error;}
    if (comment?.issue_url === `https://api.github.com/repos/ImpowerGames/impower/issues/${pr}` && typeof comment.body==='string'&&comment.body.includes(head) && (notBefore===undefined||Number.isFinite(Date.parse(comment.created_at))&&Date.parse(comment.created_at)>=Math.floor(Date.parse(notBefore)/1000)*1000)) return;
    if (attempt < attempts) await wait(1000);
  }
  throw new Error(notBefore===undefined?"Comment does not verify this PR and head":`Comment does not verify this PR/head and current reviewer launch time ${notBefore}`);
}

const listPrComments = (pr, since, cwd) => JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/ImpowerGames/impower/issues/${pr}/comments?per_page=100&since=${encodeURIComponent(since)}`], { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 })).flat();

// A review that exited cleanly without its completion artifact is covered by the one report it posted for the reviewed head since launch.
// Only this launch's private prompt carries reportToken, so a comment containing it is attributable to this reviewer.
export function deriveMissingCompletion(step, pr, head, notBefore, reportToken, cwd, excluded, { listComments = listPrComments } = {}) {
  if (step.role !== "review") return null;
  if (step.next.length !== 1) throw new Error(`Completion artifact missing and the review declares ${step.next.length} transitions; confirm coverage from the PR comments`);
  const floor = Math.floor(Date.parse(notBefore) / 1000) * 1000;
  const reports = listComments(pr, notBefore, cwd).filter((comment) => Number.isSafeInteger(comment.id) && !excluded.has(comment.id) && typeof comment.body === "string" && comment.body.includes(reportToken) && comment.body.includes(head) && Date.parse(comment.created_at) >= floor);
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
export function plannedReviewerPending(round, completedRound, completedRoundReviews, reviewers) {
  return round === completedRound && Number.isInteger(completedRoundReviews) && Number.isInteger(reviewers) && completedRoundReviews < reviewers;
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
  if((config.completedReviewRound===limit&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections!==undefined&&typeof config.finalCorrections!=='boolean')||(config.finalCorrections&&config.completedReviewRound<3))throw new Error(`Supply finalCorrections from the journal for recovery at round 3 or later; round-${limit} recovery requires it`);
  if(config.completedReviewRound>0&&!/^[a-f0-9]{40}$/.test(config.reviewedHead??''))throw new Error('Supply reviewedHead from the journal when recovering a review round');
  if(config.completedRoundReviews!==undefined&&(!Number.isInteger(config.completedRoundReviews)||config.completedRoundReviews<1||config.completedReviewRound<1))throw new Error('Supply completedRoundReviews from the journal as a positive integer, and only with a nonzero completedReviewRound');
}

const planFields = ["pr", "first", "completedReviewRound", "reviewedHead", "completedRoundReviews", "finalCorrections", "reviewRoundLimit", "extendedReviewAuthorization", "slotWaitSeconds", "reportPosting"];

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
    if (step?.reviewers !== undefined && (!Number.isInteger(step.reviewers) || step.reviewers < 1 || step.reviewers > 3)) throw new Error(`Step ${name} reviewers must be its round's planned reviewer count, an integer from 1 through 3`);
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

// Records the comment the coordinator posted for a reviewer without GitHub
// access. The read-back body must be one line saying it is posted on the
// reviewer's behalf, a blank line, and the reviewer's report verbatim, with
// at most the host's attribution footer after it. A journal whose last row is
// the `report-posted` row of this same comment (its `finished` row was never
// written) takes the missing row without a second post.
export function recordCoordinatorReport(journalFile, commentId, readBackFile) {
  if (!/^[1-9][0-9]*$/.test(String(commentId)) || !Number.isSafeInteger(Number(commentId))) throw new Error("Supply the posted comment's numeric ID");
  const rows = fs.readFileSync(journalFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const last = rows.at(-1);
  const posted = last?.event === "report-posted" ? last : undefined;
  const pending = posted ? rows.findLast((row) => row.event === "report-awaiting-post") : last;
  if (pending?.event !== "report-awaiting-post") throw new Error("Journal does not end awaiting a coordinator-posted report");
  const report = fs.readFileSync(pending.report, "utf8");
  if (sha256(report) !== pending.reportSha256) throw new Error(`Reviewer report at ${pending.report} changed since the launcher recorded it`);
  const body = normalizeBody(fs.readFileSync(readBackFile, "utf8"));
  const content = normalizeBody(body.replace(attributionFooter, ""));
  const split = content.indexOf("\n\n");
  const prefix = split > 0 ? content.slice(0, split) : "";
  if (!prefix || prefix.includes("\n") || !/behalf/i.test(prefix) || content.slice(split + 2) !== normalizeBody(report)) throw new Error("The posted comment must be one line saying it is posted on the reviewer's behalf and why, a blank line, then the reviewer's report verbatim");
  const record = { event: "report-posted", index: pending.index, step: pending.step, head: pending.head, commentId: Number(commentId), postedBy: "coordinator", readBackSha256: sha256(body) };
  if (posted && (posted.commentId !== record.commentId || posted.readBackSha256 !== record.readBackSha256)) throw new Error(`Journal already records comment ${posted.commentId} for this report; a different comment or read-back cannot complete it`);
  const fd = fs.openSync(journalFile, "a");
  try {
    for (const row of posted ? [{ event: "finished" }] : [record, { event: "finished" }]) {
      fs.writeSync(fd, JSON.stringify({ time: new Date().toISOString(), ...row }) + "\n");
      fs.fsyncSync(fd);
    }
  } finally { fs.closeSync(fd); }
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

export function routeFailure(text) {
  const line = text.split(/\r?\n/).reverse().find((candidate) => routeFailurePattern.test(candidate));
  return line?.trim().slice(0, 400);
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
export async function runHandoff(configFile, { slotRoot, identifyProcess = processIdentity, automaticJob, jobRoot, listComments = listPrComments, probeTimeoutMs } = {}) {
  const config = read(configFile);
  if (config.continuation) throw new Error('Automatic continuation requires review-supervisor capability preflight');
  validatePlanShape(config);
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
  // A Codex authentication secret reaches only the reviewer's private home; no
  // child, the version probe included, inherits the variable.
  const authSecrets = Object.values(config.steps).map((step) => step.permissions?.codexAuthEnv).filter((name) => typeof name === "string");
  const probeEnv = { ...process.env };
  for (const name of authSecrets) delete probeEnv[name];
  for (const step of Object.values(config.steps)) {
    if (step.execution) executionCommands(step.execution, cwd);
    if(step.nativeResult!==undefined&&!['claude-json','codex-jsonl'].includes(step.nativeResult))throw new Error('Unsupported native reviewer result transport');
    if(step.nativeResult==='codex-jsonl') {
      validateCodexReviewer(step,{reviewer:config.reviewer,worktree:cwd,jobDir:path.dirname(journal)});
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
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const lock = git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-handoff.lock']);
  let owner;
  try { owner = fs.openSync(lock, "wx"); }
  catch(error) {
    if(error.code==="EEXIST")throw new Error(`EEXIST: a coordinator already owns this worktree; inspect ${lock} and await confirmed exit`);
    throw error;
  }
  let fd;
  const append = (row) => { fs.writeSync(fd, JSON.stringify({ time: new Date().toISOString(), ...row }) + "\n"); fs.fsyncSync(fd); };
  let current = config.first;
  let completedRound = config.completedReviewRound;
  let reviewedHead = config.reviewedHead ?? null;
  let completedRoundReviews = config.completedRoundReviews ?? null;
  let finalCorrections = config.finalCorrections ?? false;
  let activeChild, pendingReport;
  const usedReports=new Set();
  const coordinatorPosts = config.reportPosting === "coordinator";
  try {
    const freeze=git(cwd,['rev-parse','--path-format=absolute','--git-path','agent-review-job.json']);
    if(fs.existsSync(freeze)) {
      const claim=read(freeze);
      if(claim.jobId!==automaticJob?.jobId||fs.realpathSync.native(claim.jobDir)!==fs.realpathSync.native(automaticJob.jobDir))throw new Error('Worktree reserved by automatic review job; claim or cancel that job first');
    } else if(automaticJob)throw new Error('Automatic review ownership marker missing');
    fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, processIdentity: processIdentity(process.pid), startedAt: new Date().toISOString(), journal }));
    fd = fs.openSync(journal, "wx");
    // Job cleanup retains a job directory while any process a journal names is running.
    append({ event: "coordinator", pid: process.pid, processIdentity: processIdentity(process.pid) });
    for (let index = 0; current; index++) {
      if(automaticJob)await retryBusy(()=>withJob(automaticJob.jobDir,rows=>{if(rows.some(row=>row.event==='workflow-cancelled'))throw new Error('Automatic review workflow cancelled; no further reviewer dispatch');}));
      if (index >= config.maxSteps) throw new Error("Handoff step budget reached; human review required");
      const step = config.steps[current];
      if (!step) throw new Error(`Unknown step: ${current}`);
      const plannedPending = step.role === "review" && plannedReviewerPending(step.round, completedRound, completedRoundReviews, step.reviewers);
      if (step.role === "review") checkReviewRound(step.round, completedRound, finalCorrections && !plannedPending, reviewRoundLimit);
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
      append({ event: "launching", index, step: current, role: step.role, model: step.model, ...(step.role === "review" ? reviewerRow : {}), round: step.round, completedRound, reviewedHead, completedRoundReviews, finalCorrections, head, output, diagnostics, completion, args,reportNotBefore,reportToken,...(coordinatorPosts ? { reportPosting: "coordinator", report: reportFile } : {}) });
      const log = fs.openSync(output, "wx");
      let stderr;
      try{stderr=diagnostics===output?log:fs.openSync(diagnostics,'wx');}catch(error){fs.closeSync(log);throw error;}
      const closeLogs=()=>{try{fs.closeSync(log);}finally{if(stderr!==log)fs.closeSync(stderr);}};
      let slot,env;
      const discardAuth=()=>discardCodexAuthCopy(step,env);
      try {
        env=step.role==='review'?nativeReviewerEnvironment(step,artifacts,process.env,{worktree:cwd,reportPosting:config.reportPosting}):{...process.env};
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
      const accessPrompt = step.nativeResult === "codex-jsonl" && codexReviewMode(step) === "full-access" ? `\nExecution access: you run without a sandbox, as the user, under the repository's shared hook policy (typed issues, shared stash, local test runs, write hazards). The reviewed checkout ${cwd} is frozen: do not modify it. For executable evidence, clone reviewed head ${head} into your private directory, install dependencies there with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1, and run tests, including probes you write, only through node scripts/test-suite.mjs run <package> <test-file> [test-file ...] --wait <seconds>, which takes the machine-wide reservation. Record each command and its result in your report.\n` : "";
      const editorPrompt = step.execution?.some(op => op.kind === "editor") ? `\nEditor delegation: read ${path.join(cwd, ".agents/skills/review-pr/references/editor-delegation.md")}. For an editor operation, use ${executionClient} <operation-id> <absolute-request.json>. Write that JSON with your editor tool in your private directory. The coordinator starts the supported editor/player driver, applies bounded UI data and returns its transcript. The client saves PNG copies in your current private directory; open and inspect those images. Each requestId runs once; use a fresh requestId for a new attempt and repeat the identical request to retrieve retained evidence. The operation's maxRequests bounds attempts. The coordinator owns and stops this separate session after your process exits. Do not run up/down directly for this delegation or claim the lens was performed without inspecting successful task evidence and screenshots.\n` : "";
      try {
        if (step.execution) {
          const directory = fs.mkdtempSync(path.join(artifacts, "execution-"));
          executionService = await startExecutionService({ operations: step.execution, root: cwd, directory, head });
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
      try { append({ event: "exited", index, step: current, ...result }); }
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
        done = awaiting ? { head, next: null, commentIds: [], summary: `Derived from the reviewer's final report ${reportFile}; no completion artifact was found at the launcher's path` } : deriveMissingCompletion(step, config.pr, head, reportNotBefore, reportToken, cwd, usedReports, { listComments });
        if (!done) { error.message += `; no report naming head ${head} was posted since launch`; throw error; }
        append({ event: "completion-artifact-missing", index, step: current, completion, commentIds: done.commentIds });
      }
      if (done.head !== gitHead(cwd) || typeof done.summary !== "string" || !done.summary.trim() || !Array.isArray(done.commentIds) || !done.commentIds.every(Number.isSafeInteger)) throw new Error("Invalid or stale completion artifact");
      if (!(step.next.includes(done.next))) throw new Error("Undeclared transition");
      if (awaiting && done.commentIds.length) throw new Error("A reviewer without GitHub access reported posted comment IDs; its report is posted by the coordinator");
      if (step.role !== "implement" && !awaiting && !done.commentIds.length) throw new Error("Review/adjudication needs posted comment IDs");
      for (const id of done.commentIds) {
        if(automaticJob&&usedReports.has(id))throw new Error('Each automatic reviewer requires distinct report IDs');
        await verifyReviewComment(id, config.pr, done.head, cwd,{notBefore:automaticJob?reportNotBefore:undefined});
        usedReports.add(id);
      }
      if (gitStatus(cwd)) throw new Error("Role left uncommitted work");
      if (step.role === "review") {
        completedRoundReviews = step.round > completedRound ? 1 : completedRoundReviews === null ? null : completedRoundReviews + 1;
        if (step.round > completedRound || head !== reviewedHead) finalCorrections = false;
        completedRound = step.round; reviewedHead = head;
      }
      if (step.role !== "review" && completedRound === reviewRoundLimit && done.head !== reviewedHead) finalCorrections = true;
      append({ head:done.head,next:done.next,commentIds:done.commentIds,summary:done.summary,event: "completed", index, step: current, completedRound, reviewedHead, completedRoundReviews, finalCorrections });
      pendingReport = awaiting;
      current = done.next;
    }
    // The chain finishes when record-report adds the posted comment's ID.
    if (pendingReport) append({ event: "report-awaiting-post", ...pendingReport });
    else append({ event: "finished" });
  } catch (error) {
    if (fd !== undefined) {
      try { append({ event: "blocked", ...failureDetails(error) }); }
      catch(journalError){error.message += `; blocked journal write failed: ${journalError.message}`;}
    }
    throw error;
  } finally {
    try { if (fd !== undefined) fs.closeSync(fd); }
    finally { try { fs.closeSync(owner); } finally { if (!activeChild) fs.unlinkSync(lock); } }
  }
  return { journal, pendingReport };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "record-report") {
    try {
      if (process.argv.length !== 6) throw new Error("Usage: node scripts/agent-handoff.mjs record-report <absolute-journal> <comment-id> <read-back-body-file>");
      recordCoordinatorReport(process.argv[3], process.argv[4], process.argv[5]);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else runHandoff(process.argv[2]).then(({ journal, pendingReport }) => {
    if (pendingReport) console.log(`Reviewer report awaiting the coordinator's post: ${pendingReport.report}. Post it verbatim after one line saying it is posted on the reviewer's behalf and why, read the comment back into a file, then run: node scripts/agent-handoff.mjs record-report ${journal} <comment-id> <read-back-body-file>`);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
