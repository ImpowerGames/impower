#!/usr/bin/env node
// Runs the language server's typing benchmark (languageServerBench.ts, #704)
// under bare node: bundles it with the repository's esbuild, then runs it in a
// process of its own.
//
//   node scripts/bench/language-server-bench.mjs --project <dir> --line <N> --word <text>
//
// Options:
//   --project <dir>     a project directory holding main.sd
//   --line <N>          the line of main.sd to edit, counting from one
//   --word <text>       the word on that line an edit replaces; the whole
//                       identifier around it is what gets replaced
//   --options <a,b,..>  replacements, whole identifiers; default: every image
//                       file whose name starts like the identifier
//   --samples <K>       measured samples (default 12)
//   --warmup <W>        discarded samples first (default 4)
//   --json <file>       also write the report to <file>

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
    const json = options.json ? path.resolve(options.json) : undefined;
    const config = { project, line: options.line, word: options.word, options: replacements, samples: options.samples, warmup: options.warmup, json };
    const run = spawnSync(process.execPath, ["--max-old-space-size=4096", script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
    process.exitCode = run.status === 0 ? 0 : 1;
  } finally {
    // Only the directory this run created: the bundle.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
