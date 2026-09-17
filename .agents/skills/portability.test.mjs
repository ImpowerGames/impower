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
  ".agents/skills/references/runner-reviewer-defaults.md",
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
// Wording is free to change; only mechanical properties are checked here. The
// rules the review workflow must keep are listed in references/skill-maintenance.md.
assert.doesNotMatch(prompt, /runtime identity|runtime introspection|self-report|reviewer route mismatch|identity check validates/i);
// The default remains a three-round autonomous cap. Extensions are only valid
// with caller-recorded, explicit user authorization and remain bounded by the
// launcher's reviewRoundLimit validation.
assert.doesNotThrow(() => checkReviewRound(3, 2, false));
assert.throws(() => checkReviewRound(4, 3, false), /1..3/);
assert.doesNotThrow(() => checkReviewRound(4, 3, false, 4));
// The workflow prose must name the launcher fields that gate round extensions.
for (const field of ["reviewRoundLimit", "extendedReviewAuthorization"]) assert.ok(prompt.includes(field), field);
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
for (const rule of ["Never use the shared Git stash", "type in the creation call", "editor capability", "paginated API", "one writer per file", "1024 MB", "scratch repository", "review-feature-engineering/SKILL.md", "review-feature-experience/SKILL.md"]) assert.ok(instructions.includes(rule), rule);
// The feature review skills share one mechanics reference, and they read the
// filing model from the marker file-feature writes; both are mechanical
// properties, while the rules themselves are the editor's checklist in
// references/skill-maintenance.md.
for (const skill of ["review-feature-engineering", "review-feature-experience"]) assert.ok(fs.readFileSync(path.join(root, ".agents/skills", skill, "SKILL.md"), "utf8").includes("(../references/feature-review.md)"), skill + " links the shared reference");
const filedBy = "Filed by <model> at reasoning effort <effort>";
for (const file of [".agents/skills/file-feature/references/publishing.md", ".agents/skills/references/feature-review.md"]) assert.ok(fs.readFileSync(path.join(root, file), "utf8").includes(filedBy), file + " names the filing-model marker");
console.log(`PASS: ${skills.length} shared skills, forbidden-reference mutation controls, review contracts and generated runner configuration`);
