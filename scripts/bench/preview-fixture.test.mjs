#!/usr/bin/env node
// Pins the preview latency fixture's shape and the worker benchmark's
// arguments (#647). Run:
//   node scripts/bench/preview-fixture.test.mjs
//
// The fixture stands in for a private project, so what it has to keep is
// what makes that project slow to preview: one flat scene of at least 2,000
// lines, a `choose ... then ... end` whose `then` clause holds at least the
// last 1,000 of them, and attribute directives over SVG portraits whose layers
// carry a condition vocabulary. A fixture that shrank below those would
// measure a different pipeline and still print plausible numbers.
//
// No dependencies; the benchmark itself needs the workspace install and is
// run by hand.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageOptions, parseBenchArgs, tokenAround } from "./preview-bench.mjs";
import { buildPreviewFixture, writePreviewFixture } from "./preview-fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
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

const { files, target } = buildPreviewFixture();
const lines = files.get("main.sd").split("\n");

await check("one flat scene of at least 2,000 lines, whose then clause holds the last 1,000+", () => {
  const scenes = lines.filter((l) => /^scene /.test(l));
  assert.deepEqual(scenes, ["scene MAIN"]);
  const sceneAt = lines.indexOf("scene MAIN");
  const sceneEnd = lines.lastIndexOf("end");
  assert.ok(sceneEnd - sceneAt >= 2000, `scene has ${sceneEnd - sceneAt} lines`);
  assert.equal(lines.filter((l) => l.trim() === "choose").length, 1);
  const thenAt = lines.indexOf("  then");
  const thenEnd = lines.lastIndexOf("  end");
  assert.ok(thenAt > 0 && thenEnd - thenAt >= 1000, `then clause has ${thenEnd - thenAt} lines`);
  assert.equal(lines.filter((l) => /^\S/.test(l) && !/^(include|scene|end)\b/.test(l)).length, 0, "nothing outside the scene but includes");
});

await check("the target is the last portrait directive inside the then clause, with an attribute", () => {
  assert.equal(target.lineText, lines[target.line - 1]);
  assert.equal(target.lineText, "      [[hero_concerned:gloves]]");
  assert.equal(target.word, "concerned");
  assert.ok(target.line - 1 > lines.indexOf("  then") && target.line - 1 < lines.lastIndexOf("  end"));
  const later = lines.slice(target.line).filter((l) => l.includes("[["));
  assert.deepEqual(later, []);
});

await check("directives use attributes over SVG portraits with a layer condition vocabulary", () => {
  const directives = lines.filter((l) => /\[\[\w+:[\w.:]+\]\]/.test(l));
  assert.ok(directives.length >= 100, `${directives.length} attribute directives`);
  const svgs = [...files.keys()].filter((f) => f.endsWith(".svg"));
  assert.ok(svgs.length >= 12, `${svgs.length} portraits`);
  const svg = files.get("assets/hero_concerned.svg");
  for (const name of ["hair-top:hat.off", "torso:clothes.jacket:default", "hand-left-inner:cushion.off:gloves.on", "face.concerned:default", "pupils:eyes.open:look.camera:default"]) {
    assert.ok(svg.includes(`data-name="${name}"`), `missing layer ${name}`);
  }
  // Every image a directive names exists.
  for (const [, name] of files.get("main.sd").matchAll(/\[\[(\w+)/g)) assert.ok(files.has(`assets/${name}.svg`), `no assets/${name}.svg`);
});

await check("the fixture is deterministic and refuses a non-empty directory", () => {
  assert.deepEqual(buildPreviewFixture().files, files);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "impower-fixture-test-"));
  try {
    const written = writePreviewFixture(path.join(dir, "project"));
    assert.deepEqual(written, target);
    assert.equal(fs.readFileSync(path.join(dir, "project", "main.sd"), "utf8"), files.get("main.sd"));
    assert.throws(() => writePreviewFixture(path.join(dir, "project")), /non-empty/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("the benchmark's arguments and default replacements", () => {
  assert.deepEqual(parseBenchArgs(["--fixture"]), { mode: "both", samples: 12, warmup: 4, fixture: true });
  assert.deepEqual(parseBenchArgs(["--project", "p", "--line", "3515", "--word", "concerned", "--mode", "edit", "--options", "a,b"]), {
    mode: "edit",
    samples: 12,
    warmup: 4,
    project: "p",
    line: 3515,
    word: "concerned",
    options: ["a", "b"],
  });
  assert.throws(() => parseBenchArgs(["--project", "p"]), /--line and --word/);
  assert.throws(() => parseBenchArgs(["--project", "--fixture"]), /--project needs a value/);
  assert.throws(() => parseBenchArgs(["--fixture", "--mode", "fast"]), /preview, edit or both/);
  assert.deepEqual(tokenAround("      [[raffles_concerned:gloves]]", "concerned"), { token: "raffles_concerned", prefix: "raffles_" });
  assert.equal(tokenAround("[[bunny]]", "concerned"), null);
  assert.deepEqual(imageOptions(["a/raffles_shy.svg", "b/raffles_concerned.svg", "raffles_unsure.png", "raffles_notes.txt", "bunny_shy.svg"], "raffles_", "raffles_concerned"), ["raffles_shy", "raffles_unsure"]);
});

// The benchmark end to end on the fixture: bundle, one process per mode, and
// a report naming the route and the phases. It needs the workspace install
// for esbuild and the compiler's dependencies, which the tooling workflow
// does not have, so it says it skipped rather than passing silently there.
const esbuildInstalled = (() => {
  try {
    createRequire(path.join(HERE, "..", "..", "package.json")).resolve("esbuild");
    return true;
  } catch {
    return false;
  }
})();
if (!esbuildInstalled) {
  console.log("SKIP: the benchmark's end-to-end run needs the workspace install (esbuild is not resolvable)");
} else {
  await check("the benchmark runs both modes on the fixture and reports route, phases and wire size", () => {
    const run = spawnSync(process.execPath, [path.join(HERE, "preview-bench.mjs"), "--fixture", "--samples", "1", "--warmup", "0"], { encoding: "utf8", timeout: 240_000, windowsHide: true });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    for (const mode of ["preview", "edit"]) {
      const section = run.stdout.slice(run.stdout.indexOf(`mode ${mode}:`));
      assert.ok(run.stdout.includes(`mode ${mode}: line ${target.line} "${target.lineText}", replacing hero_concerned`), `no ${mode} report`);
      assert.match(section, /1 samples after 0 warm-up; route \d{4,} steps/);
      assert.match(section, /game\/planRoute/);
      assert.match(section, /ink\/compile/);
      assert.match(section, /pathLocations/);
      assert.match(section, /\(checkpoint\)/);
    }
  });
}

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all preview fixture checks passed");
