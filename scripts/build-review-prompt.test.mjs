import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { buildReviewPrompt } from "./build-review-prompt.mjs";
import { reviewJobRoot } from "./review-job-root.mjs";

// Paths under the real job root are only named, never created: containment
// resolves a path that does not exist through its nearest existing ancestor.
const round = path.join(reviewJobRoot(process.cwd()), "pr-521", "round-1");
const context = { writer: "writer-1", reviewer: "reviewer-2", invocation: "fresh CLI process with explicit model arguments", issue: 496, pr: 521, round: 1, head: "a".repeat(40), worktree: process.cwd(), diff: path.join(round, "diff.patch"), reviewDir: path.join(round, "reviewer-a-1"), lens: "undirected", previous: "First round.", task: "Authors can blink a portrait's eyes." };
const prompt = buildReviewPrompt(context);
// The diff and reviewer directory reach a reviewer only through the prompt, so
// the builder refuses them outside the job root, naming each.
assert.throws(() => buildReviewPrompt({ ...context, diff: path.resolve("diff.patch") }), (error) => /Review job paths must lie under .*: diff /.test(error.message) && !/reviewDir/.test(error.message));
assert.throws(() => buildReviewPrompt({ ...context, reviewDir: path.resolve("private") }), /Review job paths must lie under .*: reviewDir /);
const unlinked = buildReviewPrompt({ ...context, issue: null });
assert.match(unlinked, /reviewing a change with no linked issue/);
assert.ok(!unlinked.includes("issue #"));
assert.match(unlinked, /gh pr comment 521 --body-file/);
for (const issue of [undefined, 0, -1, "none"]) assert.throws(() => buildReviewPrompt({ ...context, issue }), /Invalid issue/);
assert.match(prompt, /writer model is `writer-1`/);
assert.match(prompt, /reviewer model is `reviewer-2`/);
assert.doesNotMatch(prompt, /runtime identity|self-report|route mismatch|check the pin/i);
assert.match(prompt, /gh pr comment 521 --body-file/);
assert.ok(!/\b(?:WRITER|REVIEWER|REVDIR)\b/.test(prompt));
for (const key of ["writer", "reviewer", "invocation"]) {
  for (const value of [undefined, "", key.toUpperCase(), "<model>"]) assert.throws(() => buildReviewPrompt({ ...context, [key]: value }), undefined, key + ":" + value);
}
assert.throws(() => buildReviewPrompt({ ...context, reviewer: "writer-1[1m]" }), /must differ/);
const template = fs.readFileSync(new URL("../.agents/skills/review-pr/references/reviewer-prompt.md", import.meta.url), "utf8");
// Only the delimited block reaches reviewers; prose outside it is coordinator
// context. The wording inside the block is free to change.
assert.ok(!prompt.includes("All commands run from the worktree root"), "text outside the delimited block must not reach reviewers");

assert.match(prompt, /is: Authors can blink a portrait's eyes\./);
for (const task of [undefined, "", "   "]) assert.throws(() => buildReviewPrompt({ ...context, task }), /task/);
for (const token of ["WRITER", "REVIEWER", "ROUND", "HEAD", "WORKTREE", "DIFF", "REVDIR", "PREVIOUS", "TASK", "P", "N", "LENS"]) {
  const boundary = template.indexOf("<!-- review-prompt:start -->");
  const prefix = template.slice(0, boundary), body = template.slice(boundary);
  for (const replacement of ["removed", token + " " + token]) assert.throws(() => buildReviewPrompt(context, prefix + body.replace(new RegExp("\\b" + token + "\\b"), () => replacement)), /Unsafe/, token);
}
assert.equal(buildReviewPrompt(context, "> Unrelated callout.\n" + template + "\n> Another callout."), prompt);
assert.throws(() => buildReviewPrompt(context, template.replaceAll("\\<LENS\\>", "LENS")), /Unsafe LENS/);
assert.throws(() => buildReviewPrompt(context, template.replace("<!-- review-prompt:end -->", "")), /boundaries/);
assert.throws(() => buildReviewPrompt(context, template + "\n<!-- review-prompt:start -->"), /boundaries/);
for (const [key, value] of [["writer", "writer-model"], ["reviewer", "reviewer-model"], ["invocation", "TBD - fill this in"]]) assert.throws(() => buildReviewPrompt({ ...context, [key]: value }), /nonconcrete/);
for (const invocation of ["method: TBD", "see <method>", "Invocation: UNKNOWN."]) assert.throws(() => buildReviewPrompt({ ...context, invocation }), /nonconcrete/);
assert.doesNotThrow(() => buildReviewPrompt({ ...context, invocation: "Fresh CLI process; the prior report quoted 'method: TBD' as invalid." }));
const literal = "Quoted #P #N P /P/ HEAD <LENS> \\<LENS\\> $& $$ $` $'";
const literalPrompt = buildReviewPrompt({ ...context, previous: literal, lens: literal, task: literal, diff: path.join(round, "folder P", "HEAD.patch") });
assert.ok(literalPrompt.includes("is: " + literal + "."), "task tokens and dollar patterns must remain literal");
assert.ok(literalPrompt.includes(literal + " Record your complete independent first pass"), "previous evidence must remain literal");
assert.ok(literalPrompt.includes("Your lens is " + literal + ";"), "lens dollar patterns and tokens must remain literal");
assert.ok(literalPrompt.includes(path.join(round, "folder P", "HEAD.patch")), "paths must remain literal");
assert.doesNotThrow(() => buildReviewPrompt({ ...context, writer: "o3", reviewer: "provider/model-2" }), "route validation must not assume one naming family");
console.log("PASS: concrete review inputs, missing/placeholder rejection, identity comparison and safe prompt substitution");
