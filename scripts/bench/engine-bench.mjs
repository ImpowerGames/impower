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
//   --mode <m,..>     any of program, symbols, order, images, search, or all
//                     (the default); see MODES below
//   --samples <K>     measured samples per mode (default 12)
//   --warmup <W>      discarded samples first (default 4)
//   --cpu-prof <dir>  also write a V8 CPU profile of each candidate's process
//                     there, with the bundle's source map. A profiled bundle
//                     keeps function names, which slows the engine, so read
//                     times from a run without this flag
//   --json <file>     also write every report, as <file>.<mode>.json for a mode
//                     with one candidate and <file>.<mode>.<candidate>.json
//                     for the others
//
// How to read the output: .agents/skills/drive-web-editor/references/performance.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBench, count, value } from "./benchLauncher.mjs";
import { buildBeatsFixture, buildChunksFixture, writePreviewFixture } from "./preview-fixture.mjs";

// Each mode: the entry that implements it, the candidates it runs (each in a
// process of its own) and the project it runs on. `route` is the project named
// on the command line; `beats` is always the generated beats-only scene, and
// `chunks` the generated scene of mixed statements. What each measures is in
// .agents/skills/drive-web-editor/references/performance.md.
export const MODES = {
  program: { entry: "programStepBench.ts", project: "beats", candidates: ["program-step", "program-line"] },
  symbols: { entry: "chunkSymbolBench.ts", project: "route", candidates: ["symbol", "direct"] },
  order: { entry: "chunkOrderBench.ts", project: "route", candidates: ["flat-copy", "flat-splice", "tree-copy"] },
  images: { entry: "imageBench.ts", project: "chunks", candidates: ["json", "image"] },
  search: { entry: "routeSearchBench.ts", project: "route" },
};

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

// Why the candidates of `program` did not do the same work, or undefined: the
// lines must be the same whichever way the engine was driven, and it must have
// run each instruction of the scene's chunks once, and the step that finds the
// scene ended, so that every display beat ran once.
export function programMismatch(reports) {
  const problem = outputMismatch(reports);
  if (problem) return problem;
  for (const report of reports) {
    if (report.steps !== report.instructions + 1) return `${report.candidate} took ${report.steps} steps over ${report.instructions} instructions`;
  }
  return undefined;
}

// Why the candidates did not produce the same lines, or undefined.
export function outputMismatch(reports) {
  const digests = new Set(reports.map((r) => r.outputDigest));
  if (digests.size !== 1) return `outputs differ: ${reports.map((r) => `${r.candidate} ${r.outputDigest.slice(0, 12)}`).join(", ")}`;
  if (!reports[0]?.lines) return "the scene produced no lines";
  return undefined;
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
    // The scenes a mode generates for itself, whatever project was named.
    const generated = { beats: buildBeatsFixture, chunks: buildChunksFixture };
    const bundles = new Map();
    let failed = false;
    for (const mode of options.modes) {
      const { entry, candidates = [undefined], project: which } = MODES[mode];
      if (!bundles.has(entry)) bundles.set(entry, await bundleBench(entry, scratch, options.cpuProf && path.resolve(options.cpuProf)));
      const own = generated[which] && path.join(scratch, which);
      if (own && !fs.existsSync(own)) writePreviewFixture(own, generated[which]());
      const reports = [];
      for (const candidate of candidates) {
        const name = candidate ? `${mode}.${candidate}` : mode;
        const json = options.json ? path.resolve(`${options.json}.${name}.json`) : path.join(scratch, `${name}.json`);
        const config = { project: own || project, line, mode, candidate, samples: options.samples, warmup: options.warmup, json, scratch };
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
      if (mode === "program" && reports.length === candidates.length) {
        const problem = programMismatch(reports);
        if (problem) {
          console.error(`program: ${problem}`);
          failed = true;
        } else {
          const program = reports.find((r) => r.candidate === "program-step");
          console.log(`program: the ${reports.length} candidates produced identical lines (${reports[0].lines} lines, ${reports[0].displayTables} display tables); the program engine ran each of the scene's ${program.instructions} instructions once (${program.steps} steps)`);
          console.log("");
        }
      }
      if (mode === "symbols" && reports.length === candidates.length) {
        const [symbol, direct] = reports.map((r) => r.nanosecondsPerDivert.median);
        console.log(`symbols: in a table of ${reports[0].symbols} symbols, a divert through the symbol table costs ${(symbol - direct).toFixed(2)} nanoseconds more than one resolved at compile time, by the medians (${symbol.toFixed(2)} against ${direct.toFixed(2)})`);
        console.log("");
      }
      if (mode === "images" && reports.length === candidates.length) {
        const problem = outputMismatch(reports);
        if (problem) {
          console.error(`images: ${problem}`);
          failed = true;
        } else {
          const report = (candidate) => reports.find((r) => r.candidate === candidate);
          const [json, image] = [report("json"), report("image")].map((r) => r.microsecondsPerNode.median);
          console.log(`images: the 2 candidates produced identical lines (${reports[0].lines} lines) through ${reports[0].nodes} search nodes; a node costs ${image.toFixed(2)} microseconds on an image against ${json.toFixed(2)} on the JSON round trip, by the medians`);
          console.log("");
        }
      }
      if (mode === "search" && reports.length === candidates.length) {
        const [search] = reports;
        if (!search.found) {
          console.error("search: the program engine found no route");
          failed = true;
        } else {
          console.log(`search: a full route search to line ${search.line} costs ${search.searchMs.median.toFixed(1)} ms on the program engine (${search.routeSteps} steps), by the median`);
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
