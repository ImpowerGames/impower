import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reviewTemplate } from "../../scripts/build-review-prompt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const skills = files.filter((f) => /^\.agents\/skills\/[^/]+\/SKILL.md$/.test(f));
const forbidden = /\b(?:opus|sonnet|haiku|fable)\b|claude-|gpt-\d|Skill tool|Agent tool|subagent_type|Write\/Edit|set_session_title|scratchpad|CLAUDE\.md/ig;
export const violations = (text) => [...text.matchAll(forbidden)].map((m) => m[0]);
assert.ok(skills.length >= 9, "shared skill discovery is incomplete");
const runnerDocs = new Set([
  ".agents/skills/RUNNERS.md",
  ".agents/skills/references/runner-review.md",
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
const reviewFiles = ["SKILL.md", "references/launch.md", "references/reviewer-prompt.md", "references/adjudication.md", "references/later-rounds.md"];
const prompt = reviewFiles.map((file) => fs.readFileSync(path.join(root, ".agents/skills/review-pr", file), "utf8")).join("\n");
const template = fs.readFileSync(path.join(root, ".agents/skills/review-pr/references/reviewer-prompt.md"), "utf8");
const contracts = ["ABORT: writer model not supplied.", "ABORT: reviewer invocation not supplied.", "ABORT: pin failed, I am <your model id>, same as the writer.", "ABORT: reviewer route mismatch.", "Runtime identity unavailable; configured route only.", "separate fresh serial session", "Wait for each process to exit", "Missing comments alone", "one undirected reviewer", "Already covered:"];
const contractErrors = (text) => contracts.filter((rule) => !text.includes(rule));
contracts.push("unavailable runtime introspection alone is not an abort condition");
assert.deepEqual(contractErrors(prompt), []);
for (const rule of contracts) assert.deepEqual(contractErrors(prompt.replaceAll(rule, "")), [rule], "mutation: " + rule);
// Numerical transitions and recovery behavior are exercised by agent-handoff.test.mjs.
// Keep these policy-only invariants visible in the prompt consumed by reviewers.
for (const rule of ["Record your complete independent first pass", "Separately label unverified concerns and coverage gaps", "Behavior-changing fix commits have themselves been independently reviewed", "Exhausting the cap never grants readiness"]) assert.ok(prompt.includes(rule), rule);
// Concrete event mappings belong in the runner adapter, never policy logic.
for (const file of ["policy.mjs", "typed-issue-hook.mjs", "shared-stash-hook.mjs"]) {
  const source = fs.readFileSync(path.join(root, ".agents/hooks", file), "utf8");
  assert.doesNotMatch(source, /\b(?:claude|codex|opus|sonnet|haiku)\b|gpt-\d/i, file);
}
assert.ok(!/\$\d/.test(prompt), "skill positional substitution must not corrupt reviewer prompts");
const quotedPrompt = reviewTemplate(template);
assert.equal((quotedPrompt.match(/\bWRITER\b/g) ?? []).length, 1, "writer substitution must occur only at its value, not inside the missing-value guard");
assert.equal((quotedPrompt.match(/\bREVIEWER\b/g) ?? []).length, 1, "reviewer substitution must occur only at its value");
const generation = spawnSync(process.execPath, ["scripts/generate-reviewer-agents.mjs", "--check"], { cwd: root, encoding: "utf8" });
assert.equal(generation.status, 0, generation.stdout + generation.stderr);
const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
for (const rule of ["Never use the shared Git stash", "type in the creation call", "editor capability", "paginated API", "one writer per file", "1024 MB", "scratch repository"]) assert.ok(instructions.includes(rule), rule);
console.log(`PASS: ${skills.length} shared skills, forbidden-reference mutation controls, review contracts and generated runner configuration`);
