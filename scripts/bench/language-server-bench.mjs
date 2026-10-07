#!/usr/bin/env node
// Runs the language server's typing benchmark (languageServerBench.ts, #704)
// under bare node: bundles it with the repository's esbuild, then runs each
// configuration in a process of its own, because a shared process inflates
// whatever runs second.
//
//   node scripts/bench/language-server-bench.mjs --project <dir> --line <N> --word <text> [--chunks]
//   node scripts/bench/language-server-bench.mjs --project <dir> --line <N> --word <text> --compare
//
// Options:
//   --project <dir>     a project directory holding main.sd
//   --line <N>          the line of main.sd to edit, counting from one
//   --word <text>       the word on that line an edit replaces; the whole
//                       identifier around it is what gets replaced
//   --options <a,b,..>  replacements, whole identifiers; default: every image
//                       file whose name starts like the identifier
//   --chunks            compile with the binary program's statement chunks
//                       on (`programChunks`), as the language server ships
//                       since #704; without it, as it compiled before
//   --compare           run both configurations, one process each, and
//                       compare the diagnostics of the cold compile and of
//                       every sample's compile, in order and with ranges
//   --samples <K>       measured samples per configuration (default 12)
//   --warmup <W>        discarded samples first (default 4)
//   --json <file>       also write each configuration's report, as
//                       <file>.<chunks|engine>.json

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBench, count, value } from "./benchLauncher.mjs";
import { imageOptions, tokenAround } from "./preview-bench.mjs";

function parseArgs(args) {
  const out = { samples: 12, warmup: 4 };
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    switch (name) {
      case "--project":
        out.project = value(args, i++, name);
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
      case "--chunks":
        out.chunks = true;
        break;
      case "--compare":
        out.compare = true;
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
      default:
        throw new Error(`unknown argument ${name}`);
    }
  }
  if (!out.project || out.line == null || out.word == null) throw new Error("pass --project <dir> --line <N> --word <text>");
  if (out.compare && out.chunks) throw new Error("--compare runs both configurations; leave out --chunks");
  return out;
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
  const options = parseArgs(args);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-language-server-bench-"));
  try {
    const project = path.resolve(options.project);
    const lineText = fs.readFileSync(path.join(project, "main.sd"), "utf8").split(/\r?\n/)[options.line - 1] ?? "";
    const around = tokenAround(lineText, options.word);
    if (!around) throw new Error(`"${options.word}" is not on line ${options.line}: ${JSON.stringify(lineText)}`);
    const replacements = options.options ?? imageOptions(listFiles(project), around.prefix, around.token);
    if (!replacements.length) throw new Error(`no image file starts with ${around.prefix}: pass --options`);
    const script = await bundleBench("languageServerBench.ts", scratch, null);
    const runs = options.compare ? [false, true] : [!!options.chunks];
    let failed = false;
    const dumps = [];
    for (const chunks of runs) {
      const label = chunks ? "chunks" : "engine";
      const json = options.json ? path.resolve(`${options.json}.${label}.json`) : undefined;
      const diagnostics = path.join(scratch, `${label}.diagnostics.json`);
      const config = { project, line: options.line, word: options.word, options: replacements, samples: options.samples, warmup: options.warmup, chunks, json, diagnostics };
      const run = spawnSync(process.execPath, ["--max-old-space-size=4096", script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
      if (run.status !== 0) failed = true;
      else dumps.push(JSON.parse(fs.readFileSync(diagnostics, "utf8")));
      console.log("");
    }
    if (options.compare && dumps.length === 2) {
      const [before, after] = dumps;
      const compiles = [["cold compile", before.cold, after.cold], ...before.samples.map((d, i) => [`sample ${i + 1}`, d, after.samples[i] ?? []])];
      const differing = compiles.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
      console.log(`diagnostics: ${compiles.length} compiles compared, ${before.cold.length} diagnostics in the cold compile; ${differing.length ? `differ in ${differing.map(([n]) => n).join(", ")}` : "identical, in order and with ranges"}`);
      for (const [name, a, b] of differing.slice(0, 1)) {
        const at = a.findIndex((d, i) => d !== b[i]);
        console.log(`  ${name}, first difference at ${at}:\n    without chunks: ${a[at] ?? "(none)"}\n    with chunks:    ${b[at] ?? "(none)"}`);
      }
      if (differing.length) failed = true;
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    // Only the directory this run created: the bundle and the dumps.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
