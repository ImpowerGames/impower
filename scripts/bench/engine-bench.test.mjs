#!/usr/bin/env node
// Pins the story engine measurements of #664: the benchmark's arguments, the
// comparison that makes the prototype's timing mean something, the profile
// arithmetic, and that the prototype stays out of everything that ships. Run:
//   node scripts/bench/engine-bench.test.mjs
//
// No dependencies; the end-to-end run needs the workspace install and says so
// when it skips.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, parseEngineBenchArgs, protoMismatch } from "./engine-bench.mjs";
import { buildBeatsFixture } from "./preview-fixture.mjs";
import { STEPPING } from "./profile-groups.mjs";
import { parseShareArgs, profileShares } from "./profile-shares.mjs";

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

// root -> run -> (Step -> [Resolve, emit]) and root -> other; one sample each
// of 10 microseconds, except Resolve, which has three: 80 in all, 50 under Step.
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
  timeDeltas: [0, 10, 10, 10, 10, 10, 10, 10, 10],
};

await check("profile shares: only time under the named function counts, and groups take the first match", () => {
  const groups = [
    ["hierarchy", /:Resolve$/],
    ["engine", /:(Step|emit)$/],
  ];
  const result = profileShares(PROFILE, { under: ["Step"], inclusive: ["Resolve", "other"], groups, nameOf: (frame) => `x.ts:${frame.functionName}` });
  assert.equal(result.shareOfProfile, 50 / 80);
  assert.equal(result.collectorShareOfProfile, 10 / 80);
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
  assert.notEqual(groupOf("StopWatch.ts:Start"), groupOf("VariablesState.ts:set"));
});

// The prototype is measured, never shipped. The tooling workflow checks out no
// packages, where this passes on nothing; every other checkout has them.
await check("nothing under packages/*/src imports the prototype or anything else in scripts/bench", () => {
  const run = spawnSync("git", ["grep", "-l", "-E", "scripts/bench|bufferStepper", "--", "packages/*/src"], { cwd: ROOT, encoding: "utf8", windowsHide: true });
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
  await check("the benchmark runs every mode on the fixture, and the prototype's output equals the engine's", () => {
    const run = spawnSync(process.execPath, [path.join(HERE, "engine-bench.mjs"), "--fixture", "--samples", "1", "--warmup", "0"], { encoding: "utf8", timeout: 480_000, windowsHide: true });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /mode kinds: .* target MAIN\./);
    assert.match(run.stdout, /command: RunStdLibFunction\s+\d{3,}/);
    assert.match(run.stdout, /mode step as-planner:[^]*per step \(microseconds\)/);
    assert.match(run.stdout, /mode step bare:/);
    assert.match(run.stdout, /proto: the 4 candidates produced identical text, tags and display tables, and both engines took \d{4,} steps/);
    assert.match(run.stdout, /candidate tree: \d+ records, of which \d+ in MAIN/);
    assert.match(run.stdout, /candidate story-buffer:[^]*materialize tree[^]*retained once ready/);
    assert.match(run.stdout, /candidate buffer:[^]*build index[^]*retained once ready/);
  });
}

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all engine bench checks passed");
