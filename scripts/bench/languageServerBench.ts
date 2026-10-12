// Typing benchmark for the language server's compiler (#704). Replays what
// the language server's compiler worker does on a keystroke without a
// browser: the document update, the compile with the configuration the
// language server gives its compiler (validation on, no builtins seeded into
// the story, the start position the workspace routes to) and the encoding of
// the program it answers the language server with (`ProgramTransportEncoder`).
// It runs no game: the language server runs none.
//
// Run through language-server-bench.mjs, which bundles this file with
// esbuild and runs it in a process of its own; it passes the configuration as
// one JSON argument: { project, line, word, options, samples, warmup, json }.
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../packages/sparkdown/src/compiler/types/SparkProgram";
import { setRetainProfilerEntries } from "../../packages/sparkdown/src/compiler/utils/profile";
import { ProgramTransportEncoder } from "../../packages/sparkdown/src/workspace/utils/programTransport";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import { MAIN_URI, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface BenchConfig {
  project: string;
  line: number;
  word: string;
  options: string[];
  samples: number;
  warmup: number;
  json?: string;
}

const config: BenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/language-server-bench.mjs");
const PROFILER_ID = "bench";

// The profiler's measures since the last call, summed per method. Names are
// `<profilerId> <method> <uri>`.
function takeMeasures(): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const entry of performance.getEntriesByType("measure")) {
    const method = entry.name.split(" ")[1] ?? entry.name;
    sums[method] = (sums[method] ?? 0) + entry.duration;
  }
  performance.clearMeasures();
  performance.clearMarks();
  return sums;
}

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const diagnosticsOf = (program: SparkProgram): string[] =>
  Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) => (program.diagnostics![uri] ?? []).map((d) => `${uri.replace("file:///local/", "")} ${stable(d)}`));

let realLog = console.log;

async function main() {
  setRetainProfilerEntries(true);
  // The files as the language server's workspace hands them to its compiler.
  const files = loadProjectFiles(config.project);
  const mainUri = MAIN_URI;
  const mainFile = files.find((f) => f.uri === mainUri);
  if (!mainFile) throw new Error(`${config.project} has no main.sd`);
  const line0 = config.line - 1;
  const lineText: string = mainFile.text.split(/\r?\n/)[line0] ?? "";
  const wordAt = lineText.indexOf(config.word);
  if (wordAt < 0) throw new Error(`"${config.word}" is not on line ${config.line}: ${JSON.stringify(lineText)}`);
  let start = wordAt;
  let end = wordAt + config.word.length;
  while (start > 0 && /\w/.test(lineText[start - 1]!)) start--;
  while (end < lineText.length && /\w/.test(lineText[end]!)) end++;
  const token = lineText.slice(start, end);
  const options = config.options.filter((o) => o !== token);
  if (!options.length) throw new Error(`no replacement for ${token}: pass --options`);

  realLog = silenceConsole();
  const compiler = new SparkdownCompiler();
  compiler.profilerId = PROFILER_ID;
  const startFrom = { file: mainUri, line: line0 };
  // What the language server's hosts send (`initializationOptions`), less
  // what the workspace keeps for itself.
  compiler.configure({
    files,
    definitions: {
      optionals: DEFAULT_OPTIONAL_DEFINITIONS,
      schemas: DEFAULT_SCHEMA_DEFINITIONS,
      descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
    },
    workspace: "file:///local",
    stripImageData: true,
    startFrom,
  } as any);
  const transport = new ProgramTransportEncoder();
  const cold = compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any).program;
  transport.encode(cold);
  const coldDiagnostics = diagnosticsOf(cold).length;
  const fallback = compiler.lastProgramBuild?.unsupported?.construct ?? null;
  takeMeasures();

  const samples: any[] = [];
  let version = 1;
  let current = token;
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const option = options[i % options.length]!;
    const contentChanges = [{ range: { start: { line: line0, character: start }, end: { line: line0, character: start + current.length } }, text: option }];
    const runsBefore = compiler.chunkStore?.initializerRuns ?? 0;
    version += 1;
    const t0 = performance.now();
    compiler.updateDocument({ textDocument: { uri: mainUri, version }, contentChanges } as any);
    current = option;
    const program = compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any).program;
    const t1 = performance.now();
    transport.encode(program);
    const t2 = performance.now();
    const phases = takeMeasures();
    if (i < config.warmup) continue;
    samples.push({
      option,
      wall: { compile: t1 - t0, "transport encode": t2 - t1, together: t2 - t0 },
      phases,
      passes: {
        initializerRuns: (compiler.chunkStore?.initializerRuns ?? 0) - runsBefore,
        emitted: compiler.chunkStore?.emittedLastBuild,
        fallback: compiler.lastProgramBuild?.unsupported?.construct ?? null,
      },
    });
  }
  const report = {
    project: config.project,
    line: config.line,
    lineText,
    token,
    fallback,
    warmup: config.warmup,
    samples: samples.length,
    diagnostics: coldDiagnostics,
    wall: Object.fromEntries(Object.keys(samples[0]?.wall ?? {}).map((k) => [k, stats(samples.map((s) => s.wall[k]))])),
    phases: Object.fromEntries(
      [...new Set(samples.flatMap((s) => Object.keys(s.phases)))].map((k) => [k, stats(samples.map((s) => s.phases[k] ?? 0))]),
    ),
    perSample: samples,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  printReport(report);
}

function printReport(report: any) {
  const row = (label: string, s: { min: number; median: number; max: number }) =>
    `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  const out = [
    `language server compile: line ${report.line} ${JSON.stringify(report.lineText)}, replacing ${report.token}`,
    `${report.samples} samples after ${report.warmup} warm-up${report.fallback ? ` (the program was not built: ${report.fallback})` : ""}; ${report.diagnostics} diagnostics`,
    "",
    `  ${"wall clock (ms)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    ...Object.entries(report.wall).map(([k, s]: any) => row(k, s)),
    "",
    `  ${"profiler phases (ms per sample)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    ...Object.entries(report.phases)
      .sort((a: any, b: any) => b[1].median - a[1].median)
      .filter(([, s]: any) => s.max >= 0.3)
      .map(([k, s]: any) => row(k, s)),
  ];
  const passes = report.perSample?.map((s: any) => s.passes).filter(Boolean);
  if (passes?.length) {
    out.push("", "  chunk store, per sample:", ...passes.map((p: any) => `    ${JSON.stringify(p)}`));
  }
  realLog(out.join("\n"));
}

main().then(
  () => process.exit(0),
  (error) => {
    realLog(`bench failed: ${(error as Error)?.stack ?? error}`);
    process.exit(1);
  },
);
