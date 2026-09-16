import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runHandoff } from "./agent-handoff.mjs";
import { readReviewerDefaults, resolveReviewer, applyResolvedReviewer, validateReviewerDefaults } from "./reviewer-defaults.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The checked-in table validates against the checked-in reviewer registry and
// resolves the agreed pairings.
const { defaults } = readReviewerDefaults(root);
assert.ok(!defaults.rows.some((row) => [...row.primary, ...row.fallback].some(({ route }) => route.includes("fable"))), "the limited-allowance model never reviews");
const pick = (plan) => { const { reviewer, reviewerEffort } = resolveReviewer(plan, root); return `${reviewer}/${reviewerEffort}`; };
assert.equal(pick({ writer: "claude-opus-5", writerEffort: "low" }), "gpt-5.6-terra/high");
assert.equal(pick({ writer: "claude-opus-5", writerEffort: "medium" }), "gpt-5.6-sol/high");
assert.equal(pick({ writer: "claude-opus-5[1m]", writerEffort: "medium", reviewerFallback: true }), "claude-opus-4-8/high", "a context-window suffix does not change the writer route");
assert.equal(pick({ writer: "claude-opus-5", writerEffort: "low", reviewerFallback: true }), "claude-sonnet-5/high");
assert.equal(pick({ writer: "gpt-5.6-terra", writerEffort: "medium" }), "claude-sonnet-5/high");
assert.equal(pick({ writer: "gpt-5.6-sol", writerEffort: "medium" }), "claude-opus-5/high");
assert.equal(pick({ writer: "gpt-5.6-sol", writerEffort: "medium", reviewerFallback: true }), "gpt-6-astra/medium");
assert.equal(pick({ writer: "gpt-6-astra", writerEffort: "high", reviewerFallback: true }), "gpt-5.6-sol/xhigh");
assert.equal(pick({ writer: "claude-fable-5-1", writerEffort: "medium", reviewerFallback: true }), "claude-opus-5/xhigh");
assert.throws(() => pick({ writer: "claude-opus-5", writerEffort: "xhigh" }), /supply ticketEffort \(high or correctness-critical\)/, "a writer effort shared by two ticket tiers needs the tier");
assert.equal(pick({ writer: "claude-opus-5", writerEffort: "xhigh", ticketEffort: "high" }), "gpt-5.6-sol/xhigh");
assert.equal(pick({ writer: "claude-opus-5", writerEffort: "xhigh", ticketEffort: "correctness-critical", reviewerIndex: 1 }), "gpt-5.6-sol/high", "the second serial reviewer is selected by index");
assert.throws(() => pick({ writer: "claude-opus-5", writerEffort: "medium", reviewerIndex: 1 }), /reviewerIndex must be from 0 through 0/);
assert.throws(() => pick({ writer: "claude-opus-5", writerEffort: "medium", reviewerIndex: null }), /reviewerIndex must be from 0 through 0/, "a null index is refused rather than read as the first reviewer");
assert.throws(() => pick({ writer: "claude-opus-5" }), /writerEffort/, "the writer's effort remains a required input");
assert.throws(() => pick({ writer: "claude-haiku-4-5", writerEffort: "medium" }), /No reviewer default/);
assert.equal(resolveReviewer({ writer: "claude-opus-5", writerEffort: "medium", reviewer: "claude-opus-4-6" }, root).reviewer, "claude-opus-4-6", "an explicit reviewer bypasses the table");
for (const writerEffort of [undefined, "bogus"]) assert.throws(() => resolveReviewer({ writer: "claude-opus-5", writerEffort, reviewer: "gpt-5.6-sol" }, root), /writerEffort/, "an explicit reviewer still requires a valid writer effort");
assert.equal(resolveReviewer({ writer: "gpt-6-astra", writerEffort: "ultra", reviewer: "claude-opus-5" }, root).reviewer, "claude-opus-5", "the Codex ultra effort is a valid writer effort");
for (const writer of ["claude-opus-5", "claude-opus-5[1m]"]) assert.throws(() => resolveReviewer({ writer, writerEffort: "ultra", reviewer: "gpt-5.6-sol" }, root), /writerEffort for claude-opus-5.*\(low, medium, high, xhigh, max\)/, "a Claude writer cannot report ultra");
assert.throws(() => resolveReviewer({ writer: "claude-opus-5", writerEffort: "medium", reviewer: null }, root), /Omit reviewer/);
for (const selector of [{ reviewerEffort: "high" }, { reviewerFallback: true }, { reviewerIndex: 0 }, { ticketEffort: "medium" }]) assert.throws(() => resolveReviewer({ writer: "claude-opus-5", writerEffort: "medium", reviewer: "gpt-5.6-sol", ...selector }, root), /apply only when the reviewer is resolved/, JSON.stringify(selector));

// Schema refusals.
const models = [{ name: "reviewer-a", model: "claude-a" }];
const row = (extra) => ({ ticketEffort: "medium", writer: "claude-w", writerEffort: "medium", primary: [{ route: "gpt-1-x", effort: "high" }], fallback: [{ route: "claude-a", effort: "high" }], ...extra });
assert.doesNotThrow(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row()] }, models));
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row({ writer: "claude-a" })] }, models), /names the writer as its own reviewer/);
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "claude-unregistered", effort: "high" }] })] }, models), /neither a registered reviewer definition/);
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row({ fallback: [{ route: "gpt-1-x", effort: "high" }] })] }, models), /fallback must stay with the writer's vendor/);
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "claude-a", effort: "high" }] })] }, models), /primary must use the other vendor/);
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row(), row()] }, models), /Duplicate/);
assert.throws(() => validateReviewerDefaults({ codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "gpt-1-x", effort: "extreme" }] })] }, models), /Unsupported reviewer effort/);

// A resolved Codex reviewer receives its model and effort as exec arguments.
const codexStep = { role: "review", nativeResult: "codex-jsonl", args: ["exec", "--json", "-"] };
assert.deepEqual(applyResolvedReviewer(codexStep, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), { ...codexStep, model: "gpt-5.6-sol", effort: "high", args: ["exec", "--model", "gpt-5.6-sol", "-c", 'model_reasoning_effort="high"', "--json", "-"] });
for (const selecting of [["-c", 'model_reasoning_effort="low"'], ["-cmodel_reasoning_effort=low"], ["-cmodel=\"gpt-6-astra\""], ["-c=model_reasoning_effort=low"], ["-c", ' model_reasoning_effort="low"'], ["-c", 'MODEL="gpt-6-astra"'], [" --model", "gpt-6-astra"], ["--model=gpt-6-astra"], ["-mgpt-6-astra"], ["-c", 'model="gpt-6-astra"'], ["--config=model_reasoning_effort=\"low\""], ["--config=model=\"gpt-6-astra\""], ["--effort=low"], ["--agent=reviewer-opus-5"]]) {
  assert.throws(() => applyResolvedReviewer({ ...codexStep, args: ["exec", ...selecting, "-"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), /must not select its own model or effort/, selecting.join(" "));
}
assert.doesNotThrow(() => applyResolvedReviewer({ ...codexStep, args: ["exec", "-c", 'model_provider="openai"', "-"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), "other config overrides stay allowed");
assert.throws(() => applyResolvedReviewer({ role: "review", args: ["child.mjs"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), /needs a Codex exec reviewer step/);
const awaitedCodex = { role: "review", args: ["exec", "-C", "/w", "--json", "-o", "/r/final.md", "-"] };
assert.deepEqual(applyResolvedReviewer(awaitedCodex, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }).args, ["exec", "--model", "gpt-5.6-sol", "-c", 'model_reasoning_effort="high"', "-C", "/w", "--json", "-o", "/r/final.md", "-"], "the awaited Codex exec route also receives the resolved model and effort");
assert.throws(() => applyResolvedReviewer(codexStep, { reviewer: "claude-opus-5", reviewerEffort: "high", agent: "reviewer-opus-5" }), /needs a Claude reviewer step/);

// Launcher behavior in a scratch repository with its own registry and table.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-reviewer-defaults-"));
console.log(`Scratch repository: ${scratch}`);
const worktree = path.join(scratch, "repo");
fs.mkdirSync(path.join(worktree, ".claude", "agents"), { recursive: true });
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
const table = {
  codexModels: ["gpt-fixture-writer", "gpt-fixture-reviewer"],
  rows: [
    { ticketEffort: "medium", writer: "claude-fixture-writer", writerEffort: "medium", primary: [{ route: "gpt-fixture-reviewer", effort: "high" }], fallback: [{ route: "claude-fixture-reviewer", effort: "xhigh" }] },
    { ticketEffort: "medium", writer: "gpt-fixture-writer", writerEffort: "medium", primary: [{ route: "claude-fixture-reviewer", effort: "high" }], fallback: [{ route: "gpt-fixture-reviewer", effort: "medium" }] },
  ],
};
const commitConfig = () => {
  fs.writeFileSync(path.join(worktree, ".claude", "reviewer-defaults.json"), JSON.stringify(table));
  git("add", "-A");
  git("commit", "--allow-empty", "-m", "fixture configuration");
};
fs.writeFileSync(path.join(worktree, ".claude", "reviewer-models.json"), JSON.stringify([{ name: "reviewer-fixture", model: "claude-fixture-reviewer" }]));
fs.writeFileSync(path.join(worktree, ".claude", "agents", "reviewer-fixture.md"), "---\nname: reviewer-fixture\nmodel: claude-fixture-reviewer\n---\n");
git("init");
commitConfig();
const child = path.join(scratch, "child.mjs");
fs.writeFileSync(child, `import fs from "node:fs"; let p=""; for await (const chunk of process.stdin) p+=chunk; const file=/Write (.*?) with the editor tool/.exec(p)[1]; const head=/reviewed head=([a-f0-9]+)/.exec(p)[1]; fs.writeFileSync(file, JSON.stringify({head,next:null,commentIds:[],summary:"complete"}));`);
const prompt = path.join(scratch, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const file = path.join(scratch, "plan.json");
let attempt = 0;
const plan = (fields, step = {}) => ({ worktree, completedReviewRound: 0, maxSteps: 1, first: "review", journal: path.join(scratch, `journal-${++attempt}.jsonl`), ...fields, steps: { review: { role: "review", round: 1, executable: process.execPath, args: [child], prompt, next: [null], ...step } } });
const launch = async (config) => {
  fs.writeFileSync(file, JSON.stringify(config));
  let error;
  try { await runHandoff(file, { slotRoot: path.join(scratch, "slots") }); } catch (caught) { error = caught; }
  const rows = fs.existsSync(config.journal) ? fs.readFileSync(config.journal, "utf8").trim().split("\n").map(JSON.parse) : [];
  return { error, launching: rows.find((row) => row.event === "launching") };
};

// Codex writer, primary column: the Claude reviewer definition is selected.
let result = await launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium" }));
assert.match(result.error.message, /posted comment IDs/, "the resolved reviewer launches before the fixture's empty report is rejected");
assert.equal(result.launching.model, "claude-fixture-reviewer");
assert.equal(result.launching.reviewerEffort, "high");
assert.deepEqual(result.launching.reviewerResolved, { writerEffort: "medium", ticketEffort: "medium", fallback: false, index: 0 });
assert.deepEqual(result.launching.args, [child, "--agent", "reviewer-fixture", "--effort", "high"]);

// Claude writer, fallback column: the same-vendor reviewer is selected.
result = await launch(plan({ writer: "claude-fixture-writer", writerEffort: "medium", reviewerFallback: true }));
assert.match(result.error.message, /posted comment IDs/);
assert.equal(result.launching.model, "claude-fixture-reviewer");
assert.equal(result.launching.reviewerEffort, "xhigh");
assert.equal(result.launching.reviewerResolved.fallback, true);
assert.deepEqual(result.launching.args, [child, "--agent", "reviewer-fixture", "--effort", "xhigh"]);

// An explicit reviewer is used unchanged, even when the table has a default.
result = await launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium", reviewer: "explicit-reviewer" }, { model: "explicit-reviewer", args: [child, "--model", "explicit-reviewer"] }));
assert.match(result.error.message, /posted comment IDs/);
assert.equal(result.launching.model, "explicit-reviewer");
assert.deepEqual(result.launching.args, [child, "--model", "explicit-reviewer"]);
assert.equal(result.launching.reviewerResolved, undefined);

// The command-line form prints the same selection for the reviewer prompt.
const printedPlan = path.join(scratch, "printed-plan.json");
fs.writeFileSync(printedPlan, JSON.stringify(plan({ writer: "gpt-fixture-writer", writerEffort: "medium" })));
const printed = execFileSync(process.execPath, [path.join(root, "scripts", "reviewer-defaults.mjs"), printedPlan], { encoding: "utf8", windowsHide: true });
assert.deepEqual(JSON.parse(printed), { reviewer: "claude-fixture-reviewer", reviewerEffort: "high", agent: "reviewer-fixture", ticketEffort: "medium", fallback: false, index: 0 });

// Refusals happen before any journal or process exists.
for (const [fields, step, pattern] of [
  [{ writer: "gpt-fixture-writer" }, {}, /writerEffort/],
  [{ writer: "gpt-fixture-writer", reviewer: "explicit-reviewer" }, { model: "explicit-reviewer", args: [child, "--model", "explicit-reviewer"] }, /writerEffort/],
  [{ writer: "gpt-fixture-writer", writerEffort: "low" }, {}, /No reviewer default/],
  [{ writer: "gpt-fixture-writer", writerEffort: "medium" }, { model: "claude-fixture-reviewer" }, /must not declare its own model/],
  [{ writer: "gpt-fixture-writer", writerEffort: "medium" }, { args: [child, "--effort", "low"] }, /must not select its own model or effort/],
  [{ writer: "claude-fixture-writer", writerEffort: "medium" }, {}, /needs a Codex exec reviewer step/],
]) {
  result = await launch(plan(fields, step));
  assert.match(result.error.message, pattern);
  assert.equal(result.launching, undefined, `refused before launch: ${pattern}`);
}

// A table whose default would review the writer's own work is refused before launch.
table.rows.push({ ticketEffort: "low", writer: "claude-fixture-reviewer", writerEffort: "low", primary: [{ route: "claude-fixture-reviewer", effort: "high" }], fallback: [{ route: "claude-fixture-reviewer", effort: "high" }] });
commitConfig();
const selfReview = plan({ writer: "claude-fixture-reviewer[1m]", writerEffort: "low" });
result = await launch(selfReview);
assert.match(result.error.message, /names the writer as its own reviewer/);
assert.equal(fs.existsSync(selfReview.journal), false, "self-review is refused before the journal opens");

console.log("PASS: reviewer defaults resolve from writer route and effort; explicit reviewers, fallback selection and self-review refusal verified");
