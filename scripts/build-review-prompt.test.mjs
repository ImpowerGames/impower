import assert from "node:assert/strict";
import path from "node:path";
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
assert.throws(() => buildReviewPrompt(context, "> WRITER WRITER REVIEWER"), /Unsafe WRITER/);
assert.throws(() => buildReviewPrompt(context, "> WRITER REVIEWER REVIEWER"), /Unsafe REVIEWER/);
console.log("PASS: concrete review inputs, missing/placeholder rejection, identity comparison and safe prompt substitution");
