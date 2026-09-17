import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildReviewPrompt, buildSpecReviewPrompt, specLenses, templateCounts } from "./build-review-prompt.mjs";
import { takeSnapshot, bodyDigest } from "./spec-snapshot.mjs";

const context = { writer: "writer-1", reviewer: "reviewer-2", invocation: "fresh CLI process with explicit model arguments", issue: 496, pr: 521, round: 1, head: "a".repeat(40), worktree: process.cwd(), diff: path.resolve("diff.patch"), reviewDir: path.resolve("private"), lens: "undirected", previous: "First round." };
const prompt = buildReviewPrompt(context);
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
const reviewerRules = [
  "Record your complete independent first pass",
  "Separately label unverified concerns and coverage gaps",
  "Every reviewer, including an undirected reviewer, must check test honesty and repository rules",
];
const missingReviewerRules = (text) => reviewerRules.filter((rule) => !text.includes(rule));
assert.deepEqual(missingReviewerRules(prompt), []);
for (const rule of reviewerRules) {
  const movedToCoordinator = template.replace(rule, "") + "\nCoordinator-only note: " + rule;
  assert.deepEqual(missingReviewerRules(buildReviewPrompt(context, movedToCoordinator)), [rule], "moving a reviewer instruction outside the template must lose coverage: " + rule);
}

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
assert.ok(literalPrompt.includes(literal + " Record your complete independent first pass"), "previous evidence must remain literal");
assert.ok(literalPrompt.includes("Your lens is " + literal + ";"), "lens dollar patterns and tokens must remain literal");
assert.ok(literalPrompt.includes(path.resolve("folder P", "HEAD.patch")), "paths must remain literal");
assert.doesNotThrow(() => buildReviewPrompt({ ...context, writer: "o3", reviewer: "provider/model-2" }), "route validation must not assume one naming family");
console.log("PASS: concrete review inputs, missing/placeholder rejection, identity comparison and safe prompt substitution");

// The spec prompt reviews a frozen snapshot of a Feature and its slices on an
// issue, with the procedure of each named lens inserted from the template file.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-spec-prompt-"));
console.log(`Scratch directory: ${scratch}`);
const specIssues = {
  565: { number: 565, title: "Parent", state: "open", updated_at: "2026-09-16T01:04:43Z", type: { name: "Feature" }, body: "## Problem\n\nSlices: #566 and #570. Related: #479." },
  566: { number: 566, title: "Geometry", state: "open", updated_at: "2026-09-16T00:26:13Z", type: { name: "Task" }, body: "Split from #565. Geometry." },
  570: { number: 570, title: "Toggle", state: "open", updated_at: "2026-09-16T00:26:16Z", type: { name: "Task" }, body: "Split from #565. Toggle." },
  479: { number: 479, title: "Attributes", state: "closed", updated_at: "2026-09-08T00:00:00Z", type: { name: "Feature" }, body: "An earlier feature." },
};
const fetchIssue = (number) => structuredClone(specIssues[number]);
const snapshot = takeSnapshot({ parent: 565, fetchIssue });
const snapshotFile = path.join(scratch, "snapshot.json");
fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
const spec = { target: "issue", writer: "writer-1", reviewer: "reviewer-2", invocation: "fresh CLI process with explicit model arguments", issue: 565, slices: [566, 570], snapshot: snapshotFile, head: "b".repeat(40), worktree: process.cwd(), reviewDir: path.resolve("private"), lens: "feasibility", round: 1, previous: "This is the first round; there is nothing earlier to judge against." };
const specPrompt = buildSpecReviewPrompt(spec);
assert.match(specPrompt, /^Invocation method: fresh CLI process with explicit model arguments\n/);
assert.match(specPrompt, /writer model is `writer-1`/);
assert.match(specPrompt, /reviewer model is `reviewer-2`/);
assert.match(specPrompt, /design of feature #565 /);
assert.match(specPrompt, /slice tickets \(#566, #570\)/);
assert.ok(specPrompt.includes("snapshot file `" + snapshotFile + "`"), "the snapshot path reaches the reviewer");
assert.equal(specPrompt.split(snapshot.digest).length, 3, "the digest is named where the reviewer reads and where it reports");
assert.equal(specPrompt.split("b".repeat(40)).length, 3);
assert.match(specPrompt, /gh issue comment 565 --body-file/);
assert.match(specPrompt, /issues\/565\/comments --paginate/);
assert.match(specPrompt, /Your lens is feasibility\. Trace every claim in the Implementation plan/);
assert.match(specPrompt, /### Spec review — feasibility \(<MODEL>\)/);
assert.doesNotMatch(specPrompt, /eight to ten realistic scripts|interface-exercise|scenario table/);
assert.ok(!/\b(?:WRITER|REVIEWER|ROUND|SLICES|SNAPSHOT|DIGEST|WORKTREE|PROCEDURE|PREVIOUS|REVDIR)\b/.test(specPrompt), "every token is substituted");
assert.doesNotMatch(specPrompt, /runtime identity|self-report|route mismatch|check the pin/i);
const combined = buildSpecReviewPrompt({ ...spec, lens: "language, interface" });
assert.match(combined, /Your lens is language, interface\. The design changes what an author types\./);
assert.match(combined, /eight to ten realistic scripts/);
assert.ok(combined.includes(`node ${process.cwd()}/.agents/skills/review-spec-experience/interface-exercise.mjs check ${snapshotFile}`), "the interface exercise names the checker with the snapshot");
assert.ok(combined.includes(`${process.cwd()}/definitions/yaml/`));
assert.match(combined, /### Spec review — language, interface \(<MODEL>\)/);
assert.doesNotMatch(combined, /scenario table/);
assert.match(buildSpecReviewPrompt({ ...spec, lens: "undirected" }), /Your lens is undirected\. You have no assigned lens/);
assert.match(buildSpecReviewPrompt({ ...spec, lens: "player" }), /scenario table/);
assert.match(buildSpecReviewPrompt({ ...spec, lens: "performance" }), new RegExp(`\`${process.cwd().replaceAll("\\", "\\\\")}/.agents/skills/drive-web-editor/references/performance.md\``));
for (const lens of specLenses) assert.doesNotThrow(() => buildSpecReviewPrompt({ ...spec, lens }), lens);
for (const lens of ["bogus", "", "undirected, feasibility", "feasibility, feasibility", "feasibility;slicing", undefined]) assert.throws(() => buildSpecReviewPrompt({ ...spec, lens }), /lens/i, String(lens));
const parentOnly = path.join(scratch, "parent-only.json");
fs.writeFileSync(parentOnly, JSON.stringify(takeSnapshot({ parent: 479, fetchIssue })));
assert.match(buildSpecReviewPrompt({ ...spec, issue: 479, slices: [], snapshot: parentOnly }), /slice tickets \(none filed\)/, "an unsliced feature reviews its parent alone");
const specRules = ["A finding is accepted only when it states one of", "quoting the ticket text", "named peer system and its source", "proposed follow-up ticket", "forecloses it later", "Record your complete independent first pass", "do not edit any issue", "Separately label unverified concerns"];
for (const rule of specRules) assert.ok(specPrompt.includes(rule), rule);
const specTemplate = fs.readFileSync(new URL("../.agents/skills/references/spec-review-prompt.md", import.meta.url), "utf8");
for (const rule of specRules) {
  const movedToCoordinator = specTemplate.replace(rule, "") + "\nCoordinator-only note: " + rule;
  assert.ok(!buildSpecReviewPrompt(spec, movedToCoordinator).includes(rule), "moving a reviewer instruction outside the template must lose coverage: " + rule);
}
assert.throws(() => buildSpecReviewPrompt({ ...spec, snapshot: path.join(scratch, "missing.json") }), /Cannot read snapshot/);
const tampered = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
tampered.tickets[2].body += " edited";
tampered.tickets[2].bodyDigest = bodyDigest(tampered.tickets[2].body);
fs.writeFileSync(path.join(scratch, "tampered.json"), JSON.stringify(tampered));
assert.throws(() => buildSpecReviewPrompt({ ...spec, snapshot: path.join(scratch, "tampered.json") }), /does not match its digest/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, issue: 567 }), /is of #565, not #567/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, slices: [566] }), /do not match the issue and slices/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, slices: [566, 570, 571] }), /do not match the issue and slices/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, snapshot: "relative.json" }), /absolute snapshot/);
for (const [key, value] of [["writer", "writer-model"], ["reviewer", "reviewer-model"], ["invocation", "TBD - fill this in"]]) assert.throws(() => buildSpecReviewPrompt({ ...spec, [key]: value }), /nonconcrete/);
for (const key of ["writer", "reviewer", "invocation"]) for (const value of [undefined, "", key.toUpperCase(), "<model>"]) assert.throws(() => buildSpecReviewPrompt({ ...spec, [key]: value }), undefined, key + ":" + value);
assert.throws(() => buildSpecReviewPrompt({ ...spec, reviewer: "writer-1[1m]" }), /must differ/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, target: undefined }), /target/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, pr: 521 }), /names an issue, not a pr/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, head: "abc" }), /head SHA/);
for (const round of [0, "1", undefined]) assert.throws(() => buildSpecReviewPrompt({ ...spec, round }), /Invalid round/);
for (const issue of [null, 0, "565"]) assert.throws(() => buildSpecReviewPrompt({ ...spec, issue }), /Invalid issue/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, slices: [565] }), /Invalid slices/);
assert.throws(() => buildSpecReviewPrompt({ ...spec, previous: "" }), /previous/);
for (const key of ["worktree", "reviewDir"]) assert.throws(() => buildSpecReviewPrompt({ ...spec, [key]: "relative" }), new RegExp(`absolute ${key}`));
assert.throws(() => buildReviewPrompt({ ...context, target: "issue" }), /target/, "the PR builder refuses a spec target");
assert.throws(() => buildReviewPrompt({ ...context, snapshot: snapshotFile }), /snapshot/, "the PR builder refuses a snapshot");
assert.deepEqual(templateCounts.review, { WRITER: 1, REVIEWER: 1, ROUND: 2, HEAD: 3, WORKTREE: 1, DIFF: 1, REVDIR: 2, PREVIOUS: 1, P: 4, N: 1, LENS: 2 }, "the PR template's counts are unchanged");
assert.deepEqual(templateCounts.spec, { WRITER: 1, REVIEWER: 1, ROUND: 2, N: 4, SLICES: 1, SNAPSHOT: 1, DIGEST: 2, WORKTREE: 1, HEAD: 2, LENS: 2, PROCEDURE: 1, PREVIOUS: 1, REVDIR: 2 });
assert.deepEqual(Object.keys(templateCounts.lenses), specLenses);
const specStart = specTemplate.indexOf("<!-- spec-review-prompt:start -->"), specEnd = specTemplate.indexOf("<!-- spec-review-prompt:end -->");
const mutateTemplate = (token, replacement) => specTemplate.slice(0, specStart) + specTemplate.slice(specStart, specEnd).replace(new RegExp("\\b" + token + "\\b"), () => replacement) + specTemplate.slice(specEnd);
for (const token of Object.keys(templateCounts.spec)) for (const replacement of ["removed", token + " " + token]) assert.throws(() => buildSpecReviewPrompt(spec, mutateTemplate(token, replacement)), /Unsafe/, token + ": " + replacement);
const playerStart = specTemplate.indexOf("<!-- spec-lens:player:start -->");
assert.throws(() => buildSpecReviewPrompt({ ...spec, lens: "player" }, specTemplate.slice(0, playerStart) + specTemplate.slice(playerStart).replace("Enumerate the scenario table", "Enumerate the scenario table for WORKTREE")), /Unsafe WORKTREE/, "a lens block cannot gain an unpinned token");
const interfaceStart = specTemplate.indexOf("<!-- spec-lens:interface:start -->");
assert.throws(() => buildSpecReviewPrompt({ ...spec, lens: "interface" }, specTemplate.slice(0, interfaceStart) + specTemplate.slice(interfaceStart).replace("check SNAPSHOT", "check the snapshot")), /Unsafe SNAPSHOT/, "a lens block cannot lose a pinned token");
assert.throws(() => buildSpecReviewPrompt(spec, specTemplate.replaceAll("\\<LENS\\>", "LENS")), /Unsafe LENS/);
assert.throws(() => buildSpecReviewPrompt(spec, specTemplate.replace("<!-- spec-lens:feasibility:end -->", "")), /boundaries/);
assert.throws(() => buildSpecReviewPrompt(spec, specTemplate.replace("<!-- spec-review-prompt:end -->", "")), /boundaries/);
assert.equal(buildSpecReviewPrompt(spec, "> Unrelated callout.\n" + specTemplate + "\n> Another callout."), specPrompt);
const specLiteral = "Quoted #N N /N/ HEAD DIGEST SNAPSHOT <LENS> \\<LENS\\> PROCEDURE $& $$ $` $'";
const literalSpec = buildSpecReviewPrompt({ ...spec, previous: specLiteral, reviewDir: path.resolve("folder N", "REVDIR") });
assert.ok(literalSpec.includes(specLiteral + " Record your complete independent first pass"), "previous evidence must remain literal");
assert.ok(literalSpec.includes(path.resolve("folder N", "REVDIR")), "paths must remain literal");
assert.ok(!/\$\d/.test(specTemplate), "the template must not carry positional substitution patterns");
const builder = fileURLToPath(new URL("./build-review-prompt.mjs", import.meta.url));
const contextFile = path.join(scratch, "spec-context.json"), promptFile = path.join(scratch, "spec-prompt.txt");
fs.writeFileSync(contextFile, JSON.stringify(spec));
const cli = spawnSync(process.execPath, [builder, contextFile, promptFile], { encoding: "utf8", windowsHide: true });
assert.equal(cli.status, 0, cli.stderr);
assert.equal(fs.readFileSync(promptFile, "utf8"), specPrompt, "the command line dispatches on the context's target");
fs.writeFileSync(contextFile, JSON.stringify({ ...spec, lens: "bogus" }));
const refused = spawnSync(process.execPath, [builder, contextFile, path.join(scratch, "refused.txt")], { encoding: "utf8", windowsHide: true });
assert.equal(refused.status, 1);
assert.match(refused.stderr, /lens/i);
assert.equal(fs.existsSync(path.join(scratch, "refused.txt")), false);
console.log("PASS: spec prompt from a frozen snapshot with inserted lens procedures, refused snapshots, routes and lenses, pinned token counts for the template and every lens block, and unchanged PR counts");
