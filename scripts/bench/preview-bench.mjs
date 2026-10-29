#!/usr/bin/env node
// Runs the Game Preview worker benchmark (previewBench.ts) under bare node:
// bundles it with the repository's esbuild, then runs each mode in a process
// of its own, because a shared process inflates whatever runs second.
//
//   node scripts/bench/preview-bench.mjs --project <dir> --line <N> --word <text>
//   node scripts/bench/preview-bench.mjs --fixture
//   node scripts/bench/preview-bench.mjs --project <dir> --mode coverage
//   node scripts/bench/preview-bench.mjs --project <dir> --line <N> --structural
//
// Options:
//   --project <dir>     a project directory holding main.sd
//   --fixture           generate the fixture project (preview-fixture.mjs) into
//                       a temporary directory and measure its target line
//   --loop <passes>     with --fixture: a loop that shows nothing runs that
//                       many passes at the top of the scene, and the target
//                       sits in a branch the program skips after it
//                       (buildLoopFixture, #1636); 20000 passes is about
//                       520,000 steps
//   --line <N>          the line of main.sd to edit, counting from one
//   --word <text>       the word on that line a suggestion replaces; the whole
//                       identifier around it is what gets replaced
//   --options <a,b,..>  replacements, whole identifiers; default: every image
//                       file whose name starts like the identifier
//   --mode <m>          preview | edit | both (default both), or coverage: no
//                       timing, but how many of the project's statements the
//                       binary program's writer emits and, counted by
//                       construct, which ones it has no emit path for
//                       (programCoverage.ts, #694); it needs no --line or
//                       --word
//                       Or cold: each sample compiles the project on a
//                       compiler of its own, with no game; --line, when
//                       given, is where the compile starts from (#1712)
//   --structural        a structural edit in place of a replacement (#1672):
//                       the samples alternately insert a dialogue line after
//                       --line, at that line's indentation, and remove it
//                       again, each an accepted edit, so the edit mode
//                       alone; --word is not needed
//   --text <text>       the line --structural inserts, after the indentation
//                       (default "Just one more thing.")
//   --indent <n>        the inserted line's indentation in spaces, in place
//                       of --line's own, for a statement-level line such as a
//                       choice after the last line of a speech
//   --no-flow-reuse     refuse the compiler's parsed-flow reuse on every
//                       compile (`_disableFlowReuseNextCompile`, #1712)
//   --heap-probe <file> after the last sample, count the parsed objects alive
//                       and write <file>.parsed.json and a heap snapshot at
//                       <file>.heapsnapshot, for heap-retained.mjs (#1712);
//                       not with --cpu-prof
//   --starting-values <json>
//                       every start's values, as a host keeps them
//                       ({"MAIN":{"store:mood":"1"}}), which the worker's game
//                       starts its routes with
//   --samples <K>     measured samples per mode (default 12)
//   --warmup <W>        discarded samples first (default 4)
//   --json <file>       also write each mode's full report, as <file>.<mode>.json
//   --cpu-prof <dir>    also write a V8 CPU profile of each process there
//                       (<mode>.cpuprofile), with the bundle's source map, for profile-shares.mjs, and beside
//                       each a .gaps.json of the same name: the stretches of
//                       worker time no phase covers, for --gaps. A
//                       profiled bundle keeps function names, which slows the
//                       engine, so read times from a run without this flag.
//                       Also a .windows.json of the same name: each measured
//                       sample's stretch, for profile-shares.mjs --windows
//
// The worker path outside the browser: see
// .agents/skills/drive-web-editor/references/performance.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBench, count, value } from "./benchLauncher.mjs";
import { buildLoopFixture, writePreviewFixture } from "./preview-fixture.mjs";

const IMAGE_RE = /\.(png|apng|jpeg|jpg|gif|bmp|svg|webp)$/i;
// What a structural edit inserts by default: a plain dialogue line, which
// needs nothing the project defines. `driver.mjs measure --structural` types
// the same line (#1672).
export const STRUCTURAL_TEXT = "Just one more thing.";

export function parseBenchArgs(args) {
  const out = { mode: "both", samples: 12, warmup: 4 };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--project":
        out.project = value(args, i++, name);
        break;
      case "--fixture":
        out.fixture = true;
        break;
      case "--loop":
        out.loop = count(value(args, i++, name), name, 1);
        break;
      case "--line":
        out.line = count(value(args, i++, name), name, 1);
        break;
      case "--word":
        out.word = value(args, i++, name);
        break;
      case "--options":
        out.options = value(args, i++, name).split(",").filter(Boolean);
        break;
      case "--mode": {
        const mode = value(args, i++, name);
        if (!["preview", "edit", "both", "coverage", "cold"].includes(mode)) throw new Error("--mode is preview, edit, both, coverage or cold");
        out.mode = mode;
        break;
      }
      case "--structural":
        out.structural = true;
        break;
      case "--text":
        out.text = value(args, i++, name);
        if (!out.text.trim() || /[\r\n]/.test(out.text)) throw new Error("--text is one line of text");
        break;
      case "--indent":
        out.indent = count(value(args, i++, name), name, 0);
        break;
      case "--no-flow-reuse":
        out.noFlowReuse = true;
        break;
      case "--heap-probe":
        out.heapProbe = value(args, i++, name);
        break;
      case "--samples":
        out.samples = count(value(args, i++, name), name, 1);
        break;
      case "--warmup":
        out.warmup = count(value(args, i++, name), name, 0);
        break;
      case "--json":
        out.json = value(args, i++, name);
        break;
      case "--starting-values":
        out.startingValues = JSON.parse(value(args, i++, name));
        break;
      case "--cpu-prof":
        out.cpuProf = value(args, i++, name);
        break;
      default:
        throw new Error(`unknown argument ${name}`);
    }
  }
  if (out.project && out.fixture) throw new Error("--project and --fixture are exclusive");
  if (out.loop != null && !out.fixture) throw new Error("--loop needs --fixture");
  // A profiled bundle keeps its functions' given names, which the heap
  // snapshot does not report for a class esbuild renamed, so the snapshot
  // and the probe would name the parsed classes differently.
  if (out.heapProbe && out.cpuProf) throw new Error("--heap-probe and --cpu-prof are exclusive");
  if (!out.project && !out.fixture) throw new Error("pass --project <dir> or --fixture");
  if (out.text != null && !out.structural) throw new Error("--text needs --structural");
  if (out.indent != null && !out.structural) throw new Error("--indent needs --structural");
  if (out.structural) {
    // A suggestion's preview compile never changes the document, so there is
    // no insert for it to take out again: a structural edit is accepted.
    if (out.mode !== "both" && out.mode !== "edit") throw new Error("--structural measures the edit mode alone");
    out.mode = "edit";
    if (out.project && out.line == null) throw new Error("--project --structural needs --line");
  } else if (out.project && out.mode !== "coverage" && out.mode !== "cold" && (out.line == null || out.word == null)) throw new Error("--project needs --line and --word");
  return out;
}

// A structural edit at `line` (counting from one) of `documentText`: the
// change that inserts `text` as a line of its own after it, at its
// indentation or at `indent` spaces when given, and the change that removes
// that line again, which puts the document back byte for byte. An insert
// leaves the caret on the new line, and a removal at the end of `line`, which
// is where each puts the preview (#1672).
export function structuralEdits(documentText, line, text, indent) {
  const lines = documentText.split(/\r?\n/);
  if (line < 1 || line > lines.length) throw new Error(`there is no line ${line}`);
  const lineText = lines[line - 1];
  const eol = documentText.includes("\r\n") ? "\r\n" : "\n";
  const inserted = (indent != null ? " ".repeat(indent) : (/^\s*/.exec(lineText)?.[0] ?? "")) + text;
  const end = { line: line - 1, character: lineText.length };
  return {
    lineText,
    inserted,
    insert: { range: { start: end, end }, text: eol + inserted },
    remove: { range: { start: end, end: { line, character: inserted.length } }, text: "" },
  };
}

// The identifier around `word` on `lineText`, and the part of it before the
// word: `[[raffles_concerned:gloves]]` with `concerned` gives
// `raffles_concerned` and `raffles_`.
export function tokenAround(lineText, word) {
  const at = lineText.indexOf(word);
  if (at < 0) return null;
  let start = at;
  let end = at + word.length;
  while (start > 0 && /\w/.test(lineText[start - 1])) start--;
  while (end < lineText.length && /\w/.test(lineText[end])) end++;
  return { token: lineText.slice(start, end), prefix: lineText.slice(start, at) };
}

// Default replacements: the names of the project's image files that start
// like the identifier, which is what the completion list offers there.
export function imageOptions(fileNames, prefix, token) {
  const stems = fileNames.filter((f) => IMAGE_RE.test(f)).map((f) => path.basename(f).replace(/\.[^.]+$/, ""));
  return [...new Set(stems)].filter((s) => s.startsWith(prefix) && s !== token).sort();
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

async function main(args) {
  const options = parseBenchArgs(args);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-preview-bench-"));
  try {
    let { project, line, word } = options;
    if (options.fixture) {
      project = path.join(scratch, "fixture");
      const target = writePreviewFixture(project, options.loop != null ? buildLoopFixture({ passes: options.loop }) : undefined);
      line ??= target.line;
      word ??= target.word;
      console.log(`fixture: ${project}`);
    }
    project = path.resolve(project);
    if (options.mode === "coverage") {
      const script = await bundleBench("programCoverage.ts", scratch, null);
      const json = options.json && path.resolve(`${options.json}.coverage.json`);
      const run = spawnSync(process.execPath, ["--max-old-space-size=4096", script, JSON.stringify({ project, json })], { stdio: "inherit", windowsHide: true });
      process.exitCode = run.status === 0 ? 0 : 1;
      return;
    }
    const cpuProfDir = options.cpuProf && path.resolve(options.cpuProf);
    const heapProbe = options.heapProbe && path.resolve(options.heapProbe);
    if (options.mode === "cold") {
      const script = await bundleBench("previewBench.ts", scratch, cpuProfDir);
      const json = options.json ? path.resolve(`${options.json}.cold.json`) : undefined;
      const config = { project, line, word, options: [], mode: "cold", samples: options.samples, warmup: options.warmup, json, heapProbe: heapProbe && `${heapProbe}.cold`, windows: cpuProfDir && path.join(cpuProfDir, "cold.windows.json") };
      const profile = cpuProfDir ? ["--cpu-prof", "--cpu-prof-dir", cpuProfDir, "--cpu-prof-name", "cold.cpuprofile"] : [];
      const run = spawnSync(process.execPath, ["--max-old-space-size=4096", "--expose-gc", ...profile, script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
      process.exitCode = run.status === 0 ? 0 : 1;
      return;
    }
    const cpuProf = options.cpuProf && path.resolve(options.cpuProf);
    const source = fs.readFileSync(path.join(project, "main.sd"), "utf8");
    const lineText = source.split(/\r?\n/)[line - 1] ?? "";
    // A structural edit replaces nothing, so it needs no word and no options.
    const structural = options.structural ? structuralEdits(source, line, options.text ?? STRUCTURAL_TEXT, options.indent) : undefined;
    let replacements = [];
    if (!structural) {
      const around = tokenAround(lineText, word);
      if (!around) throw new Error(`"${word}" is not on line ${line}: ${JSON.stringify(lineText)}`);
      replacements = options.options ?? imageOptions(listFiles(project), around.prefix, around.token);
      if (!replacements.length) throw new Error(`no image file starts with ${around.prefix}: pass --options`);
    }
    const script = await bundleBench("previewBench.ts", scratch, cpuProf);
    const modes = options.mode === "both" ? ["preview", "edit"] : [options.mode];
    let failed = false;
    for (const mode of modes) {
      const json = options.json ? path.resolve(`${options.json}.${mode}.json`) : path.join(scratch, `${mode}.json`);
      const gaps = cpuProf ? path.join(cpuProf, `${mode}.gaps.json`) : undefined;
      const config = { project, line, word, options: replacements, structural, mode, samples: options.samples, warmup: options.warmup, json, gaps, noFlowReuse: options.noFlowReuse, heapProbe: heapProbe && `${heapProbe}.${mode}`, windows: cpuProf && path.join(cpuProf, `${mode}.windows.json`), startingValues: options.startingValues };
      const profile = cpuProf ? ["--cpu-prof", "--cpu-prof-dir", cpuProf, "--cpu-prof-name", `${mode}.cpuprofile`] : [];
      const run = spawnSync(process.execPath, ["--max-old-space-size=4096", "--expose-gc", ...profile, script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
      if (run.status !== 0) failed = true;
      console.log("");
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    // Only the directory this run created: the fixture and the bundle.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
