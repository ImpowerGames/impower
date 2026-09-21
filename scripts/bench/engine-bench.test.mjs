#!/usr/bin/env node
// Pins the story engine measurements of #664 and #693: the benchmark's
// arguments, the comparisons that make a prototype's timing mean something, the
// profile arithmetic, and that the prototypes stay out of everything that
// ships. Run:
//   node scripts/bench/engine-bench.test.mjs
//
// No dependencies; the end-to-end run needs the workspace install and says so
// when it skips.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, outputMismatch, parseEngineBenchArgs, protoMismatch } from "./engine-bench.mjs";
import { buildBeatsFixture, buildChunksFixture } from "./preview-fixture.mjs";
import { STEPPING } from "./profile-groups.mjs";
import { parseShareArgs, profileShares, summarizeShares } from "./profile-shares.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

await check("arguments: a project needs a line, modes are checked, all means every mode", () => {
  assert.deepEqual(parseEngineBenchArgs(["--fixture"]), { modes: Object.keys(MODES), samples: 12, warmup: 4, fixture: true });
  assert.deepEqual(parseEngineBenchArgs(["--fixture", "--mode", "all"]).modes, Object.keys(MODES));
  assert.deepEqual(parseEngineBenchArgs(["--project", "p", "--line", "3515", "--mode", "kinds,ready", "--samples", "10", "--warmup", "0", "--cpu-prof", "out"]), { modes: ["kinds", "ready"], samples: 10, warmup: 0, project: "p", line: 3515, cpuProf: "out" });
  assert.throws(() => parseEngineBenchArgs(["--project", "p"]), /--project needs --line/);
  assert.throws(() => parseEngineBenchArgs(["--fixture", "--mode", "fast"]), /--mode is any of/);
  assert.throws(() => parseEngineBenchArgs(["--fixture", "--project", "p", "--line", "1"]), /exclusive/);
  assert.throws(() => parseEngineBenchArgs([]), /--project <dir> or --fixture/);
});

await check("the prototype comparison fails on a different output, a different step count, or no output", () => {
  const report = (candidate, outputDigest, steps, lines = 748) => ({ candidate, outputDigest, steps, lines });
  assert.equal(protoMismatch([report("engine-step", "aa", 100), report("buffer-step", "aa", 100), report("engine-line", "aa"), report("buffer-line", "aa", 100)]), undefined);
  assert.match(protoMismatch([report("engine-step", "aa", 100), report("buffer-step", "ab", 100)]), /outputs differ: engine-step aa, buffer-step ab/);
  assert.match(protoMismatch([report("engine-step", "aa", 100), report("buffer-step", "aa", 99)]), /step counts differ: engine-step 100, buffer-step 99/);
  assert.match(protoMismatch([report("engine-step", "aa", 0, 0), report("buffer-step", "aa", 0, 0)]), /no lines/);
});

await check("the chunk comparison fails on a different output or no output, and lets the step counts differ", () => {
  const report = (candidate, outputDigest, steps, lines = 674) => ({ candidate, outputDigest, steps, lines });
  assert.equal(outputMismatch([report("engine-step", "aa", 29517), report("chunk-step", "aa", 6927), report("engine-line", "aa"), report("chunk-line", "aa", 6927)]), undefined);
  assert.match(outputMismatch([report("engine-step", "aa", 100), report("chunk-step", "ab", 100)]), /outputs differ: engine-step aa, chunk-step ab/);
  assert.match(outputMismatch([report("engine-step", "aa", 0, 0), report("chunk-step", "aa", 0, 0)]), /no lines/);
});

await check("the chunk scene mixes variables, conditionals, diverts between scenes and one choose into its beats, the same on every call", () => {
  const { files, target } = buildChunksFixture();
  const lines = files.get("main.sd").split("\n");
  assert.deepEqual(buildChunksFixture().files.get("main.sd"), files.get("main.sd"));
  const count = (re) => lines.filter((l) => re.test(l)).length;
  assert.equal(count(/^scene /), target.scenes);
  assert.equal(count(/^ *-> (MAIN|PART_[0-9]+)$/), target.scenes - 1);
  assert.equal(count(/^ *choose$/), 1);
  assert.equal(count(/^ *then$/), 1);
  assert.ok(count(/^store /) >= 2);
  assert.ok(count(/^ *& [a-z]+ = /) > 20, "reassignments");
  assert.ok(count(/^ *if .* then$/) > 10, "conditionals");
  assert.ok(count(/^ *else$/) > 5, "else branches");
  assert.ok(count(/[{]trust[}]/) > 5, "interpolated lines");
  assert.ok(lines.length - lines.findIndex((l) => /^ *then$/.test(l)) > 1000, "the then clause holds the rest of its scene");
  assert.equal(count(/^ *(while|for|function) /), 0);
});

await check("the beats scene is one scene of beats with nothing to choose, the same on every call", () => {
  const { files, target } = buildBeatsFixture();
  const lines = files.get("main.sd").split("\n");
  assert.deepEqual(buildBeatsFixture().files.get("main.sd"), files.get("main.sd"));
  assert.ok(target.sceneLines >= 2400, `${target.sceneLines} lines`);
  assert.equal(lines.filter((l) => /^scene /.test(l)).length, 1);
  assert.equal(lines.filter((l) => /^\s*(choose|then|if|while|for)\b/.test(l)).length, 0);
  assert.ok(lines.filter((l) => /^\s+\[\[\w+/.test(l)).length > 300);
  assert.notEqual(lines[target.line - 1].trim(), "");
});

// root -> run -> (Step -> [Resolve, emit]) and root -> other, shaped as V8
// writes a profile: as many deltas as samples, the first being the gap before
// the first sample. A sample is charged the delta that follows it, so the last
// one (run) is charged nothing: 70 microseconds in all, 50 under Step.
const PROFILE = {
  nodes: [
    { id: 1, callFrame: { functionName: "(root)" }, children: [2, 6, 7] },
    { id: 2, callFrame: { functionName: "run" }, children: [3] },
    { id: 3, callFrame: { functionName: "Step" }, children: [4, 5] },
    { id: 4, callFrame: { functionName: "Resolve" } },
    { id: 5, callFrame: { functionName: "emit" } },
    { id: 6, callFrame: { functionName: "other" } },
    { id: 7, callFrame: { functionName: "(garbage collector)" } },
  ],
  samples: [3, 4, 4, 4, 5, 6, 7, 2],
  timeDeltas: [5, 10, 10, 10, 10, 10, 10, 10],
};

await check("profile shares: only time under the named function counts, and groups take the first match", () => {
  const groups = [
    ["hierarchy", /:Resolve$/],
    ["engine", /:(Step|emit)$/],
  ];
  const result = profileShares(PROFILE, { under: ["Step"], inclusive: ["Resolve", "other"], groups, nameOf: (frame) => `x.ts:${frame.functionName}` });
  assert.equal(result.shareOfProfile, 50 / 70);
  assert.equal(result.collectorShareOfProfile, 10 / 70);
  assert.deepEqual(result.groups, [
    { group: "hierarchy", share: 0.6 },
    { group: "engine", share: 0.4 },
  ]);
  assert.deepEqual(result.inclusive, [
    { function: "Resolve", share: 0.6 },
    { function: "other", share: 0 },
  ]);
  assert.deepEqual(
    result.functions.map((f) => [f.name, f.group]),
    [
      ["x.ts:Resolve", "hierarchy"],
      ["x.ts:Step", "engine"],
      ["x.ts:emit", "engine"],
    ],
  );
  assert.equal(profileShares(PROFILE, { under: ["run"], groups: [], nameOf: (frame) => frame.functionName }).functions[0].group, "(unassigned)");
  assert.deepEqual(parseShareArgs(["a.cpuprofile", "b.cpuprofile", "--under", "Step"]).profiles, ["a.cpuprofile", "b.cpuprofile"]);
  // Over several profiles: the middle of three, and a group one profile never
  // sampled counts as zero there.
  const shares = (hierarchy, engine, collector) => ({ groups: [{ group: "hierarchy", share: hierarchy }, ...(engine == null ? [] : [{ group: "engine", share: engine }])], inclusive: [{ function: "Resolve", share: hierarchy / 2 }], collectorShareOfProfile: collector });
  assert.deepEqual(summarizeShares([shares(0.5, 0.5, 0.04), shares(0.7, 0.3, 0.06), shares(1, undefined, 0.05)]), [
    { label: "hierarchy", min: 0.5, median: 0.7, max: 1 },
    { label: "engine", min: 0, median: 0.3, max: 0.5 },
    { label: "inclusive Resolve", min: 0.25, median: 0.35, max: 0.5 },
    { label: "(garbage collector, share of the whole profile)", min: 0.04, median: 0.05, max: 0.06 },
  ]);
  assert.throws(() => parseShareArgs(["a.cpuprofile"]), /--under/);
  assert.throws(() => parseShareArgs(["--under", "Step"]), /\.cpuprofile/);
});

await check("the stepping groups put paths and pointers on one side and output and variables on the other", () => {
  const groupOf = (name) => STEPPING.find(([, re]) => re.test(name))?.[0];
  assert.equal(groupOf("Path.ts:get componentsString"), groupOf("Pointer.ts:copy"));
  assert.equal(groupOf("TypeAssertion.ts:asOrNull"), groupOf("Pointer.ts:copy"));
  assert.equal(groupOf("Value.ts:StringValue"), groupOf("Pointer.ts:copy"));
  assert.equal(groupOf("StoryState.ts:PushToOutputStream"), groupOf("VariablesState.ts:set"));
  assert.notEqual(groupOf("StoryState.ts:PushToOutputStream"), groupOf("Pointer.ts:copy"));
  assert.notEqual(groupOf("Story.ts:Step"), groupOf("Pointer.ts:copy"));
  assert.notEqual(groupOf("Story.ts:Step"), groupOf("VariablesState.ts:set"));
  assert.notEqual(
    groupOf("Story.ts:ContinueInternal"),
    groupOf("VariablesState.ts:set"),
  );
});

// The prototypes are measured, never shipped. The tooling workflow checks out
// no packages, so there it says it skipped rather than passing on nothing.
if (!fs.existsSync(path.join(ROOT, "packages", "sparkdown", "src"))) {
  console.log("SKIP: nothing under packages/*/src imports a prototype (this checkout has no packages)");
} else await check("nothing under packages/*/src imports a prototype or anything else in scripts/bench", () => {
  const run = spawnSync("git", ["grep", "-l", "-E", "scripts/bench|bufferStepper|chunkStepper|chunkProgram", "--", "packages/*/src"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  assert.ok(run.status === 0 || run.status === 1, run.stderr);
  assert.equal(run.stdout.trim(), "");
});

const esbuildInstalled = (() => {
  try {
    createRequire(path.join(ROOT, "package.json")).resolve("esbuild");
    return true;
  } catch {
    return false;
  }
})();
if (!esbuildInstalled) {
  console.log("SKIP: the benchmark's end-to-end run needs the workspace install (esbuild is not resolvable)");
} else {
  await check("the benchmark runs every mode on the fixture, and each prototype's output equals the engine's", () => {
    const run = spawnSync(process.execPath, [path.join(HERE, "engine-bench.mjs"), "--fixture", "--samples", "1", "--warmup", "0"], { encoding: "utf8", timeout: 480_000, windowsHide: true });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /mode kinds: .* target MAIN\./);
    assert.match(run.stdout, /command: RunStdLibFunction\s+\d{3,}/);
    assert.match(run.stdout, /mode step as-planner:[^]*per step \(microseconds\)/);
    assert.match(run.stdout, /mode step hooked:/);
    assert.match(run.stdout, /proto: the 4 candidates produced identical lines \(\d{3,} display tables\), and both engines took \d{4,} steps/);
    assert.match(run.stdout, /candidate tree: \d+ records, of which \d+ in MAIN/);
    assert.match(run.stdout, /candidate story-buffer:[^]*materialize tree[^]*retained once ready/);
    assert.match(run.stdout, /candidate buffer:[^]*build index[^]*retained once ready/);
    assert.match(run.stdout, /chunks: the 4 candidates produced identical lines and choices \([0-9]{3,} lines, [0-9]{3,} display tables, 1 stops at choices\); the engine took [0-9]{4,} steps and the prototype [0-9]{4,}/);
    assert.match(run.stdout, /candidate chunk-step:[^]*layout: [0-9]+ chunks in [0-9]+ sequences/);
    assert.match(run.stdout, /a display beat that interpolates nothing: [0-9]+ to [0-9]+ instructions, [0-9]+ to [0-9]+ runtime objects/);
    // The worked example ran: an edit shared all but one sequence row, and a
    // story resumed inside a block below the edit ran on through the new root.
    assert.match(run.stdout, /edit probe: two statements inserted around entry [0-9]+ of a then clause of [0-9]{3,}; [0-9]+ of [0-9]+ sequence rows and all [0-9]+ chunks shared with the previous root; resumed inside the if through the new root, the [0-9]+ lines to the end are equal/);
    // The symbol table is the size the design gives the fixture, its hundreds
    // of globals included, and not the handful of flows the ring is made of.
    assert.match(run.stdout, /candidate symbol: a ring of [0-9]+ flows spread through a symbol table of [0-9]{3,}, /);
    assert.match(run.stdout, /symbols: in a table of [0-9]{3,} symbols, a divert through the symbol table costs /);
    assert.match(run.stdout, /candidate flat-copy: flow MAIN, [0-9]+ records, [0-9]+ statements in [0-9]+ sequences[^]*insert at the bottom/);
    assert.match(run.stdout, /candidate tree-copy:[^]*replace at the middle/);
    assert.match(run.stdout, /candidate records-splice:[^]*copy of the flow's records/);
    assert.match(run.stdout, /lookahead: a save and a restore cost [0-9.]+ microseconds in the engine and [0-9.]+ in restorable state/);
  });
}

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all engine bench checks passed");
