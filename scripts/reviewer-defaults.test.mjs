import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runHandoff as actualRunHandoff, checkCrossVendor, usageLimitWindowMs } from "./agent-handoff.mjs";
import { readReviewerDefaults, resolveReviewer, applyResolvedReviewer, validateReviewerDefaults } from "./reviewer-defaults.mjs";
import { readRepos } from "../.agents/repos.mjs";

const reposDir = fs.mkdtempSync(path.join(os.tmpdir(), "impower-repos-off-"));
fs.writeFileSync(path.join(reposDir, "repos.json"), JSON.stringify({ ...readRepos(), cutover: false }));
const OFF = readRepos(path.join(reposDir, "repos.json"));
fs.rmSync(reposDir, { recursive: true, force: true });
const runHandoff = (file, options) => actualRunHandoff(file, { repos: OFF, ...options });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { defaults } = readReviewerDefaults(root);
const registry = JSON.parse(fs.readFileSync(path.join(root, ".claude", "reviewer-models.json"), "utf8"));
const writerRoutes = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6.1-sol", "gpt-6-astra"];
for (const writer of writerRoutes) {
  for (const writerEffort of writer.startsWith("claude-") ? ["low", "medium", "high", "xhigh", "max"] : ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    for (const ticketEffort of ["low", "medium", "high", "correctness-critical"]) {
      const selection = resolveReviewer({ writer, writerEffort, ticketEffort }, root);
      assert.notEqual(selection.reviewer, writer);
      assert.equal(selection.ticketEffort, ticketEffort);
    }
  }
  assert.throws(() => validateReviewerDefaults({ ...defaults, rows: defaults.rows.filter((row) => row.writer !== writer) }, registry), /No reviewer default row/);
  for (const ticketEffort of ["low", "medium", "high", "correctness-critical"]) {
    assert.throws(() => validateReviewerDefaults({ ...defaults, rows: defaults.rows.filter((row) => row.writer !== writer || row.ticketEffort !== ticketEffort) }, registry), /No reviewer default row/);
  }
}
assert.deepEqual(defaults.writers, writerRoutes, "writer registration is independent of remaining rows and excludes fallback-only reviewer definitions");
assert.throws(() => validateReviewerDefaults({ ...defaults, writers: undefined }, registry), /writers registry/);
assert.throws(() => validateReviewerDefaults({ ...defaults, writers: [...defaults.writers, defaults.writers[0]] }, registry), /unique valid writer routes/);
assert.throws(() => validateReviewerDefaults({ ...defaults, writers: defaults.writers.slice(1) }, registry), /Unregistered default writer/);
const fableMedium = resolveReviewer({ writer: "claude-fable-5-1", writerEffort: "low", ticketEffort: "medium" }, root);
assert.deepEqual([fableMedium.reviewer, fableMedium.reviewerEffort, fableMedium.rowWriterEffort, fableMedium.matchedOn], ["gpt-6.1-sol", "high", "medium", "ticketEffort"]);
assert.throws(() => resolveReviewer({ writer: "gpt-6.1-sol", writerEffort: "low" }, root), /Several reviewer defaults match.*supply ticketEffort/);
assert.ok(!defaults.rows.some((row) => [...row.primary, ...row.fallback].some(({ route }) => route.includes("fable"))), "the limited-allowance model never reviews");
const pick = (plan) => { const { reviewer, reviewerEffort } = resolveReviewer(plan, root); return `${reviewer}/${reviewerEffort}`; };
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "low" }), "gpt-5.6-terra/high");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "medium" }), "gpt-6.1-sol/high");
assert.equal(pick({ writer: "claude-opus-5-5[1m]", writerEffort: "medium", reviewerFallback: true }), "claude-sonnet-5-5/high", "a context-window suffix does not change the writer route");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "low", reviewerFallback: true }), "claude-sonnet-5-5/high");
assert.equal(pick({ writer: "gpt-5.6-terra", ticketEffort: "low", writerEffort: "medium" }), "claude-sonnet-5-5/high");
assert.equal(pick({ writer: "gpt-5.6-terra", ticketEffort: "low", writerEffort: "xhigh" }), "claude-sonnet-5-5/xhigh", "a terra writer at xhigh or above gets an xhigh reviewer");
assert.equal(pick({ writer: "gpt-5.6-sol", ticketEffort: "medium", writerEffort: "medium" }), "claude-opus-5-5/high");
assert.equal(pick({ writer: "gpt-5.6-sol", ticketEffort: "medium", writerEffort: "medium", reviewerFallback: true }), "gpt-6-astra/medium");
assert.equal(pick({ writer: "gpt-6-astra", ticketEffort: "high", writerEffort: "high", reviewerFallback: true }), "gpt-6.1-sol/xhigh");
assert.equal(pick({ writer: "claude-fable-5-1", ticketEffort: "high", writerEffort: "medium", reviewerFallback: true }), "claude-opus-5-5/xhigh");
assert.throws(() => pick({ writer: "claude-opus-5-5", writerEffort: "xhigh" }), /supply ticketEffort \(high or correctness-critical\)/, "a writer effort shared by two ticket tiers needs the tier");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "xhigh", ticketEffort: "high" }), "gpt-6.1-sol/xhigh");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "xhigh", ticketEffort: "correctness-critical", reviewerIndex: 1 }), "gpt-6.1-sol/high", "the second serial reviewer is selected by index");
assert.throws(() => pick({ writer: "claude-opus-5-5", writerEffort: "medium", reviewerIndex: 1 }), /reviewerIndex must be from 0 through 0/);
assert.throws(() => pick({ writer: "claude-opus-5-5", writerEffort: "medium", reviewerIndex: null }), /reviewerIndex must be from 0 through 0/, "a null index is refused rather than read as the first reviewer");
assert.throws(() => pick({ writer: "claude-opus-5-5" }), /writerEffort/, "the writer's effort remains a required input");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "medium", reviewerFallback: true }), "claude-sonnet-5-5/high", "Opus 5.5 falls back to Sonnet 5.5");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "max", reviewerFallback: true, reviewerIndex: 1 }), "claude-opus-4-8/xhigh");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "low" }), "gpt-5.6-terra/high");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "medium" }), "gpt-6.1-sol/high");
assert.equal(pick({ writer: "claude-opus-5-5[1m]", writerEffort: "medium", reviewerFallback: true }), "claude-sonnet-5-5/high");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "high", reviewerFallback: true }), "claude-sonnet-5-5/xhigh");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "xhigh", ticketEffort: "high" }), "gpt-6.1-sol/xhigh");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "xhigh", ticketEffort: "correctness-critical", reviewerFallback: true, reviewerIndex: 1 }), "claude-opus-4-8/xhigh");
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "max", reviewerFallback: true }), "claude-sonnet-5-5/xhigh");
assert.equal(pick({ writer: "gpt-6.1-sol", ticketEffort: "medium", writerEffort: "low" }), "claude-opus-5-5/high", "the current Codex default model resolves a reviewer");
assert.equal(pick({ writer: "gpt-6.1-sol", ticketEffort: "medium", writerEffort: "ultra", reviewerFallback: true }), "gpt-6-astra/medium");
assert.equal(pick({ writer: "gpt-6-astra", ticketEffort: "high", writerEffort: "high" }), "claude-opus-5-5/xhigh");
assert.equal(pick({ writer: "gpt-6-astra", ticketEffort: "correctness-critical", writerEffort: "max", reviewerIndex: 1 }), "claude-sonnet-5-5/xhigh");
assert.equal(pick({ writer: "claude-fable-5-1", ticketEffort: "correctness-critical", writerEffort: "max", reviewerFallback: true, reviewerIndex: 1 }), "claude-sonnet-5-5/xhigh");
const routes = (list) => list.map(({ route, effort }) => `${route}/${effort}`).join(" ");
for (const [writer, writerEffort, ticketEffort, primary, fallback] of [
  ["claude-fable-5-1", "low", "low", "gpt-5.6-terra/high", "claude-opus-5-5/high"],
  ["claude-fable-5-1", "medium", "medium", "gpt-6.1-sol/high", "claude-opus-5-5/high"],
  ["gpt-5.6-terra", "medium", "medium", "claude-opus-5-5/high", "gpt-6-astra/medium"],
  ["gpt-5.6-terra", "high", "high", "claude-opus-5-5/xhigh", "gpt-6-astra/xhigh"],
  ["gpt-5.6-terra", "max", "correctness-critical", "claude-opus-5-5/xhigh claude-sonnet-5-5/xhigh", "gpt-6-astra/xhigh gpt-6.1-sol/high"],
  ...["gpt-5.6-sol", "gpt-6.1-sol"].flatMap((writer) => [
    [writer, "low", "low", "claude-sonnet-5-5/high", "gpt-6-astra/medium"],
    [writer, "high", "high", "claude-opus-5-5/xhigh", "gpt-6-astra/xhigh"],
    [writer, "max", "correctness-critical", "claude-opus-5-5/xhigh claude-sonnet-5-5/xhigh", "gpt-6-astra/xhigh gpt-5.6-terra/high"],
  ]),
  ["gpt-6-astra", "low", "low", "claude-sonnet-5-5/high", "gpt-6.1-sol/medium"],
  ["gpt-6-astra", "medium", "medium", "claude-opus-5-5/high", "gpt-6.1-sol/medium"],
]) {
  const row = defaults.rows.find((row) => row.writer === writer && row.writerEffort === writerEffort && row.ticketEffort === ticketEffort);
  assert.deepEqual([routes(row.primary), routes(row.fallback)], [primary, fallback], `${writer}/${writerEffort}/${ticketEffort}`);
}
const opusRows = defaults.rows.filter((row) => ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "gpt-5.6-sol", "gpt-6.1-sol", "gpt-6-astra"].includes(row.writer));
const expectedOpusRows = [
  ["claude-opus-5-5", "low", "low", "gpt-5.6-terra/high", "claude-sonnet-5-5/high"],
  ["claude-opus-5-5", "medium", "medium", "gpt-6.1-sol/high", "claude-sonnet-5-5/high"],
  ["claude-opus-5-5", "high", "high", "gpt-6.1-sol/xhigh", "claude-sonnet-5-5/xhigh"],
  ["claude-opus-5-5", "xhigh", "high", "gpt-6.1-sol/xhigh", "claude-sonnet-5-5/xhigh"],
  ["claude-opus-5-5", "xhigh", "correctness-critical", "gpt-6-astra/xhigh gpt-6.1-sol/high", "claude-sonnet-5-5/xhigh claude-opus-4-8/xhigh"],
  ["claude-opus-5-5", "max", "correctness-critical", "gpt-6-astra/xhigh gpt-6.1-sol/high", "claude-sonnet-5-5/xhigh claude-opus-4-8/xhigh"],
  ["claude-sonnet-5-5", "low", "low", "gpt-5.6-terra/high", "claude-opus-5-5/high"],
  ["claude-sonnet-5-5", "medium", "medium", "gpt-6.1-sol/high", "claude-opus-5-5/high"],
  ["claude-sonnet-5-5", "high", "high", "gpt-6.1-sol/xhigh", "claude-opus-5-5/xhigh"],
  ["claude-sonnet-5-5", "xhigh", "high", "gpt-6.1-sol/xhigh", "claude-opus-5-5/xhigh"],
  ["claude-sonnet-5-5", "xhigh", "correctness-critical", "gpt-6-astra/xhigh gpt-6.1-sol/high", "claude-opus-5-5/xhigh claude-opus-4-8/xhigh"],
  ["claude-sonnet-5-5", "max", "correctness-critical", "gpt-6-astra/xhigh gpt-6.1-sol/high", "claude-opus-5-5/xhigh claude-opus-4-8/xhigh"],
  ["claude-fable-5-1", "low", "high", "gpt-6.1-sol/xhigh", "claude-opus-5-5/xhigh"],
  ["claude-fable-5-1", "medium", "high", "gpt-6.1-sol/xhigh", "claude-opus-5-5/xhigh"],
  ...["high", "xhigh", "max"].map((effort) => ["claude-fable-5-1", effort, "correctness-critical", "gpt-6-astra/xhigh gpt-6.1-sol/high", "claude-opus-5-5/xhigh claude-sonnet-5-5/xhigh"]),
  ...["low", "medium", "high", "xhigh", "max", "ultra"].map((effort) => ["gpt-5.6-sol", effort, "medium", "claude-opus-5-5/high", "gpt-6-astra/medium"]),
  ...["low", "medium", "high", "xhigh", "max", "ultra"].map((effort) => ["gpt-6.1-sol", effort, "medium", "claude-opus-5-5/high", "gpt-6-astra/medium"]),
  ...["low", "medium", "high", "xhigh"].map((effort) => ["gpt-6-astra", effort, "high", "claude-opus-5-5/xhigh", "gpt-6.1-sol/xhigh"]),
  ...["max", "ultra"].map((effort) => ["gpt-6-astra", effort, "correctness-critical", "claude-opus-5-5/xhigh claude-sonnet-5-5/xhigh", "gpt-6.1-sol/xhigh gpt-5.6-terra/high"]),
];
assert.deepEqual(opusRows.filter((row) => expectedOpusRows.some(([writer, effort, tier]) => row.writer === writer && row.writerEffort === effort && row.ticketEffort === tier)).map((row) => [row.writer, row.writerEffort, row.ticketEffort, routes(row.primary), routes(row.fallback)]), expectedOpusRows);
for (const writer of new Set(defaults.rows.map((row) => row.writer))) {
  for (const writerEffort of writer.startsWith("claude-") ? ["low", "medium", "high", "xhigh", "max"] : ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    const tiers = defaults.rows.filter((row) => row.writer === writer && row.writerEffort === writerEffort).map((row) => row.ticketEffort);
    assert.ok(tiers.length, `${writer} at ${writerEffort} has a row`);
    assert.doesNotThrow(() => pick({ writer, writerEffort, ticketEffort: tiers[0] }), `${writer} at ${writerEffort}`);
  }
}
assert.equal(pick({ writer: "claude-opus-5-5", writerEffort: "max" }), "gpt-6-astra/xhigh");
assert.equal(pick({ writer: "claude-fable-5-1", ticketEffort: "correctness-critical", writerEffort: "max" }), "gpt-6-astra/xhigh");
for (const writerEffort of ["low", "medium", "high", "xhigh", "max"]) assert.ok(defaults.rows.some((row) => row.writer === "claude-opus-5-5" && row.writerEffort === writerEffort), `claude-opus-5-5 at ${writerEffort} has a row`);
const tierMatch = resolveReviewer({ writer: "claude-opus-5-5", writerEffort: "low", ticketEffort: "medium" }, root);
assert.deepEqual([tierMatch.reviewer, tierMatch.rowWriterEffort, tierMatch.matchedOn], ["gpt-6.1-sol", "medium", "ticketEffort"]);
assert.equal(resolveReviewer({ writer: "claude-opus-5-5", writerEffort: "medium" }, root).matchedOn, "writerEffort");
const tieRoot = fs.mkdtempSync(path.join(os.tmpdir(), "impower-reviewer-tie-"));
fs.mkdirSync(path.join(tieRoot, ".claude"));
fs.writeFileSync(path.join(tieRoot, ".claude", "reviewer-models.json"), JSON.stringify([{ name: "reviewer-t", model: "claude-t" }]));
const tieRow = (writerEffort, ticketEffort, effort) => ({ ticketEffort, writer: "claude-w", writerEffort, primary: [{ route: "gpt-t", effort }], fallback: [{ route: "claude-t", effort }] });
fs.writeFileSync(path.join(tieRoot, ".claude", "reviewer-defaults.json"), JSON.stringify({ writers: ["claude-w"], codexModels: ["gpt-t"], rows: [
  ...["low", "medium", "high", "xhigh", "max"].map((writerEffort) => tieRow(writerEffort, "medium", "medium")),
  tieRow("low", "high", "low"), tieRow("high", "high", "high"), tieRow("low", "low", "low"), tieRow("max", "correctness-critical", "high"),
] }));
const tie = resolveReviewer({ writer: "claude-w", writerEffort: "medium", ticketEffort: "high" }, tieRoot);
assert.deepEqual([tie.reviewerEffort, tie.rowWriterEffort, tie.matchedOn], ["high", "high", "ticketEffort"], "a tie between low and high resolves to the high row");
fs.rmSync(tieRoot, { recursive: true, force: true });
assert.equal(pick({ writer: "gpt-5.6-terra", writerEffort: "medium", ticketEffort: "correctness-critical" }), "claude-opus-5-5/xhigh");
assert.throws(() => pick({ writer: "claude-haiku-4-5", writerEffort: "medium" }), /No reviewer default/);
assert.equal(resolveReviewer({ writer: "claude-opus-5-5", writerEffort: "medium", reviewer: "claude-opus-4-8" }, root).reviewer, "claude-opus-4-8", "an explicit reviewer bypasses the table");
for (const writerEffort of [undefined, "bogus"]) assert.throws(() => resolveReviewer({ writer: "claude-opus-5-5", writerEffort, reviewer: "gpt-5.6-sol" }, root), /writerEffort/, "an explicit reviewer still requires a valid writer effort");
assert.equal(resolveReviewer({ writer: "gpt-6-astra", writerEffort: "ultra", reviewer: "claude-sonnet-5-5" }, root).reviewer, "claude-sonnet-5-5", "the Codex ultra effort is a valid writer effort");
for (const writer of ["claude-opus-5-5", "claude-opus-5-5[1m]"]) assert.throws(() => resolveReviewer({ writer, writerEffort: "ultra", reviewer: "gpt-5.6-sol" }, root), /writerEffort for claude-opus-5.*\(low, medium, high, xhigh, max\)/, "a Claude writer cannot report ultra");
assert.throws(() => resolveReviewer({ writer: "claude-opus-5-5", writerEffort: "medium", reviewer: null }, root), /Omit reviewer/);
for (const selector of [{ reviewerEffort: "high" }, { reviewerFallback: true }, { reviewerIndex: 0 }, { ticketEffort: "medium" }]) assert.throws(() => resolveReviewer({ writer: "claude-opus-5-5", writerEffort: "medium", reviewer: "gpt-5.6-sol", ...selector }, root), /apply only when the reviewer is resolved/, JSON.stringify(selector));

const models = [{ name: "reviewer-a", model: "claude-a" }];
const row = (extra) => ({ ticketEffort: "medium", writer: "claude-w", writerEffort: "medium", primary: [{ route: "gpt-1-x", effort: "high" }], fallback: [{ route: "claude-a", effort: "high" }], ...extra });
const covered = (writer, efforts, extra) => [...efforts.map((writerEffort) => row({ writer, writerEffort, ...extra })), ...["low", "high", "correctness-critical"].map((ticketEffort) => row({ writer, writerEffort: "low", ticketEffort, ...extra }))];
const claudeEfforts = ["low", "medium", "high", "xhigh", "max"];
assert.doesNotThrow(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: covered("claude-w", claudeEfforts) }, models));
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: covered("claude-w", claudeEfforts.slice(0, 4)) }, models), /No reviewer default row for claude-w at max effort/);
const codexRow = { primary: [{ route: "claude-a", effort: "high" }], fallback: [{ route: "gpt-1-x", effort: "high" }] };
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w", "gpt-1-w"], codexModels: ["gpt-1-x", "gpt-1-w"], rows: [...covered("claude-w", claudeEfforts), ...covered("gpt-1-w", claudeEfforts, codexRow)] }, models), /No reviewer default row for gpt-1-w at ultra effort/);
assert.doesNotThrow(() => validateReviewerDefaults({ writers: ["claude-w", "gpt-1-w"], codexModels: ["gpt-1-x", "gpt-1-w"], rows: [...covered("claude-w", claudeEfforts), ...covered("gpt-1-w", [...claudeEfforts, "ultra"], codexRow)] }, models));
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [...covered("claude-w", claudeEfforts), row({ writerEffort: "ultra", ticketEffort: "high" })] }, models), /unsupported writer or ticket effort/, "a Claude writer row cannot use ultra");
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row({ writer: "claude-w", fallback: [{ route: "claude-w", effort: "high" }] })] }, models), /names the writer as its own reviewer/);
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "claude-unregistered", effort: "high" }] })] }, models), /neither a registered reviewer definition/);
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row({ fallback: [{ route: "gpt-1-x", effort: "high" }] })] }, models), /fallback must stay with the writer's vendor/);
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "claude-a", effort: "high" }] })] }, models), /primary must use the other vendor/);
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row(), row()] }, models), /Duplicate/);
assert.throws(() => validateReviewerDefaults({ writers: ["claude-w"], codexModels: ["gpt-1-x"], rows: [row({ primary: [{ route: "gpt-1-x", effort: "extreme" }] })] }, models), /Unsupported reviewer effort/);

const codexStep = { role: "review", nativeResult: "codex-jsonl", args: ["exec", "--json", "-"] };
assert.deepEqual(applyResolvedReviewer(codexStep, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), { ...codexStep, model: "gpt-5.6-sol", effort: "high", args: ["exec", "--model", "gpt-5.6-sol", "-c", 'model_reasoning_effort="high"', "--json", "-"] });
for (const selecting of [["-c", 'model_reasoning_effort="low"'], ["-cmodel_reasoning_effort=low"], ["-cmodel=\"gpt-6-astra\""], ["-c=model_reasoning_effort=low"], ["-c", ' model_reasoning_effort="low"'], ["-c", 'MODEL="gpt-6-astra"'], [" --model", "gpt-6-astra"], ["--model=gpt-6-astra"], ["-mgpt-6-astra"], ["-c", 'model="gpt-6-astra"'], ["--config=model_reasoning_effort=\"low\""], ["--config=model=\"gpt-6-astra\""], ["--effort=low"], ["--agent=reviewer-opus-5-5"]]) {
  assert.throws(() => applyResolvedReviewer({ ...codexStep, args: ["exec", ...selecting, "-"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), /must not select its own model or effort/, selecting.join(" "));
}
assert.doesNotThrow(() => applyResolvedReviewer({ ...codexStep, args: ["exec", "-c", 'model_provider="openai"', "-"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), "other config overrides stay allowed");
assert.throws(() => applyResolvedReviewer({ role: "review", args: ["child.mjs"] }, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }), /needs a Codex exec reviewer step/);
const awaitedCodex = { role: "review", args: ["exec", "-C", "/w", "--json", "-o", "/r/final.md", "-"] };
assert.deepEqual(applyResolvedReviewer(awaitedCodex, { reviewer: "gpt-5.6-sol", reviewerEffort: "high" }).args, ["exec", "--model", "gpt-5.6-sol", "-c", 'model_reasoning_effort="high"', "-C", "/w", "--json", "-o", "/r/final.md", "-"], "the awaited Codex exec route also receives the resolved model and effort");
assert.throws(() => applyResolvedReviewer(codexStep, { reviewer: "claude-sonnet-5-5", reviewerEffort: "high", agent: "reviewer-opus-5" }), /needs a Claude reviewer step/);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-reviewer-defaults-"));
console.log(`Scratch repository: ${scratch}`);
const generatorRoot = path.join(scratch, "generator");
fs.mkdirSync(path.join(generatorRoot, "scripts"), { recursive: true });
fs.mkdirSync(path.join(generatorRoot, ".claude", "agents"), { recursive: true });
execFileSync("git", ["init", generatorRoot], { stdio: "pipe", windowsHide: true });
console.log(`Scratch repository: ${generatorRoot}`);
for (const file of ["generate-reviewer-agents.mjs", "reviewer-defaults.mjs"]) fs.copyFileSync(path.join(root, "scripts", file), path.join(generatorRoot, "scripts", file));
fs.copyFileSync(path.join(root, ".claude", "reviewer-models.json"), path.join(generatorRoot, ".claude", "reviewer-models.json"));
for (const { name } of registry) fs.copyFileSync(path.join(root, ".claude", "agents", `${name}.md`), path.join(generatorRoot, ".claude", "agents", `${name}.md`));
const generatorCheck = (table) => {
  fs.writeFileSync(path.join(generatorRoot, ".claude", "reviewer-defaults.json"), JSON.stringify(table));
  return execFileSync(process.execPath, [path.join(generatorRoot, "scripts", "generate-reviewer-agents.mjs"), "--check"], { encoding: "utf8", stdio: "pipe", windowsHide: true });
};
assert.match(generatorCheck(defaults), /PASS/);
for (const [missing, pattern] of [
  [(row) => row.writer === "claude-fable-5-1" && row.ticketEffort === "medium", /No reviewer default row for claude-fable-5-1 for a medium ticket/],
  [(row) => row.writer === "claude-opus-5-5" && row.writerEffort === "max", /No reviewer default row for claude-opus-5-5 at max effort/],
  [(row) => row.writer === "gpt-6.1-sol", /No reviewer default row for gpt-6.1-sol/],
]) assert.throws(() => generatorCheck({ ...defaults, rows: defaults.rows.filter((row) => !missing(row)) }), (error) => pattern.test(String(error.stderr)));
assert.match(generatorCheck(defaults), /PASS/);
const worktree = path.join(scratch, "repo");
fs.mkdirSync(path.join(worktree, ".claude", "agents"), { recursive: true });
const git = (...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
const table = {
  writers: ["claude-fixture-writer", "gpt-fixture-writer"],
  codexModels: ["gpt-fixture-writer", "gpt-fixture-reviewer"],
  rows: [
    ...claudeEfforts.map((writerEffort) => ({ ticketEffort: "medium", writer: "claude-fixture-writer", writerEffort, primary: [{ route: "gpt-fixture-reviewer", effort: "high" }], fallback: [{ route: "claude-fixture-reviewer", effort: "xhigh" }] })),
    ...[...claudeEfforts, "ultra"].map((writerEffort) => ({ ticketEffort: "medium", writer: "gpt-fixture-writer", writerEffort, primary: [{ route: "claude-fixture-reviewer", effort: "high" }], fallback: [{ route: "gpt-fixture-reviewer", effort: "medium" }] })),
  ],
};
for (const writer of table.writers) for (const ticketEffort of ["low", "high", "correctness-critical"]) table.rows.push({ ...table.rows.find((row) => row.writer === writer), ticketEffort });
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
fs.writeFileSync(child, `import fs from "node:fs"; let p=""; for await (const chunk of process.stdin) p+=chunk; if(p.startsWith('Reviewer route probe')){if(process.argv.includes('limited')){console.error("You've hit your usage limit. Try again at 3:15 PM.");process.exit(1);}if(process.argv.includes('unauthorized')){console.error('401 Unauthorized: Incorrect API key provided');process.exit(1);}console.log('OK');process.exit(0);} const file=/Write (.*?) with the editor tool/.exec(p)[1]; const head=/reviewed head=([a-f0-9]+)/.exec(p)[1]; fs.writeFileSync(file, JSON.stringify({head,next:null,commentIds:[],summary:"complete"}));`);
const prompt = path.join(scratch, "prompt.txt");
fs.writeFileSync(prompt, "test fixture");
const file = path.join(scratch, "plan.json");
let attempt = 0;
const plan = (fields, step = {}) => ({ worktree, pr: 531, completedReviewRound: 0, maxSteps: 1, first: "review", journal: path.join(scratch, `journal-${++attempt}.jsonl`), ...fields, steps: { review: { role: "review", round: 1, executable: process.execPath, args: [child], prompt, next: [null], ...step } } });
const launch = async (config) => {
  fs.writeFileSync(file, JSON.stringify(config));
  let error;
  try { await runHandoff(file, { jobRoot: scratch, slotRoot: path.join(scratch, "slots") }); } catch (caught) { error = caught; }
  const rows = fs.existsSync(config.journal) ? fs.readFileSync(config.journal, "utf8").trim().split("\n").map(JSON.parse) : [];
  return { error, launching: rows.find((row) => row.event === "launching") };
};

let result = await launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium" }));
assert.match(result.error.message, /posted comment IDs/, "the resolved reviewer launches before the fixture's empty report is rejected");
assert.equal(result.launching.model, "claude-fixture-reviewer");
assert.equal(result.launching.reviewerEffort, "high");
assert.deepEqual(result.launching.reviewerResolved, { writerEffort: "medium", rowWriterEffort: "medium", matchedOn: "writerEffort", ticketEffort: "medium", fallback: false, index: 0 });
assert.deepEqual(result.launching.args, [child, "--agent", "reviewer-fixture", "--effort", "high"]);

const blockedJournal = (name, reason, { model = "gpt-fixture-reviewer", time = new Date().toISOString() } = {}) => {
  const evidence = path.join(scratch, `${name}.jsonl`);
  fs.writeFileSync(evidence, [{ event: "launching", role: "review", model }, { event: "blocked", reason, time }].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return evidence;
};
const limitReason = "Reviewer route gpt-fixture-reviewer unavailable before slot reservation: You've hit your usage limit; wait for the limit to reset";
const fallbackPlan = (usageLimitJournal) => plan({ writer: "claude-fixture-writer", writerEffort: "medium", reviewerFallback: true, usageLimitJournal });
const refusedFallback = async (usageLimitJournal, pattern, message) => {
  const config = fallbackPlan(usageLimitJournal);
  const refused = await launch(config);
  assert.match(refused.error.message, pattern, message);
  assert.equal(fs.existsSync(config.journal), false, `refused before the journal opens: ${message}`);
};
await refusedFallback(undefined, /shares the writer's vendor.*launch the cross-vendor default first/, "a fallback without evidence is refused");
await refusedFallback(blockedJournal("blocked-credential", "Reviewer route gpt-fixture-reviewer unavailable before slot reservation: 401 Unauthorized: Incorrect API key provided"), /does not end blocked by a usage limit \(.*401 Unauthorized/, "a rejected credential is not a usage limit");
await refusedFallback(blockedJournal("blocked-stale", limitReason, { time: new Date(Date.now() - usageLimitWindowMs - 60000).toISOString() }), /more than 6 hours ago; launch the cross-vendor default again/, "a stale usage limit is retried, not assumed");
await refusedFallback(blockedJournal("blocked-same-vendor", limitReason, { model: "claude-fixture-reviewer" }), /records no cross-vendor reviewer launch/, "a same-vendor reviewer's limit is not evidence");
await refusedFallback(path.join(scratch, "absent.jsonl"), /is unreadable/, "a missing journal is refused");
await refusedFallback(path.join(os.tmpdir(), "outside.jsonl"), /Review job paths must lie under/, "evidence outside the job root is refused");
const limited = blockedJournal("blocked-limit", limitReason);
result = await launch(fallbackPlan(limited));
assert.match(result.error.message, /posted comment IDs/);
assert.equal(result.launching.model, "claude-fixture-reviewer");
assert.equal(result.launching.reviewerEffort, "xhigh");
assert.equal(result.launching.reviewerResolved.fallback, true);
assert.equal(result.launching.sameVendor.usageLimitJournal, limited);
assert.equal(result.launching.sameVendor.usageLimitRoute, "gpt-fixture-reviewer");
assert.match(result.launching.sameVendor.usageLimitReason, /usage limit/);
assert.deepEqual(result.launching.args, [child, "--agent", "reviewer-fixture", "--effort", "xhigh"]);
const sameVendorStep = { model: "claude-fixture-reviewer", args: [child, "--model", "claude-fixture-reviewer"] };
result = await launch(plan({ writer: "claude-fixture-writer", writerEffort: "medium", reviewer: "claude-fixture-reviewer" }, sameVendorStep));
assert.match(result.error.message, /shares the writer's vendor/, "an explicit same-vendor reviewer is refused without evidence");
assert.equal(result.launching, undefined);
result = await launch(plan({ writer: "claude-fixture-writer[1m]", writerEffort: "medium", reviewer: "claude-fixture-reviewer", usageLimitJournal: limited }, sameVendorStep));
assert.match(result.error.message, /posted comment IDs/, "an explicit same-vendor reviewer launches with usage-limit evidence");
result = await launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium", usageLimitJournal: limited }));
assert.match(result.error.message, /apply only to a reviewer of the writer's vendor/);
const userRequest = "Use the same-vendor reviewer for this PR.";
result = await launch(plan({ writer: "claude-fixture-writer", writerEffort: "medium", reviewerFallback: true, sameVendorAuthorization: userRequest }));
assert.match(result.error.message, /posted comment IDs/, "a user-authorized same-vendor reviewer launches without a journal");
assert.deepEqual(result.launching.sameVendor, { sameVendorAuthorization: userRequest });
for (const [fields, pattern] of [
  [{ writer: "claude-fixture-writer", reviewerFallback: true, sameVendorAuthorization: "  " }, /must carry the user's request/],
  [{ writer: "claude-fixture-writer", reviewerFallback: true, sameVendorAuthorization: true }, /must carry the user's request/],
  [{ writer: "claude-fixture-writer", reviewerFallback: true, sameVendorAuthorization: userRequest, usageLimitJournal: limited }, /not both/],
  [{ writer: "gpt-fixture-writer", sameVendorAuthorization: userRequest }, /apply only to a reviewer of the writer's vendor/],
]) {
  result = await launch(plan({ writerEffort: "medium", ...fields }));
  assert.match(result.error.message, pattern);
  assert.equal(result.launching, undefined, `refused before launch: ${pattern}`);
}
for (const reason of ["You've hit your weekly limit - resets Sep 28", "Role review failed; route unavailable: HTTP 429 from the API; inspect process.log", "429 Too Many Requests", "rate limit reached", "quota exceeded"]) {
  assert.ok(checkCrossVendor({ writer: "claude-w", reviewer: "claude-r", usageLimitJournal: blockedJournal("blocked-wording", reason) }, scratch), `a usage limit is recognised: ${reason}`);
}
assert.equal(checkCrossVendor({ writer: "writer-test", reviewer: "reviewer-test" }, scratch), undefined, "routes of neither known vendor are not judged");
const probeBlocked = async (mode) => {
  const config = plan({ writer: "gpt-fixture-writer", writerEffort: "medium" }, { args: [child, mode] });
  const blocked = await launch(config);
  assert.match(blocked.error.message, /Reviewer route claude-fixture-reviewer unavailable before slot reservation/);
  return [config.journal, blocked.error.message];
};
const codexSameVendor = (usageLimitJournal) => launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium", reviewer: "gpt-fixture-reviewer", usageLimitJournal }, { model: "gpt-fixture-reviewer", args: [child, "--model", "gpt-fixture-reviewer"] }));
const [limitJournal, limitMessage] = await probeBlocked("limited");
assert.match(limitMessage, /hit your usage limit.*name this plan's journal as usageLimitJournal/);
result = await codexSameVendor(limitJournal);
assert.match(result.error.message, /posted comment IDs/, "the launcher's usage-limit journal permits the same-vendor reviewer");
assert.equal(result.launching.sameVendor.usageLimitRoute, "claude-fixture-reviewer");
const [credentialJournal, credentialMessage] = await probeBlocked("unauthorized");
assert.match(credentialMessage, /401 Unauthorized.*does not permit a same-vendor reviewer/);
result = await codexSameVendor(credentialJournal);
assert.match(result.error.message, /does not end blocked by a usage limit/, "the launcher's credential refusal does not permit the same-vendor reviewer");
assert.equal(result.launching, undefined);

result = await launch(plan({ writer: "gpt-fixture-writer", writerEffort: "medium", reviewer: "explicit-reviewer" }, { model: "explicit-reviewer", args: [child, "--model", "explicit-reviewer"] }));
assert.match(result.error.message, /posted comment IDs/);
assert.equal(result.launching.model, "explicit-reviewer");
assert.deepEqual(result.launching.args, [child, "--model", "explicit-reviewer"]);
assert.equal(result.launching.reviewerResolved, undefined);

const printedPlan = path.join(scratch, "printed-plan.json");
fs.writeFileSync(printedPlan, JSON.stringify(plan({ writer: "gpt-fixture-writer", writerEffort: "medium" })));
const printed = execFileSync(process.execPath, [path.join(root, "scripts", "reviewer-defaults.mjs"), printedPlan], { encoding: "utf8", windowsHide: true });
assert.deepEqual(JSON.parse(printed), { reviewer: "claude-fixture-reviewer", reviewerEffort: "high", agent: "reviewer-fixture", ticketEffort: "medium", rowWriterEffort: "medium", matchedOn: "writerEffort", fallback: false, index: 0 });

for (const [fields, step, pattern] of [
  [{ writer: "gpt-fixture-writer" }, {}, /writerEffort/],
  [{ writer: "gpt-fixture-writer", reviewer: "explicit-reviewer" }, { model: "explicit-reviewer", args: [child, "--model", "explicit-reviewer"] }, /writerEffort/],
  [{ writer: "gpt-unlisted-writer", writerEffort: "low" }, {}, /No reviewer default/],
  [{ writer: "gpt-fixture-writer", writerEffort: "medium" }, { model: "claude-fixture-reviewer" }, /must not declare its own model/],
  [{ writer: "gpt-fixture-writer", writerEffort: "medium" }, { args: [child, "--effort", "low"] }, /must not select its own model or effort/],
  [{ writer: "claude-fixture-writer", writerEffort: "medium" }, {}, /needs a Codex exec reviewer step/],
]) {
  result = await launch(plan(fields, step));
  assert.match(result.error.message, pattern);
  assert.equal(result.launching, undefined, `refused before launch: ${pattern}`);
}

table.writers.push("claude-fixture-reviewer");
table.rows.push({ ticketEffort: "low", writer: "claude-fixture-reviewer", writerEffort: "low", primary: [{ route: "claude-fixture-reviewer", effort: "high" }], fallback: [{ route: "claude-fixture-reviewer", effort: "high" }] });
commitConfig();
const selfReview = plan({ writer: "claude-fixture-reviewer[1m]", writerEffort: "low" });
result = await launch(selfReview);
assert.match(result.error.message, /names the writer as its own reviewer/);
assert.equal(fs.existsSync(selfReview.journal), false, "self-review is refused before the journal opens");

console.log("PASS: reviewer defaults resolve from writer route and effort; explicit reviewers, usage-limit-gated same-vendor selection and self-review refusal verified");
