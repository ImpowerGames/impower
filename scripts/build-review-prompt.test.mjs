import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { buildReviewPrompt } from "./build-review-prompt.mjs";

const context = { writer: "writer-1", reviewer: "reviewer-2", invocation: "fresh CLI process with explicit model arguments", issue: 496, pr: 521, round: 1, head: "a".repeat(40), worktree: process.cwd(), diff: path.resolve("diff.patch"), reviewDir: path.resolve("private"), lens: "undirected", previous: "First round." };
const prompt = buildReviewPrompt(context);
assert.match(prompt, /I am running `writer-1`/);
assert.match(prompt, /reviewer route is `reviewer-2`/);
assert.match(prompt, /gh pr comment 521 --body-file/);
assert.ok(!/\b(?:WRITER|REVIEWER|REVDIR)\b/.test(prompt));
for (const key of ["writer", "reviewer", "invocation"]) {
  for (const value of [undefined, "", key.toUpperCase(), "<model>"]) assert.throws(() => buildReviewPrompt({ ...context, [key]: value }), undefined, key + ":" + value);
}
assert.throws(() => buildReviewPrompt({ ...context, reviewer: "writer-1[1m]" }), /must differ/);
const template = fs.readFileSync(new URL("../.agents/skills/review-pr/references/reviewer-prompt.md", import.meta.url), "utf8");
for (const token of ["WRITER", "REVIEWER", "ROUND", "HEAD", "WORKTREE", "DIFF", "REVDIR", "PREVIOUS", "P", "N", "LENS"]) {
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
const literalPrompt = buildReviewPrompt({ ...context, previous: literal, lens: literal, diff: path.resolve("folder P", "HEAD.patch") });
assert.ok(literalPrompt.includes(literal + " Your job"), "previous evidence must remain literal");
assert.ok(literalPrompt.includes("Your lens is " + literal + ";"), "lens dollar patterns and tokens must remain literal");
assert.ok(literalPrompt.includes(path.resolve("folder P", "HEAD.patch")), "paths must remain literal");
assert.doesNotThrow(() => buildReviewPrompt({ ...context, writer: "o3", reviewer: "provider/model-2" }), "route validation must not assume one naming family");
console.log("PASS: concrete review inputs, missing/placeholder rejection, identity comparison and safe prompt substitution");
