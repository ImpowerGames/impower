#!/usr/bin/env node
// Runs the Game Preview worker benchmark (previewBench.ts) under bare node:
// bundles it with the repository's esbuild, then runs each mode in a process
// of its own, because a shared process inflates whatever runs second.
//
//   node scripts/bench/preview-bench.mjs --project <dir> --line <N> --word <text>
//   node scripts/bench/preview-bench.mjs --fixture
//
// Options:
//   --project <dir>     a project directory holding main.sd
//   --fixture           generate the fixture project (preview-fixture.mjs) into
//                       a temporary directory and measure its target line
//   --line <N>          the line of main.sd to edit, counting from one
//   --word <text>       the word on that line a suggestion replaces; the whole
//                       identifier around it is what gets replaced
//   --options <a,b,..>  replacements, whole identifiers; default: every image
//                       file whose name starts like the identifier
//   --mode <m>          preview | edit | both (default both)
//   --samples <K>       measured samples per mode (default 12)
//   --warmup <W>        discarded samples first (default 4)
//   --json <file>       also write each mode's full report, as <file>.<mode>.json
//   --cpu-prof <dir>    also write a V8 CPU profile of each mode's process there,
//                       with the bundle's source map, for profile-shares.mjs,
//                       and <mode>.gaps.json beside it: the stretches of worker
//                       time no phase covers, for profile-shares.mjs --gaps. A
//                       profiled bundle keeps function names, which slows the
//                       engine, so read times from a run without this flag
//
// The worker path outside the browser: see
// .agents/skills/drive-web-editor/references/performance.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBench, count, value } from "./benchLauncher.mjs";
import { writePreviewFixture } from "./preview-fixture.mjs";

const IMAGE_RE = /\.(png|apng|jpeg|jpg|gif|bmp|svg|webp)$/i;

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
        if (!["preview", "edit", "both"].includes(mode)) throw new Error("--mode is preview, edit or both");
        out.mode = mode;
        break;
      }
      case "--samples":
        out.samples = count(value(args, i++, name), name, 1);
        break;
      case "--warmup":
        out.warmup = count(value(args, i++, name), name, 0);
        break;
      case "--json":
        out.json = value(args, i++, name);
        break;
      case "--cpu-prof":
        out.cpuProf = value(args, i++, name);
        break;
      default:
        throw new Error(`unknown argument ${name}`);
    }
  }
  if (out.project && out.fixture) throw new Error("--project and --fixture are exclusive");
  if (!out.project && !out.fixture) throw new Error("pass --project <dir> or --fixture");
  if (out.project && (out.line == null || out.word == null)) throw new Error("--project needs --line and --word");
  return out;
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
      const target = writePreviewFixture(project);
      line ??= target.line;
      word ??= target.word;
      console.log(`fixture: ${project}`);
    }
    project = path.resolve(project);
    const lineText = fs.readFileSync(path.join(project, "main.sd"), "utf8").split(/\r?\n/)[line - 1] ?? "";
    const around = tokenAround(lineText, word);
    if (!around) throw new Error(`"${word}" is not on line ${line}: ${JSON.stringify(lineText)}`);
    const replacements = options.options ?? imageOptions(listFiles(project), around.prefix, around.token);
    if (!replacements.length) throw new Error(`no image file starts with ${around.prefix}: pass --options`);
    const cpuProf = options.cpuProf && path.resolve(options.cpuProf);
    const script = await bundleBench("previewBench.ts", scratch, cpuProf);
    const modes = options.mode === "both" ? ["preview", "edit"] : [options.mode];
    let failed = false;
    for (const mode of modes) {
      const config = { project, line, word, options: replacements, mode, samples: options.samples, warmup: options.warmup, json: options.json ? path.resolve(`${options.json}.${mode}.json`) : undefined, gaps: cpuProf ? path.join(cpuProf, `${mode}.gaps.json`) : undefined };
      const profile = cpuProf ? ["--cpu-prof", "--cpu-prof-dir", cpuProf, "--cpu-prof-name", `${mode}.cpuprofile`] : [];
      const run = spawnSync(process.execPath, ["--max-old-space-size=4096", ...profile, script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
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
