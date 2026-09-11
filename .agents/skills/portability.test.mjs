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
for (const file of files.filter((f) => f.startsWith(".agents/skills/") && f.endsWith(".md") && f !== ".agents/skills/RUNNERS.md")) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  assert.deepEqual(violations(text), [], file);
  if (file.endsWith("/SKILL.md")) assert.match(text, /RUNNERS\.md/, file + " must link runner notes");
}
for (const token of ["opus", "sonnet", "haiku", "fable", "claude-x", "gpt-6-test", "Skill tool", "Agent tool", "subagent_type", "Write/Edit", "set_session_title", "scratchpad", "CLAUDE.md"]) assert.ok(violations("instruction " + token).length, token);
assert.deepEqual(violations("Read the repository's agent instructions; use an editor capability and a private directory."), []);
assert.equal(files.filter((f) => f.startsWith(".claude/skills/")).length, 0);
const prompt = fs.readFileSync(path.join(root, ".agents/skills/review-pr/SKILL.md"), "utf8");
const contracts = ["ABORT: writer model not supplied.", "ABORT: reviewer invocation not supplied.", "ABORT: pin failed, I am <your model id>, same as the writer.", "ABORT: reviewer route mismatch.", "Runtime identity unavailable; configured route only.", "separate fresh serial session", "Wait for each process to exit", "Missing comments alone", "one undirected reviewer", "Already covered:"];
const contractErrors = (text) => contracts.filter((rule) => !text.includes(rule));
contracts.push("unavailable runtime introspection alone is not an abort condition");
assert.deepEqual(contractErrors(prompt), []);
for (const rule of contracts) assert.deepEqual(contractErrors(prompt.replaceAll(rule, "")), [rule], "mutation: " + rule);
for (const rule of ["run one narrow round 4", "do not automatically launch another review", "Keep the PR draft when another independent review", "mark the PR ready for human review", "does not silently reset the count"]) assert.ok(prompt.includes(rule), rule);
// Concrete event mappings belong in the runner adapter, never policy logic.
for (const file of ["policy.mjs", "typed-issue-hook.mjs", "shared-stash-hook.mjs"]) {
  const source = fs.readFileSync(path.join(root, ".agents/hooks", file), "utf8");
  assert.doesNotMatch(source, /\b(?:claude|codex|opus|sonnet|haiku)\b|gpt-\d/i, file);
}
assert.ok(!/\$\d/.test(prompt), "skill positional substitution must not corrupt reviewer prompts");
const quotedPrompt = reviewTemplate(prompt);
assert.equal((quotedPrompt.match(/\bWRITER\b/g) ?? []).length, 1, "writer substitution must occur only at its value, not inside the missing-value guard");
assert.equal((quotedPrompt.match(/\bREVIEWER\b/g) ?? []).length, 1, "reviewer substitution must occur only at its value");
const generation = spawnSync(process.execPath, ["scripts/generate-reviewer-agents.mjs", "--check"], { cwd: root, encoding: "utf8" });
assert.equal(generation.status, 0, generation.stdout + generation.stderr);
const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
for (const rule of ["Never use the shared Git stash", "type in the creation call", "editor capability", "paginated API", "one writer per file", "1024 MB", "scratch repository"]) assert.ok(instructions.includes(rule), rule);
console.log(`PASS: ${skills.length} shared skills, forbidden-reference mutation controls, review contracts and generated runner configuration`);
