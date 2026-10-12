import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { buildReviewPrompt } from "./build-review-prompt.mjs";
import { testScratch } from "./review-job-root.mjs";

const scratch = testScratch("review-prompt", process.cwd());
console.log(`Review prompt fixtures: ${scratch}`);
const round = path.join(scratch, "pr-521", "round-1");
fs.mkdirSync(path.join(round, "reviewer-a-1"), { recursive: true });
fs.writeFileSync(path.join(round, "diff.patch"), "diff --git a/caf\u00e9 b/caf\u00e9\n+\u2728\n");
const context = { writer: "writer-1", reviewer: "reviewer-2", invocation: "fresh CLI process with explicit model arguments", issue: 496, pr: 521, round: 1, head: "a".repeat(40), worktree: process.cwd(), diff: path.join(round, "diff.patch"), reviewDir: path.join(round, "reviewer-a-1"), lens: "undirected", previous: "First round.", task: "Authors can blink a portrait's eyes." };
const prompt = buildReviewPrompt(context);
const linkedOut = path.join(round, "unsafe-reviewer");
fs.symlinkSync(process.cwd(), linkedOut, "junction");
assert.throws(() => buildReviewPrompt({ ...context, reviewDir: linkedOut }), /Review job paths must lie under .*reviewDir .*unsafe-reviewer/);
assert.throws(() => buildReviewPrompt({ ...context, diff: path.join(linkedOut, "AGENTS.md") }), /Review job paths must lie under .*diff .*unsafe-reviewer/);
assert.equal(fs.existsSync(path.join(process.cwd(), "AGENTS.md")), true, "unsafe-path refusal preserves its external target");
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
fs.mkdirSync(path.join(round, "folder P"));
fs.writeFileSync(path.join(round, "folder P", "HEAD.patch"), "diff --git a/P b/P\n");
const literalPrompt = buildReviewPrompt({ ...context, previous: literal, lens: literal, task: literal, diff: path.join(round, "folder P", "HEAD.patch") });
assert.ok(literalPrompt.includes("is: " + literal + "."), "task tokens and dollar patterns must remain literal");
assert.ok(literalPrompt.includes(literal + " Record your complete independent first pass"), "previous evidence must remain literal");
assert.ok(literalPrompt.includes("Your lens is " + literal + ";"), "lens dollar patterns and tokens must remain literal");
assert.ok(literalPrompt.includes(path.join(round, "folder P", "HEAD.patch")), "paths must remain literal");
assert.doesNotThrow(() => buildReviewPrompt({ ...context, writer: "o3", reviewer: "provider/model-2" }), "route validation must not assume one naming family");

// Inputs fail on the foreground builder command, before a detached launcher.
const failures = [];
const refuses = (label, changed, expected) => {
  try { assert.throws(() => buildReviewPrompt({ ...context, ...changed }), expected, label); }
  catch (error) { failures.push(`${label}: ${error.message}`); }
};
refuses("missing reviewer directory", { reviewDir: path.join(round, "missing-reviewer") }, /Reviewer directory.*missing-reviewer.*create.*empty/i);
const nonempty = path.join(round, "nonempty-reviewer");
fs.mkdirSync(nonempty);
fs.writeFileSync(path.join(nonempty, "prior-report.md"), "preserve this report");
assert.doesNotThrow(() => buildReviewPrompt({ ...context, reviewDir: nonempty }), "supported pre-launch artifacts must be preserved");
refuses("reviewer path is a file", { reviewDir: context.diff }, /Reviewer directory.*diff\.patch.*directory/i);
refuses("missing diff", { diff: path.join(round, "missing.patch") }, /diff.*missing\.patch.*read/i);
for (const [name, bytes] of [
  ["utf16le", Buffer.from([255, 254, 100, 0, 105, 0])],
  ["utf16be", Buffer.from([254, 255, 0, 100, 0, 105])],
  ["invalid-utf8", Buffer.from([100, 105, 255, 102])],
  ["bomless-utf16le", Buffer.from("diff --git a/a b/a\n+ascii\n", "utf16le")],
  ["bomless-utf16be", Buffer.from("diff --git a/a b/a\n+ascii\n", "utf16le").swap16()],
  ["nul-only", Buffer.from([0])],
  ["trailing-nul", Buffer.from([100, 105, 102, 102, 0])],
  ["truncated-utf8", Buffer.from([100, 105, 102, 102, 226, 130])],
]) {
  const diff = path.join(round, `${name}.patch`);
  fs.writeFileSync(diff, bytes);
  refuses(name, { diff }, /diff.*UTF-8.*git diff.*--output/i);
}
// Textual patches have no raw NUL bytes, including Git's binary patch format.
// Empty patches, a UTF-8 BOM, Unicode and an unterminated final line stay valid.
for (const [name, bytes] of [
  ["empty", Buffer.alloc(0)],
  ["utf8-bom", Buffer.from("\uFEFFdiff --git a/caf\u00e9 b/caf\u00e9\n+\u2728\u{1F680}\n")],
  ["utf8-no-final-newline", Buffer.from("diff --git a/caf\u00e9 b/caf\u00e9\n+\u2728")],
]) {
  const diff = path.join(round, `${name}.patch`);
  fs.writeFileSync(diff, bytes);
  assert.doesNotThrow(() => buildReviewPrompt({ ...context, diff }), name);
}
const gitFixture = path.join(round, "git-patches");
fs.mkdirSync(gitFixture);
console.log(`Git patch fixture repository: ${gitFixture}`);
const git = (...args) => execFileSync("git", args, { cwd: gitFixture, encoding: "utf8", windowsHide: true });
git("init", "--quiet");
fs.writeFileSync(path.join(gitFixture, "text.txt"), "before\n");
fs.writeFileSync(path.join(gitFixture, "binary.bin"), Buffer.from([0, 1, 2]));
git("add", "text.txt", "binary.bin");
git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "base");
fs.writeFileSync(path.join(gitFixture, "text.txt"), "caf\u00e9 \u2728\n");
fs.writeFileSync(path.join(gitFixture, "binary.bin"), Buffer.from([0, 3, 4]));
const gitDiff = path.join(round, "git-produced.patch");
git("diff", "--binary", `--output=${gitDiff}`);
const gitPatch = fs.readFileSync(gitDiff, "utf8");
assert.match(gitPatch, /caf\u00e9 \u2728/);
assert.match(gitPatch, /GIT binary patch/);
assert.doesNotThrow(() => buildReviewPrompt({ ...context, diff: gitDiff }), "Git-produced text and binary patches remain valid");
assert.equal(fs.readFileSync(path.join(nonempty, "prior-report.md"), "utf8"), "preserve this report");
assert.equal(fs.existsSync(path.join(round, "missing-reviewer")), false, "a refusal must not create the requested directory");
assert.deepEqual(failures, [], "every invalid review input must be refused");
console.log("PASS: concrete review inputs, missing/placeholder rejection, identity comparison and safe prompt substitution");
