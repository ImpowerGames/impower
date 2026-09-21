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
//   --json <file>       also write each mode's full report, as <file>.<mode>.json,
//                       and the preview's resident shape as <file>.preview.resident.json
//
// A preview runs twice, in the transport shape and the resident shape (see
// previewBench.ts), each in its own process, and ends with the two compared.
//   --cpu-prof <dir>    also write a V8 CPU profile of each process there
//                       (<mode>.cpuprofile, <mode>.<shape>.cpuprofile), with the
//                       bundle's source map, for profile-shares.mjs, and beside
//                       each a .gaps.json of the same name: the stretches of
//                       worker time no phase covers, for --gaps. A
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// A request's id, which the protocol mints as eight random characters.
const REQUEST_ID_RE = /"id":"[0-9A-Za-z]{8}"/g;

// The first place two display streams differ, ignoring generated ids; null
// when they are the same.
export function firstStreamDifference(a, b) {
  const norm = (s) => s.replace(UUID_RE, "<uuid>").replace(REQUEST_ID_RE, '"id":"<id>"');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] == null ? undefined : norm(a[i]);
    const y = b[i] == null ? undefined : norm(b[i]);
    if (x !== y) return { index: i, transport: x?.slice(0, 300) ?? "(none)", resident: y?.slice(0, 300) ?? "(none)" };
  }
  return null;
}

// How many of each operation a display stream carries, counting the ops inside
// a `ui/batch` under `ui/batch > <op>`.
export function streamOps(stream) {
  const ops = {};
  const add = (key) => (ops[key] = (ops[key] ?? 0) + 1);
  for (const line of stream) {
    const msg = JSON.parse(line);
    if (msg.method === "ui/batch") for (const inner of msg.params?.messages ?? []) add(`ui/batch > ${inner.method}`);
    else add(msg.method);
  }
  return ops;
}

// The shapes of a preview side by side: what each resident shape saves on the
// like-for-like total (the transport total, the page's connect and preview
// excluded, against the resident total, which counts the load and the message
// clone and not the connect and preview), and whether the route game displayed
// what the page's game did.
export function compareShapes(transport, resident, emitting) {
  const total = "total without the DOM";
  const t = transport.wall[total];
  const row = (label, s) => `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  const lines = [
    "preview, transport shape against the resident shapes (ms)",
    `  ${"".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    row("transport total without the DOM", t),
  ];
  for (const [name, report] of [["resident", resident], ["resident-emitting", emitting]]) {
    if (!report) continue;
    const r = report.wall[total];
    lines.push(row(`${name} total without the DOM`, r), row(`saved by ${name}`, { min: t.min - r.max, median: t.median - r.median, max: t.max - r.min }));
  }
  const diff = firstStreamDifference(transport.displayStream ?? [], resident.displayStream ?? []);
  const shapes = resident.phases["ink/flowShapes"];
  lines.push(
    `  ink/json in the resident phases: ${resident.phases["ink/json"] ? "present" : "absent"}`,
    `  ink/flowShapes, which stands in for it: ${shapes ? `${shapes.min.toFixed(1)} / ${shapes.median.toFixed(1)} / ${shapes.max.toFixed(1)} ms (min / median / max)` : "absent"}`,
    `  display: ${resident.messages?.count.median ?? 0} messages, ${(resident.messages?.outKB.median ?? 0).toFixed(1)} KB cloned to the page, against ${transport.wireKB?.total.median.toFixed(0)} KB of program and checkpoint`,
    diff
      ? `  the route game's display differs from the page game's, first at message ${diff.index}:\n    transport ${diff.transport}\n    resident  ${diff.resident}`
      : `  the route game's display matches the page game's, message for message (${resident.displayStream?.length ?? 0} messages)`,
  );
  if (diff) {
    const t = streamOps(transport.displayStream ?? []);
    const r = streamOps(resident.displayStream ?? []);
    lines.push("  operations whose count differs (transport, resident):");
    for (const op of [...new Set([...Object.keys(t), ...Object.keys(r)])].sort()) {
      if (t[op] !== r[op]) lines.push(`    ${op.padEnd(38)} ${String(t[op] ?? 0).padStart(9)} ${String(r[op] ?? 0).padStart(9)}`);
    }
  }
  return lines.join("\n");
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
      // A preview is measured in both shapes; see previewBench.ts.
      const shapes = mode === "preview" ? ["transport", "resident", "resident-emitting"] : ["transport"];
      const reports = {};
      for (const shape of shapes) {
        const name = shape === "transport" ? mode : `${mode}.${shape}`;
        const json = options.json ? path.resolve(`${options.json}.${name}.json`) : path.join(scratch, `${name}.json`);
        const gaps = cpuProf ? path.join(cpuProf, `${name}.gaps.json`) : undefined;
        const config = { project, line, word, options: replacements, mode, shape, samples: options.samples, warmup: options.warmup, json, gaps };
        const profile = cpuProf ? ["--cpu-prof", "--cpu-prof-dir", cpuProf, "--cpu-prof-name", `${name}.cpuprofile`] : [];
        const run = spawnSync(process.execPath, ["--max-old-space-size=4096", ...profile, script, JSON.stringify(config)], { stdio: "inherit", windowsHide: true });
        if (run.status !== 0) failed = true;
        else reports[shape] = JSON.parse(fs.readFileSync(json, "utf8"));
        console.log("");
      }
      if (reports.transport && reports.resident) console.log(compareShapes(reports.transport, reports.resident, reports["resident-emitting"]) + "\n");
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
