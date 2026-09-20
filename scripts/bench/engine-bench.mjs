#!/usr/bin/env node
// Runs the story engine measurements of #664 under bare node: bundles each
// entry with the repository's esbuild, then runs every mode in a process of
// its own, because a shared process inflates whatever runs second.
//
//   node scripts/bench/engine-bench.mjs --fixture
//   node scripts/bench/engine-bench.mjs --project <dir> --line <N>
//
// Options:
//   --project <dir>   a project directory holding main.sd
//   --fixture         generate the fixture project (preview-fixture.mjs) into a
//                     temporary directory and measure its target line
//   --line <N>        the line of main.sd the route ends at, counting from one
//   --mode <m,..>     any of kinds, step, proto, emit, ready, or all (the default);
//                     see MODES below
//   --samples <K>     measured samples per mode (default 12)
//   --warmup <W>      discarded samples first (default 4)
//   --cpu-prof <dir>  also write a V8 CPU profile of each mode's process there
//   --json <file>     also write each mode's full report, as <file>.<mode>.json
//
// How to read the output: .agents/skills/drive-web-editor/references/performance.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBeatsFixture, writePreviewFixture } from "./preview-fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Each mode: the entry that implements it, the candidates it runs (each in a
// process of its own), the project it runs on, and what it measures. `route`
// is the project named on the command line; `beats` is always the generated
// beats-only scene, the one scene both engines of `proto` can run.
export const MODES = {
  kinds: { entry: "engineBench.ts", project: "route", about: "the content kinds stepped on the route, with each kind's share of steps and of stepping time" },
  step: { entry: "engineBench.ts", project: "route", candidates: ["as-planner", "bare"], about: "the current engine's time per step on the route, stepping only" },
  proto: { entry: "bufferStepBench.ts", project: "beats", candidates: ["engine-step", "buffer-step", "engine-line", "buffer-line"], about: "the prototype loop over the program buffer against the current engine, with their outputs compared" },
  emit: { entry: "emitBench.ts", project: "route", candidates: ["walk", "binary", "json", "tree"], about: "what writing the compiled program costs per record, for each writer and for the walk that drives them" },
  ready: { entry: "readyBench.ts", project: "route", candidates: ["prepare", "story-json", "story-buffer", "buffer"], about: "time and retained memory from holding the compiled program to being able to step" },
};

function value(args, i, name) {
  const v = args[i + 1];
  if (v == null || v === "" || v.startsWith("--")) throw new Error(`${name} needs a value`);
  return v;
}
function count(text, name, min) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}`);
  return n;
}

export function parseEngineBenchArgs(args) {
  const out = { modes: Object.keys(MODES), samples: 12, warmup: 4 };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--project":
        out.project = value(args, i++, name);
        break;
      case "--fixture":
        out.fixture = true;
        break;
      case "--line":
        out.line = count(value(args, i++, name), name, 1);
        break;
      case "--mode": {
        const modes = value(args, i++, name).split(",").filter(Boolean);
        if (!(modes.length === 1 && modes[0] === "all")) {
          for (const mode of modes) if (!MODES[mode]) throw new Error(`--mode is any of ${Object.keys(MODES).join(", ")}, or all`);
          out.modes = modes;
        }
        break;
      }
      case "--samples":
        out.samples = count(value(args, i++, name), name, 1);
        break;
      case "--warmup":
        out.warmup = count(value(args, i++, name), name, 0);
        break;
      case "--cpu-prof":
        out.cpuProf = value(args, i++, name);
        break;
      case "--json":
        out.json = value(args, i++, name);
        break;
      default:
        throw new Error(`unknown argument ${name}`);
    }
  }
  if (out.project && out.fixture) throw new Error("--project and --fixture are exclusive");
  if (!out.project && !out.fixture) throw new Error("pass --project <dir> or --fixture");
  if (out.project && out.line == null) throw new Error("--project needs --line");
  return out;
}

// Why the candidates of `proto` did not do the same work, or undefined.
export function protoMismatch(reports) {
  const digests = new Set(reports.map((r) => r.outputDigest));
  if (digests.size !== 1) return `outputs differ: ${reports.map((r) => `${r.candidate} ${r.outputDigest.slice(0, 12)}`).join(", ")}`;
  if (!reports[0]?.lines) return "the scene produced no lines";
  const counted = reports.filter((r) => r.steps != null);
  if (new Set(counted.map((r) => r.steps)).size !== 1) return `step counts differ: ${counted.map((r) => `${r.candidate} ${r.steps}`).join(", ")}`;
  return undefined;
}

// With `mapDir`, the bundle gets a source map, copied there for
// profile-shares.mjs to name functions by their source file.
async function bundle(entry, outDir, mapDir) {
  const require = createRequire(path.join(HERE, "..", "..", "package.json"));
  const esbuild = require("esbuild");
  const outfile = path.join(outDir, entry.replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [path.join(HERE, entry)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "warning",
    // Profiles name functions, so the bundle keeps the names it was given.
    keepNames: true,
    sourcemap: mapDir ? "external" : false,
    loader: { ".svg": "text", ".css": "text", ".html": "text", ".yaml": "text", ".sd": "text", ".luau": "text" },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  if (mapDir) {
    fs.mkdirSync(mapDir, { recursive: true });
    fs.copyFileSync(outfile + ".map", path.join(mapDir, path.basename(outfile) + ".map"));
  }
  return outfile;
}

async function main(args) {
  const options = parseEngineBenchArgs(args);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-engine-bench-"));
  try {
    let { project, line } = options;
    if (options.fixture) {
      project = path.join(scratch, "fixture");
      const target = writePreviewFixture(project);
      line ??= target.line;
      console.log(`fixture: ${project}`);
    }
    project = path.resolve(project);
    const beats = path.join(scratch, "beats");
    const bundles = new Map();
    let failed = false;
    for (const mode of options.modes) {
      const { entry, candidates = [undefined], project: which } = MODES[mode];
      if (!bundles.has(entry)) bundles.set(entry, await bundle(entry, scratch, options.cpuProf && path.resolve(options.cpuProf)));
      if (which === "beats" && !fs.existsSync(beats)) writePreviewFixture(beats, buildBeatsFixture());
      const reports = [];
      for (const candidate of candidates) {
        const name = candidate ? `${mode}.${candidate}` : mode;
        const json = options.json ? path.resolve(`${options.json}.${name}.json`) : path.join(scratch, `${name}.json`);
        const config = { project: which === "beats" ? beats : project, line, mode, candidate, samples: options.samples, warmup: options.warmup, json, scratch };
        const nodeArgs = ["--max-old-space-size=4096", "--expose-gc"];
        if (options.cpuProf) {
          fs.mkdirSync(options.cpuProf, { recursive: true });
          nodeArgs.push("--cpu-prof", "--cpu-prof-dir", path.resolve(options.cpuProf), "--cpu-prof-name", `${name}.cpuprofile`);
        }
        const run = spawnSync(process.execPath, [...nodeArgs, bundles.get(entry), JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
        if (run.status !== 0) failed = true;
        else reports.push(JSON.parse(fs.readFileSync(json, "utf8")));
        console.log("");
      }
      if (mode === "proto" && reports.length === candidates.length) {
        const problem = protoMismatch(reports);
        if (problem) {
          console.error(`proto: ${problem}`);
          failed = true;
        } else {
          console.log(`proto: the ${reports.length} candidates produced identical text, tags and display tables, and both engines took ${reports[0].steps} steps`);
          console.log("");
        }
      }
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    // Only the directory this run created: the fixture and the bundles.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
