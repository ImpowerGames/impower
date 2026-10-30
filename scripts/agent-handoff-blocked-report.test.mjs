// agent-tooling-timeout-ms: 300000
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { runHandoff as actualRunHandoff, recordCoordinatorReport as actualRecord, writeReportReadBack, reviewAccounting, readJournalRows, settleLaunch } from "./agent-handoff.mjs";
import { readRepos } from "../.agents/repos.mjs";
import { roundState } from "../.agents/skills/orchestrate-issues/review-checkpoint.mjs";

const launcher = fileURLToPath(new URL("./agent-handoff.mjs", import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-handoff-blocked-"));
console.log(`Scratch repository: ${scratch}`);
const reposFile = path.join(scratch, "repos-off.json");
fs.writeFileSync(reposFile, JSON.stringify({ ...readRepos(), cutover: false }));
const OFF = readRepos(reposFile);
const runHandoff = (file, options) => actualRunHandoff(file, { repos: OFF, ...options });
const onFile = path.join(scratch, "repos-on.json");
fs.writeFileSync(onFile, JSON.stringify({ ...readRepos(), cutover: true }));
const ON = readRepos(onFile);
const recordCoordinatorReport = (journal, id, file, repos = OFF) => actualRecord(journal, id, file, { repos });
const worktree = path.join(scratch, "repo");
fs.mkdirSync(worktree);
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
git("init");
git("commit", "--allow-empty", "-m", "fixture");
const head = git("rev-parse", "HEAD").trim();
const jobDir = path.join(scratch, "repo.review-jobs", "pr-1948", "round-1");
fs.mkdirSync(jobDir, { recursive: true });

const child = path.join(jobDir, "reviewer.mjs");
fs.writeFileSync(child, [
  'import fs from "node:fs";',
  'let p = ""; for await (const chunk of process.stdin) p += chunk;',
  'if (p.startsWith("Reviewer route probe")) { console.log("OK"); process.exit(0); }',
  'const completion = /Write (.*?) with the editor tool/.exec(p)[1];',
  'const head = /reviewed head=([a-f0-9]+)/.exec(p)[1];',
  'const token = /End your posted report with the line .(handoff-report-[0-9a-f-]+)./.exec(p)[1];',
  'const report = process.argv[process.argv.indexOf("--output-last-message") + 1];',
  'fs.writeFileSync(report, "Could not post: the GraphQL API rate limit is exhausted.\\n\\n### Adversarial review — undirected (reviewer-test)\\n\\nRound 1; reviewed head " + head + ".\\n\\nNo findings.\\n\\n" + token + "\\n");',
  'fs.writeFileSync(completion, JSON.stringify({ head, next: null, commentIds: [], summary: "No findings; posting failed on the GraphQL limit, the writer must post the report." }));',
].join("\n"));
const prompt = path.join(jobDir, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const reportFile = path.join(jobDir, "reviewer-ax-1", "report.md");
fs.mkdirSync(path.dirname(reportFile));
const journal = path.join(jobDir, "launch-ax-1", "journal.jsonl");
const planFile = path.join(jobDir, "launch-ax-1", "plan.json");
fs.mkdirSync(path.dirname(planFile));
const plan = { worktree, pr: 1948, completedReviewRound: 0, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", maxSteps: 1, first: "review-ax", journal, steps: {
  "review-ax": { role: "review", round: 1, reviewerId: "ax", reviewers: ["ax", "undirected"], model: "reviewer-test", executable: process.execPath, args: [child, "--output-last-message", reportFile, "--model", "reviewer-test"], prompt, next: [null] },
} };
fs.writeFileSync(planFile, JSON.stringify(plan));
await assert.rejects(runHandoff(planFile, { jobRoot: scratch, slotRoot: path.join(scratch, "slots") }), /Review\/adjudication needs posted comment IDs/);
const rows = () => readJournalRows(journal);
const events = () => rows().map((row) => row.event);
assert.deepEqual(events().slice(-2), ["exited", "blocked"]);
assert.equal(rows().at(-2).code, 0);
assert.equal(rows().at(-1).reason, "Review/adjudication needs posted comment IDs");
const launching = rows().find((row) => row.event === "launching");
const report = fs.readFileSync(reportFile, "utf8");
assert.ok(report.trimEnd().endsWith(launching.reportToken), "the stand-in's report ends with the launch's token");
const original = fs.readFileSync(journal, "utf8");
const rewrite = (text) => fs.writeFileSync(journal, text);
const rewriteRows = (list) => rewrite(list.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log("PASS: a reviewer that exits 0 with a report and no comment IDs leaves a journal ending exited then blocked");

const readBack = path.join(jobDir, "readback-ax.json");
const threadUrl = `https://api.github.com/repos/${OFF.code}/issues/1948`;
const comment = (body, id = 601, issue_url = threadUrl) => fs.writeFileSync(readBack, JSON.stringify({ id, issue_url, body }));
const line = "Posted on behalf of reviewer `ax`: its own post failed on the GraphQL rate limit.";
const post = (text = report, id = 601) => comment(`${line}\n\n${text}`, id);
const refuses = (pattern, what, prepare = () => {}) => {
  rewrite(original);
  post();
  prepare();
  const before = fs.readFileSync(journal, "utf8");
  assert.throws(() => recordCoordinatorReport(journal, 601, readBack), pattern, what);
  assert.equal(fs.readFileSync(journal, "utf8"), before, `a refusal writes nothing (${what})`);
};
const journalWith = (edit) => () => { const list = rows(); edit(list); rewriteRows(list); };

refuses(/verbatim/, "an edited report is refused", () => post(report.replace("No findings", "Some findings")));
refuses(/verbatim/, "a read-back without the behalf line is refused", () => comment(`Posted by the coordinator.\n\n${report}`));
refuses(/REST API returns it/, "a read-back of the body alone is refused", () => fs.writeFileSync(readBack, `${line}\n\n${report}`));
refuses(/is on https:\/\/api\.github\.com\/repos\/.*\/issues\/77, not review thread .*#1948/, "a comment on another issue is refused", () => comment(`${line}\n\n${report}`, 601, `https://api.github.com/repos/${OFF.internal}/issues/77`));
refuses(/read-back is comment 602, not comment 601/, "a read-back of another comment is refused", () => post(report, 602));
const legacy = journalWith((list) => { delete list.find((row) => row.event === "coordinator").thread; });
refuses(/not a pull request in .*, where this journal's launcher posted reviews/, "a legacy journal refuses a comment outside the code repository", () => { legacy(); comment(`${line}\n\n${report}`, 601, `https://api.github.com/repos/${OFF.internal}/issues/1948`); });
{
  rewrite(original);
  post();
  legacy();
  const before = fs.readFileSync(journal, "utf8");
  assert.throws(() => recordCoordinatorReport(journal, 601, readBack, ON), /names no review thread.*cutover switch on/, "a legacy journal cannot be recorded once the switch is on");
  assert.equal(fs.readFileSync(journal, "utf8"), before, "the refusal writes nothing");
  recordCoordinatorReport(journal, 601, readBack);
  assert.deepEqual(rows().map((row) => row.event).slice(-3), ["completed", "report-posted", "finished"], "a legacy journal is still recorded from a comment on the pull request while the switch is off");
}
refuses(/does not end/, "a journal blocked for another reason is refused", journalWith((list) => { list.at(-1).reason = "Undeclared transition"; }));
refuses(/exit/, "a launch that exited nonzero is refused", journalWith((list) => { list.at(-2).code = 1; }));
refuses(/exit/, "a launch with no exited row is refused", journalWith((list) => { list.splice(list.findIndex((row) => row.event === "exited"), 1); }));
refuses(/report file/, "a launch whose arguments name no report file is refused", journalWith((list) => { const row = list.find((row) => row.event === "launching"); row.args = row.args.filter((arg, i, all) => arg !== "--output-last-message" && all[i - 1] !== "--output-last-message"); }));
refuses(/end with its report token/, "a report without the launch's token is refused", () => fs.writeFileSync(reportFile, report.replace(launching.reportToken, "handoff-report-00000000-0000-4000-8000-000000000000")));
fs.writeFileSync(reportFile, report);
refuses(/name reviewed head/, "a report naming another head is refused", () => { fs.writeFileSync(reportFile, report.split(head).join("0".repeat(40))); post(fs.readFileSync(reportFile, "utf8")); });
fs.writeFileSync(reportFile, report);
refuses(/Reviewer report missing/, "a missing report is refused", () => fs.rmSync(reportFile));
fs.writeFileSync(reportFile, report);
const completionFile = launching.completion;
const completion = fs.readFileSync(completionFile, "utf8");
refuses(/completion artifact/, "a completion artifact naming comment IDs is refused", () => fs.writeFileSync(completionFile, JSON.stringify({ ...JSON.parse(completion), commentIds: [7] })));
refuses(/completion artifact/, "a completion artifact for another head is refused", () => fs.writeFileSync(completionFile, JSON.stringify({ ...JSON.parse(completion), head: "0".repeat(40) })));
refuses(/completion artifact/, "a missing completion artifact is refused", () => fs.rmSync(completionFile));
fs.writeFileSync(completionFile, completion);
console.log("PASS: a blocked journal is completed only with a clean exit on this reason, the launch's own report and a verbatim read-back");

rewrite(original);
assert.deepEqual(rows().find((row) => row.event === "coordinator").thread, { repo: OFF.code, number: 1948, issueUrl: `https://api.github.com/repos/${OFF.code}/issues/1948` }, "the journal names the review thread the coordinator posts on");
post();
const ghReadBack = path.join(jobDir, "readback-gh.json");
const ghCalls = [];
const asGh = (bytes) => (args) => { ghCalls.push(args); return bytes; };
assert.ok([...report].some((character) => character.charCodeAt(0) > 127), "the report carries a character outside ASCII");
assert.throws(() => writeReportReadBack(journal, 601, ghReadBack, { repos: OFF, run: asGh(Buffer.from(JSON.stringify({ id: 600, issue_url: threadUrl, body: report }), "utf8")) }), /no comment 601/, "gh's answer for another comment is refused");
{
  const realExec = childProcess.execFileSync;
  let ghOptions;
  childProcess.execFileSync = (exe, args, options) => {
    if (exe !== "gh") return realExec(exe, args, options);
    ghCalls.push(args);
    ghOptions = options;
    return realExec(process.execPath, ["-e", "process.stdout.write(require('node:fs').readFileSync(process.argv[1]))", readBack], { ...options });
  };
  syncBuiltinESMExports();
  try { writeReportReadBack(journal, 601, ghReadBack, { repos: OFF }); }
  finally { childProcess.execFileSync = realExec; syncBuiltinESMExports(); }
  assert.equal(ghOptions.encoding, undefined, "gh's output is taken as bytes, not decoded text");
}
assert.deepEqual(ghCalls.at(-1), ["api", `repos/${OFF.code}/issues/comments/601`], "the comment is read by id from the review thread's repository");
assert.ok(fs.readFileSync(ghReadBack).equals(fs.readFileSync(readBack)), "the read-back holds gh's bytes unchanged");
execFileSync(process.execPath, [launcher, "record-report", journal, "601", ghReadBack], { encoding: "utf8", windowsHide: true });
let recorded = rows();
assert.deepEqual(recorded.map((row) => row.event).slice(-5), ["exited", "blocked", "completed", "report-posted", "finished"]);
const completed = recorded.find((row) => row.event === "completed");
const exitedAt = recorded.find((row) => row.event === "exited").time;
assert.deepEqual({ ...completed, readBackSha256: undefined, recordedAt: undefined }, { time: exitedAt, event: "completed", index: 0, step: "review-ax", head, next: null, commentIds: [], summary: JSON.parse(completion).summary, reviewerId: "ax", attempt: 1, completedRound: 1, reviewedHead: head, completedRoundReviews: 1, completedRoundReviewers: { ax: 1 }, plannedRoundReviewers: ["ax", "undirected"], pendingReviewers: ["undirected"], finalCorrections: false, postedBy: "coordinator", commentId: 601, readBackSha256: undefined, recordedAt: undefined }, "the completion is dated at the reviewer's exit and names the posted comment");
assert.ok(Date.parse(completed.recordedAt) > Date.parse(exitedAt), "recordedAt is when the row was written");
const posted = recorded.find((row) => row.event === "report-posted");
assert.deepEqual({ ...posted, time: undefined, readBackSha256: undefined }, { time: undefined, readBackSha256: undefined, event: "report-posted", index: 0, step: "review-ax", head, commentId: 601, postedBy: "coordinator" });
assert.match(posted.readBackSha256, /^[0-9a-f]{64}$/);
assert.equal(completed.readBackSha256, posted.readBackSha256);
const accounting = reviewAccounting([{ file: journal, rows: recorded, plan }]);
assert.deepEqual(accounting.rounds[0].completedReviewers, { ax: 1 });
assert.deepEqual(accounting.rounds[0].pending, ["undirected"], "the round still plans only the reviewer that never ran");
assert.deepEqual(accounting.completions[0].comments, [601], "the posted comment is the completion's one report");
assert.deepEqual(accounting.recovery, { completedReviewRound: 1, reviewedHead: head, completedRoundReviews: 1, completedRoundReviewers: { ax: 1 }, plannedRoundReviewers: ["ax", "undirected"] });
const state = roundState([{ file: journal, rows: recorded, plan }]);
assert.deepEqual(state.blockers, ["round 1 still plans undirected"], "the checkpoint counts ax and waits only for the planned reviewer that never ran");
assert.deepEqual(state.reports, [{ round: 1, reviewerId: "ax", attempt: 1, reviewedHead: head, comment: 601 }]);
assert.throws(() => recordCoordinatorReport(journal, 601, readBack), /does not end/, "a completed journal is not completed twice");
console.log("PASS: the posted comment completes the blocked journal and the round accounting counts the reviewer");

const corrected = "b".repeat(40);
const laterTime = (ms) => new Date(Date.parse(exitedAt) + ms).toISOString();
assert.ok(Date.parse(completed.recordedAt) > Date.parse(laterTime(1)), "the record came after the other reviewer's completion");
const undirectedJournal = path.join(jobDir, "launch-undirected-1", "journal.jsonl");
const undirectedRows = [
  { time: laterTime(1), event: "coordinator" },
  { time: laterTime(1), event: "launching", index: 0, step: "review-undirected", role: "review", model: "reviewer-test", round: 1, reviewerId: "undirected", attempt: 1, plannedReviewers: ["ax", "undirected"], completedRound: 1, reviewedHead: head, completedRoundReviews: 1, completedRoundReviewers: { ax: 1 }, plannedRoundReviewers: ["ax", "undirected"], finalCorrections: false, head: corrected },
  { time: laterTime(2), event: "running", index: 0, step: "review-undirected", head: corrected },
  { time: laterTime(3), event: "exited", index: 0, step: "review-undirected", code: 0 },
  { time: laterTime(4), event: "completed", index: 0, step: "review-undirected", head: corrected, next: null, commentIds: [700], summary: "No findings.", reviewerId: "undirected", attempt: 1, completedRound: 1, reviewedHead: corrected, completedRoundReviews: 2, completedRoundReviewers: { ax: 1, undirected: 1 }, plannedRoundReviewers: ["ax", "undirected"], pendingReviewers: [], finalCorrections: false },
  { time: laterTime(5), event: "finished" },
];
const both = [{ file: journal, rows: recorded, plan }, { file: undirectedJournal, rows: undirectedRows, plan: null }];
assert.equal(reviewAccounting(both).reviewedHead, corrected, "the reviewer that completed later on the corrected head is still the latest");
assert.deepEqual(reviewAccounting(both).recovery, { completedReviewRound: 1, reviewedHead: corrected, completedRoundReviews: 2, completedRoundReviewers: { ax: 1, undirected: 1 }, plannedRoundReviewers: ["ax", "undirected"] });
assert.deepEqual(roundState(both).blockers, [], "the round is complete once both journals count");
console.log("PASS: a reviewer that completed later in the round keeps the latest reviewed head when the earlier journal is recorded after it");

const full = recorded;
rewriteRows(full.slice(0, -2));
assert.throws(() => recordCoordinatorReport(journal, 602, readBack), /already records comment 601/, "a different comment cannot complete a record interrupted after its completed row");
post(report + "\n\n---\n_Generated by someone else_");
assert.throws(() => recordCoordinatorReport(journal, 601, readBack), /already records comment 601/, "a different read-back cannot complete a record interrupted after its completed row");
post();
fs.writeFileSync(readBack, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(fs.readFileSync(readBack, "utf8"), "utf16le")]));
recordCoordinatorReport(journal, 601, readBack);
recorded = rows();
assert.deepEqual(recorded.map((row) => row.event).slice(-3), ["completed", "report-posted", "finished"]);
assert.equal(recorded.filter((row) => row.event === "completed").length, 1, "the retry appends only the missing rows");
rewriteRows(full.slice(0, -1));
post(report + "\n\n---\n_Generated by someone else_");
assert.throws(() => recordCoordinatorReport(journal, 601, readBack), /already records comment 601/, "a different read-back cannot complete a partial record");
post();
recordCoordinatorReport(journal, 601, readBack);
recorded = rows();
assert.deepEqual(recorded.map((row) => row.event).slice(-4), ["blocked", "completed", "report-posted", "finished"]);
assert.equal(recorded.filter((row) => row.event === "report-posted").length, 1);
console.log("PASS: a record interrupted before finished is completed by the same command, and a different comment or read-back is refused");

const awaiting = path.join(jobDir, "awaiting.jsonl");
const awaitingReport = path.join(jobDir, "awaiting-report.md");
fs.writeFileSync(awaitingReport, report);
const sha = (text) => execFileSync(process.execPath, ["-e", "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(process.argv[1],'utf8')).digest('hex'))", awaitingReport], { encoding: "utf8", windowsHide: true });
fs.writeFileSync(awaiting, [{ event: "coordinator", thread: { repo: OFF.code, number: 1948, issueUrl: threadUrl } }, { event: "report-awaiting-post", index: 0, step: "review", head, report: awaitingReport, reportSha256: sha() }].map((row) => JSON.stringify(row)).join("\n") + "\n");
post(report, 603);
recordCoordinatorReport(awaiting, 603, readBack);
assert.deepEqual(readJournalRows(awaiting).map((row) => row.event), ["coordinator", "report-awaiting-post", "report-posted", "finished"]);
console.log("PASS: a journal awaiting a coordinator-posted report is still completed without a completed row of its own");

const settledDir = path.join(jobDir, "launch-undirected-settled");
fs.mkdirSync(settledDir);
const settled = path.join(settledDir, "journal.jsonl");
const settledToken = "handoff-report-11e2a76e-4f02-4a23-8dee-2a1186e639de";
const launchedAt = "2026-10-24T05:38:23.822Z";
const coordinatorIdentity = { pid: 43136, start: "639284170971764329" };
const childIdentity = { pid: 44280, start: "639284171174800674" };
const settledCompletion = path.join(settledDir, "completion-0", "completion.json");
const settledPlanFile = path.join(settledDir, "plan.json");
const settledPlan = { worktree, pr: 1948, completedReviewRound: 1, reviewedHead: head, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", maxSteps: 1, first: "undirected", journal: settled, steps: {
  undirected: { role: "review", round: 1, reviewerId: "undirected", reviewers: ["ax", "undirected"], model: "reviewer-test", executable: process.execPath, args: [], prompt, next: [null] },
} };
fs.writeFileSync(settledPlanFile, JSON.stringify(settledPlan));
const settledThread = { repo: OFF.code, number: 1948, issueUrl: threadUrl };
const unsettledRows = [
  { time: "2026-10-24T05:38:20.963Z", event: "coordinator", pid: coordinatorIdentity.pid, processIdentity: coordinatorIdentity, thread: settledThread },
  { time: "2026-10-24T05:38:23.823Z", event: "launching", index: 0, step: "undirected", role: "review", model: "reviewer-test", round: 1, reviewerId: "undirected", attempt: 1, plannedReviewers: ["ax", "undirected"], completedRound: 1, reviewedHead: head, completedRoundReviews: 1, completedRoundReviewers: { ax: 1 }, plannedRoundReviewers: ["ax", "undirected"], finalCorrections: false, head, completion: settledCompletion, reportNotBefore: launchedAt, reportToken: settledToken },
  { time: "2026-10-24T05:38:36.401Z", event: "route-probed", index: 0, model: "reviewer-test" },
  { time: "2026-10-24T05:38:37.469Z", event: "reserved", index: 0, slot: path.join(scratch, "slots", "slot-0.jsonl"), token: "66781144-c87e-4c1c-aef4-f1c06bc9144c", owner: coordinatorIdentity },
  { time: "2026-10-24T05:38:38.602Z", event: "running", index: 0, step: "undirected", pid: childIdentity.pid, startedAt: "2026-10-24T05:38:38.602Z", head, completion: settledCompletion },
  { time: "2026-10-24T05:38:38.603Z", event: "identified", index: 0, step: "undirected", childIdentity, token: "66781144-c87e-4c1c-aef4-f1c06bc9144c" },
];
fs.writeFileSync(settled, unsettledRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
fs.writeFileSync(path.join(settledDir, "agent-handoff.lock.recovered-1792831772796.json"), JSON.stringify({ journal: settled, processIdentity: coordinatorIdentity }));
settleLaunch(settled, { identifyProcess: () => null });
const settledRowsNow = () => readJournalRows(settled);
assert.deepEqual(settledRowsNow().map((row) => row.event).slice(-2), ["confirmed-absent", "blocked"]);
assert.equal(settledRowsNow().at(-1).settledBy, "settle-launch");
const settledOriginal = fs.readFileSync(settled, "utf8");
const settledAccountingBefore = reviewAccounting([{ file: journal, rows: rows(), plan }, { file: settled, rows: settledRowsNow(), plan: settledPlan }]);
assert.deepEqual(settledAccountingBefore.rounds[0].pending, ["undirected"], "before the record, the round still plans the settled reviewer");

const settledReadBack = path.join(settledDir, "read-back-6381200355.json");
const reviewerReport = `### Adversarial review — undirected (reviewer-test)\n\nRound 1; reviewed head ${head}.\n\nNo findings.\n\n${settledToken}`;
const reviewerComment = ({ body = reviewerReport, id = 6381200355, issue_url = threadUrl, created_at = "2026-10-24T07:00:44Z" } = {}) => fs.writeFileSync(settledReadBack, JSON.stringify({ id, issue_url, created_at, body }));
const recordSettled = (id = 6381200355) => recordCoordinatorReport(settled, id, settledReadBack);
const refusesSettled = (pattern, what, prepare = () => {}) => {
  fs.writeFileSync(settled, settledOriginal);
  fs.rmSync(path.dirname(settledCompletion), { recursive: true, force: true });
  reviewerComment();
  prepare();
  const before = fs.readFileSync(settled, "utf8");
  assert.throws(() => recordSettled(), pattern, what);
  assert.equal(fs.readFileSync(settled, "utf8"), before, `a refusal writes nothing (${what})`);
};
const settledWith = (edit) => () => { const list = settledRowsNow(); edit(list); fs.writeFileSync(settled, list.map((row) => JSON.stringify(row)).join("\n") + "\n"); };
const otherToken = "handoff-report-00000000-0000-4000-8000-000000000000";
refusesSettled(/end with the launch's report token/, "a comment ending with another launch's token is refused", () => reviewerComment({ body: reviewerReport.replace(settledToken, otherToken) }));
refusesSettled(/end with the launch's report token/, "a comment quoting the token before its end is refused", () => reviewerComment({ body: `${reviewerReport}\n\nMore text after the token.` }));
refusesSettled(/name reviewed head/, "a comment naming another head is refused", () => reviewerComment({ body: reviewerReport.split(head).join("0".repeat(40)) }));
refusesSettled(/not review thread .*#1948/, "a comment on another issue is refused", () => reviewerComment({ issue_url: `https://api.github.com/repos/${OFF.internal}/issues/77` }));
refusesSettled(/read-back is comment 6381200356, not comment 6381200355/, "a read-back of another comment is refused", () => reviewerComment({ id: 6381200356 }));
refusesSettled(/outside launch 0's run/, "a comment posted before the launch is refused", () => reviewerComment({ created_at: "2026-10-24T05:30:00Z" }));
refusesSettled(/outside launch 0's run/, "a comment posted after the reviewer was confirmed absent is refused", () => reviewerComment({ created_at: new Date(Date.now() + 60000).toISOString() }));
refusesSettled(/created_at/, "a read-back without its creation time is refused", () => fs.writeFileSync(settledReadBack, JSON.stringify({ id: 6381200355, issue_url: threadUrl, body: reviewerReport })));
refusesSettled(/confirmed absent/, "a settled journal without its confirmed-absent row is refused", settledWith((list) => { list.splice(list.findIndex((row) => row.event === "confirmed-absent"), 1); }));
refusesSettled(/names no review thread/, "a settled journal whose coordinator row names no thread is refused", settledWith((list) => { delete list.find((row) => row.event === "coordinator").thread; }));
refusesSettled(/report token/, "a settled launch that is not a review is refused", settledWith((list) => { list.find((row) => row.event === "launching").role = "implement"; }));
refusesSettled(/does not end/, "a journal blocked for another reason is still refused", settledWith((list) => { delete list.at(-1).settledBy; }));
refusesSettled(/completion artifact/, "a completion artifact naming another comment is refused", () => { fs.mkdirSync(path.dirname(settledCompletion), { recursive: true }); fs.writeFileSync(settledCompletion, JSON.stringify({ head, next: null, commentIds: [7], summary: "No findings." })); });
refusesSettled(/completion artifact/, "a completion artifact for another head is refused", () => { fs.mkdirSync(path.dirname(settledCompletion), { recursive: true }); fs.writeFileSync(settledCompletion, JSON.stringify({ head: "0".repeat(40), next: null, commentIds: [], summary: "No findings." })); });
for (const value of [null, false, 0, "", {}]) refusesSettled(/completion artifact/, `a completion artifact holding ${JSON.stringify(value)} is refused`, () => { fs.mkdirSync(path.dirname(settledCompletion), { recursive: true }); fs.writeFileSync(settledCompletion, JSON.stringify(value)); });
refusesSettled(/completion artifact path/, "a launch recording no completion path is refused", settledWith((list) => { delete list.find((row) => row.event === "launching").completion; }));
{
  const twoWays = { ...settledPlan, steps: { undirected: { ...settledPlan.steps.undirected, next: [null, "implement"] } } };
  refusesSettled(/transition/, "a review with two transitions and no completion artifact is refused", () => fs.writeFileSync(settledPlanFile, JSON.stringify(twoWays)));
  fs.writeFileSync(settledPlanFile, JSON.stringify(settledPlan));
}
refusesSettled(/no launcher plan/, "a settled journal no plan names is refused", () => fs.writeFileSync(settledPlanFile, JSON.stringify({ ...settledPlan, journal: path.join(settledDir, "other.jsonl") })));
fs.writeFileSync(settledPlanFile, JSON.stringify(settledPlan));
console.log("PASS: a settled journal is completed only by the reviewer's own report for this launch, posted on its thread during its run");

fs.writeFileSync(settled, settledOriginal);
fs.rmSync(path.dirname(settledCompletion), { recursive: true, force: true });
reviewerComment();
execFileSync(process.execPath, [launcher, "record-report", settled, "6381200355", settledReadBack], { encoding: "utf8", windowsHide: true });
const settledFull = settledRowsNow();
assert.deepEqual(settledFull.map((row) => row.event).slice(-5), ["confirmed-absent", "blocked", "completed", "report-posted", "finished"]);
const settledCompleted = settledFull.find((row) => row.event === "completed");
assert.deepEqual({ ...settledCompleted, readBackSha256: undefined, recordedAt: undefined, summary: undefined }, { time: "2026-10-24T07:00:44.000Z", event: "completed", index: 0, step: "undirected", head, next: null, commentIds: [], summary: undefined, reviewerId: "undirected", attempt: 1, completedRound: 1, reviewedHead: head, completedRoundReviews: 2, completedRoundReviewers: { ax: 1, undirected: 1 }, plannedRoundReviewers: ["ax", "undirected"], pendingReviewers: [], finalCorrections: false, postedBy: "reviewer", commentId: 6381200355, readBackSha256: undefined, recordedAt: undefined }, "the completion is dated at the reviewer's post and carries the round accounting");
assert.match(settledCompleted.summary, /6381200355/);
const settledPosted = settledFull.find((row) => row.event === "report-posted");
assert.deepEqual({ ...settledPosted, time: undefined, readBackSha256: undefined }, { time: undefined, readBackSha256: undefined, event: "report-posted", index: 0, step: "undirected", head, commentId: 6381200355, postedBy: "reviewer" });
assert.equal(settledCompleted.readBackSha256, settledPosted.readBackSha256);
const withSettled = [{ file: journal, rows: rows(), plan }, { file: settled, rows: settledFull, plan: settledPlan }];
const settledAccounting = reviewAccounting(withSettled);
assert.deepEqual(settledAccounting.rounds[0].completedReviewers, { ax: 1, undirected: 1 });
assert.deepEqual(settledAccounting.rounds[0].pending, [], "the round counts the settled reviewer");
assert.equal(settledAccounting.rounds[0].complete, true);
assert.deepEqual(settledAccounting.completions.find((completion) => completion.file === settled).comments, [6381200355]);
assert.deepEqual(roundState(withSettled).blockers, [], "the checkpoint no longer waits for the settled reviewer");
assert.throws(() => recordSettled(), /does not end/, "a completed settled journal is not completed twice");
console.log("PASS: the reviewer's own comment completes the settled journal and the round counts the reviewer");

fs.writeFileSync(settled, settledOriginal);
fs.mkdirSync(path.dirname(settledCompletion), { recursive: true });
fs.writeFileSync(settledCompletion, JSON.stringify({ head, next: null, commentIds: [6381200355], summary: "No findings; report posted." }));
reviewerComment();
recordSettled();
assert.equal(settledRowsNow().find((row) => row.event === "completed").summary, "No findings; report posted.");
fs.rmSync(path.dirname(settledCompletion), { recursive: true, force: true });

fs.writeFileSync(settled, settledFull.slice(0, -2).map((row) => JSON.stringify(row)).join("\n") + "\n");
assert.throws(() => recordSettled(6381200356), /already records comment 6381200355/, "a different comment cannot complete an interrupted settled record");
reviewerComment({ body: `${reviewerReport}\n\n---\n_Generated by someone else_` });
assert.throws(() => recordSettled(), /already records comment 6381200355/, "a different read-back cannot complete an interrupted settled record");
reviewerComment();
recordSettled();
assert.deepEqual(settledRowsNow().map((row) => row.event).slice(-4), ["blocked", "completed", "report-posted", "finished"]);
assert.equal(settledRowsNow().filter((row) => row.event === "completed").length, 1, "the retry appends only the missing rows");
console.log("PASS: an interrupted settled record is completed by the same command, and a different comment or read-back is refused");
fs.rmSync(scratch, { recursive: true, force: true });
