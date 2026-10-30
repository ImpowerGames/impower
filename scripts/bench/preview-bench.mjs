#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBench, count, value } from "./benchLauncher.mjs";
import { buildLoopFixture, writePreviewFixture } from "./preview-fixture.mjs";

const IMAGE_RE = /\.(png|apng|jpeg|jpg|gif|bmp|svg|webp)$/i;
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
  if (out.heapProbe && out.cpuProf) throw new Error("--heap-probe and --cpu-prof are exclusive");
  if (!out.project && !out.fixture) throw new Error("pass --project <dir> or --fixture");
  if (out.text != null && !out.structural) throw new Error("--text needs --structural");
  if (out.indent != null && !out.structural) throw new Error("--indent needs --structural");
  if (out.structural) {
    if (out.mode !== "both" && out.mode !== "edit") throw new Error("--structural measures the edit mode alone");
    out.mode = "edit";
    if (out.project && out.line == null) throw new Error("--project --structural needs --line");
  } else if (out.project && out.mode !== "coverage" && out.mode !== "cold" && (out.line == null || out.word == null)) throw new Error("--project needs --line and --word");
  return out;
}

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

export function tokenAround(lineText, word) {
  const at = lineText.indexOf(word);
  if (at < 0) return null;
  let start = at;
  let end = at + word.length;
  while (start > 0 && /\w/.test(lineText[start - 1])) start--;
  while (end < lineText.length && /\w/.test(lineText[end])) end++;
  return { token: lineText.slice(start, end), prefix: lineText.slice(start, at) };
}

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
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
