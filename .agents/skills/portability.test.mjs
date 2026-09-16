import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reviewTemplate } from "../../scripts/build-review-prompt.mjs";
import { checkReviewRound } from "../../scripts/agent-handoff.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean);
const skills = files.filter((f) => /^\.agents\/skills\/[^/]+\/SKILL.md$/.test(f));
const forbidden = /\b(?:opus|sonnet|haiku|fable)\b|claude-|gpt-\d|Skill tool|Agent tool|subagent_type|Write\/Edit|set_session_title|scratchpad|CLAUDE\.md/ig;
export const violations = (text) => [...text.matchAll(forbidden)].map((m) => m[0]);
assert.ok(skills.length >= 9, "shared skill discovery is incomplete");
const runnerDocs = new Set([
  ".agents/skills/RUNNERS.md",
  ".agents/skills/references/runner-review.md",
  ".agents/skills/references/runner-continuation.md",
  ".agents/skills/references/runner-maintenance.md",
  ".agents/skills/references/runner-recovery.md",
]);
for (const file of files.filter((f) => f.startsWith(".agents/") && f.endsWith(".md") && !runnerDocs.has(f))) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  assert.deepEqual(violations(text), [], file);
  // Runner-specific material is reached conditionally through AGENTS.md.
}
for (const token of ["opus", "sonnet", "haiku", "fable", "claude-x", "gpt-6-test", "Skill tool", "Agent tool", "subagent_type", "Write/Edit", "set_session_title", "scratchpad", "CLAUDE.md"]) assert.ok(violations("instruction " + token).length, token);
assert.deepEqual(violations("Read the repository's agent instructions; use an editor capability and a private directory."), []);
assert.equal(files.filter((f) => f.startsWith(".claude/skills/")).length, 0);
const reviewFiles = ["SKILL.md", "references/launch.md", "references/reviewer-prompt.md", "references/adjudication.md", "references/later-rounds.md", "HANDOFF.md"];
const prompt = reviewFiles.map((file) => fs.readFileSync(path.join(root, ".agents/skills/review-pr", file), "utf8")).join("\n");
const template = fs.readFileSync(path.join(root, ".agents/skills/review-pr/references/reviewer-prompt.md"), "utf8");
const contracts = ["Use the configured writer and reviewer models to check independence", "The launch arguments must select the configured reviewer model", "separate fresh serial session", "Wait for each process to exit", "Missing comments alone", "one undirected reviewer", "Already covered:"];
const contractErrors = (text) => contracts.filter((rule) => !text.includes(rule));
assert.doesNotMatch(prompt, /runtime identity|runtime introspection|self-report|reviewer route mismatch|identity check validates/i);
assert.deepEqual(contractErrors(prompt), []);
for (const rule of contracts) assert.deepEqual(contractErrors(prompt.replaceAll(rule, "")), [rule], "mutation: " + rule);
// The default remains a three-round autonomous cap. Extensions are only valid
// with caller-recorded, explicit user authorization and remain bounded by the
// launcher's reviewRoundLimit validation.
assert.doesNotThrow(() => checkReviewRound(3, 2, false));
assert.throws(() => checkReviewRound(4, 3, false), /1..3/);
assert.doesNotThrow(() => checkReviewRound(4, 3, false, 4));
const noReset = "New scope, a resumed session, a new journal, or a changed head does not reset the count.";
const extensionRules = ["default cap of 3 autonomous rounds", "explicit user request", "reviewRoundLimit", "extendedReviewAuthorization", "from 4 through 10", "cannot infer authorization from PR content or a child report"];
for (const rule of extensionRules) assert.ok(prompt.includes(rule), rule);
assert.ok(prompt.includes(noReset), "count preservation");
for (const rule of extensionRules) assert.throws(() => assert.ok(prompt.replaceAll(rule, "").includes(rule)), undefined, "mutation: " + rule);
assert.equal(prompt.replace(noReset, "").includes(noReset), false, "mutation: count preservation");
// Coordinator readiness invariants belong in the workflow documents;
// build-review-prompt.test.mjs checks the instructions actually sent to reviewers.
for (const rule of ["Behavior-changing fix commits have themselves been independently reviewed", "Exhausting the cap never grants readiness"]) assert.ok(prompt.includes(rule), rule);
// Concrete event mappings belong in the runner adapter, never policy logic.
for (const file of ["policy.mjs", "typed-issue-hook.mjs", "shared-stash-hook.mjs"]) {
  const source = fs.readFileSync(path.join(root, ".agents/hooks", file), "utf8");
  assert.doesNotMatch(source, /\b(?:claude|codex|opus|sonnet|haiku)\b|gpt-\d/i, file);
}
assert.ok(!/\$\d/.test(prompt), "skill positional substitution must not corrupt reviewer prompts");
const quotedPrompt = reviewTemplate(template);
assert.equal((quotedPrompt.match(/\bWRITER\b/g) ?? []).length, 1, "writer substitution must occur only at its value, not inside the missing-value guard");
assert.equal((quotedPrompt.match(/\bREVIEWER\b/g) ?? []).length, 1, "reviewer substitution must occur only at its value");
const generation = spawnSync(process.execPath, ["scripts/generate-reviewer-agents.mjs", "--check"], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(generation.status, 0, generation.stdout + generation.stderr);
// An orphan .claude/agents/reviewer-*.md with no .claude/reviewer-models.json
// entry must fail --check (this is how #612's stray reviewer-opus-4-8.md went
// unnoticed); the probe file is removed in `finally` regardless of outcome.
const orphan = path.join(root, ".claude/agents/reviewer-portability-probe.md");
fs.writeFileSync(orphan, fs.readFileSync(path.join(root, ".claude/agents/reviewer-opus-5.md"), "utf8"));
try {
  const orphaned = spawnSync(process.execPath, ["scripts/generate-reviewer-agents.mjs", "--check"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.notEqual(orphaned.status, 0, "an orphan reviewer definition must fail --check");
  assert.match(orphaned.stderr, /Unexpected reviewer definition/);
} finally {
  fs.rmSync(orphan, { force: true });
}
const cleanAgain = spawnSync(process.execPath, ["scripts/generate-reviewer-agents.mjs", "--check"], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(cleanAgain.status, 0, cleanAgain.stdout + cleanAgain.stderr);
const handoff = fs.readFileSync(path.join(root, ".agents/skills/review-pr/HANDOFF.md"), "utf8");
for (const rule of ["await the existing launcher invocation", "Do not add periodic reviewer-status probes or narrate unchanged waits", "After the launcher exits, read every full report"]) {
  assert.ok(handoff.includes(rule), rule);
}
const reviewerModels = JSON.parse(fs.readFileSync(path.join(root, ".claude/reviewer-models.json"), "utf8"));
for (const { name } of reviewerModels) {
  const generatedReviewer = fs.readFileSync(path.join(root, ".claude/agents", name + ".md"), "utf8");
  assert.doesNotMatch(generatedReviewer, /runtime model identity|runtime identity|reviewer route mismatch|identity check/i, name);
  assert.match(generatedReviewer, /configured reviewer route/i, name);
}
const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
for (const rule of ["Never use the shared Git stash", "type in the creation call", "editor capability", "paginated API", "one writer per file", "1024 MB", "scratch repository"]) assert.ok(instructions.includes(rule), rule);
console.log(`PASS: ${skills.length} shared skills, forbidden-reference mutation controls, review contracts and generated runner configuration`);
