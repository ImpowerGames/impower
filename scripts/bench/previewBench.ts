// Worker-path benchmark for the Game Preview (#646, #647). Replays
// packages/spark-web-player/src/main/workers/workspace.worker.ts without a
// browser and times each phase of a highlighted suggestion (`preview`) or an
// accepted edit (`edit`) at one line of a project.
//
// Run through preview-bench.mjs, which bundles this file with esbuild and runs
// one configuration per process; it passes the configuration as one JSON
// argument: { project, line, word, options, mode, samples, warmup, json }.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import * as path from "node:path";
import * as v8 from "node:v8";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { setRetainProfilerEntries } from "../../packages/sparkdown/src/compiler/utils/profile";
import { ImageVocabularyCache, imageFileForCompiler } from "../../packages/sparkdown/src/workspace/utils/prepareImageFile";
import { ProgramTransportDecoder, ProgramTransportEncoder } from "../../packages/sparkdown/src/workspace/utils/programTransport";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "../../packages/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { RouteSearchLog } from "../../packages/spark-web-player/src/main/workers/RouteSearchLog";
import { searchRouteTo } from "../../packages/spark-web-player/src/main/workers/searchRouteTo";

interface BenchConfig {
  project: string;
  line: number;
  word: string;
  options: string[];
  mode: "preview" | "edit";
  samples: number;
  warmup: number;
  json?: string;
}

const config: BenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/preview-bench.mjs");
const PROFILER_ID = "bench";

const SCRIPT_RE = /\.sd$/i;
const IMAGE_RE = /\.(png|apng|jpeg|jpg|gif|bmp|svg|webp)$/i;
const AUDIO_RE = /\.(mid|wav|mp3|mp2|ogg|aac|opus|flac)$/i;
const FONT_RE = /\.(ttf|woff|woff2|otf)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// The files as the player's workspace hands them to its compiler: images
// prepared by the vocabulary cache, then stripped of their data.
function loadFiles() {
  const vocab = new ImageVocabularyCache();
  const files: any[] = [];
  for (const full of walk(config.project)) {
    const rel = path.relative(config.project, full).split(path.sep).join("/");
    const filename = rel.split("/").at(-1)!;
    const dot = filename.lastIndexOf(".");
    const ext = dot < 0 ? "" : filename.slice(dot + 1);
    const type = SCRIPT_RE.test(rel) ? "script" : IMAGE_RE.test(rel) ? "image" : AUDIO_RE.test(rel) ? "audio" : FONT_RE.test(rel) ? "font" : "";
    const stat = fs.statSync(full);
    const needsText = type === "script" || ext.toLowerCase() === "svg";
    const prepared = vocab.prepare({
      uri: "file:///local/" + rel,
      name: filename.split(".")[0]!,
      ext,
      type,
      src: `/file:/local/${rel}?v=${Math.floor(stat.mtimeMs)}-${stat.size}`,
      text: needsText ? fs.readFileSync(full, "utf8") : undefined,
      version: type === "script" ? 1 : Math.floor(stat.mtimeMs),
      languageId: type === "script" ? "sparkdown" : undefined,
    } as any);
    files.push(imageFileForCompiler(prepared, true));
  }
  return files;
}

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

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const stats = (a: number[]) => {
  const s = sorted(a);
  return { min: s[0] ?? 0, median: s[Math.floor(s.length / 2)] ?? 0, max: s.at(-1) ?? 0 };
};

// The compiler, the worker game and the route search log to the console as
// they run; the benchmark prints its own report.
const realLog = console.log;
const silence = () => {
  console.log = console.warn = console.error = console.info = console.debug = () => {};
};

function main() {
  setRetainProfilerEntries(true);
  const files = loadFiles();
  const mainUri = "file:///local/main.sd";
  const mainFile = files.find((f) => f.uri === mainUri);
  if (!mainFile) throw new Error(`${config.project} has no main.sd`);
  const line0 = config.line - 1;
  const lineText: string = mainFile.text.split(/\r?\n/)[line0] ?? "";
  const wordAt = lineText.indexOf(config.word);
  if (wordAt < 0) throw new Error(`"${config.word}" is not on line ${config.line}: ${JSON.stringify(lineText)}`);
  // The whole identifier the word belongs to is what a suggestion replaces.
  let start = wordAt;
  let end = wordAt + config.word.length;
  while (start > 0 && /\w/.test(lineText[start - 1]!)) start--;
  while (end < lineText.length && /\w/.test(lineText[end]!)) end++;
  const token = lineText.slice(start, end);
  const options = config.options.filter((o) => o !== token);
  if (!options.length) throw new Error(`no replacement for ${token}: pass --options`);

  silence();
  const compiler = new SparkdownCompiler();
  compiler.profilerId = PROFILER_ID;
  const encoder = new ProgramTransportEncoder();
  const decoder = new ProgramTransportDecoder();
  const system = {
    now: () => performance.now(),
    setTimeout: (h: any, t?: number, ...a: any[]) => setTimeout(h, t, ...a) as any,
    resolve: (p: string) => p,
    fetch: async () => "",
    log: () => {},
  };

  // The worker: one game kept across compiles, and the route searched to the
  // cursor after each, as workspace.worker.ts does.
  let workerGame: Game | undefined;
  let workerGameMs = 0;
  let routeSteps = 0;
  const updateWorkerGame = (program: any, story: any) => {
    const t0 = performance.now();
    if (!workerGame) {
      workerGame = new Game({ program, story, ...system, incrementalCheckpoints: true, verifyCheckpoints: false } as any);
    } else {
      workerGame.updateProgram(program, story);
    }
    workerGameMs += performance.now() - t0;
    return workerGame;
  };
  const search = (game: Game, toPath: string, log: RouteSearchLog, remember: boolean) => {
    searchRouteTo(game, toPath, log, { config: (compiler as any).config, profilerId: PROFILER_ID, remember });
    routeSteps = (game as any)._plannedRoute?.steps?.length ?? 0;
  };
  const routeSearches = new RouteSearchLog();
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    routeSearches.forget();
    const game = updateWorkerGame(params.program, params.story);
    if (params.program.startFrom) {
      game.setStartFrom(params.program.startFrom);
      const toPath = game.startPath;
      if (toPath) {
        search(game, toPath, routeSearches, true);
        // Attaches the route's checkpoint to the result, as the worker does.
        routeSearches.report(params, toPath);
      }
    }
  });
  compiler.addEventListener("compiler/didPreviewCompile", (params: any) => {
    const game = updateWorkerGame(params.program, params.story);
    game.setStartFrom(params.startFrom);
    const toPath = game.startPath;
    if (toPath) {
      const log = new RouteSearchLog();
      search(game, toPath, log, false);
      log.report(params, toPath);
    }
  });

  const startFrom = { file: mainUri, line: line0 };
  compiler.configure({
    files,
    definitions: {
      optionals: DEFAULT_OPTIONAL_DEFINITIONS,
      schemas: DEFAULT_SCHEMA_DEFINITIONS,
      descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
    },
    skipValidation: true,
    stripImageData: true,
    workspace: "file:///local",
    startFrom,
    seedBuiltinsIntoStory: true,
    experimentalDisplayCalls: true,
  } as any);
  const cold = compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);

  // The page: a second game that receives each program over the transport.
  let pageGame: Game | undefined;
  const updatePageGame = (program: any, checkpoint: string | undefined) => {
    const t0 = performance.now();
    if (!pageGame) pageGame = new Game({ program, ...system, startFrom, previewFrom: startFrom } as any);
    else pageGame.updateProgram(program);
    const t1 = performance.now();
    if (checkpoint) pageGame.load(checkpoint);
    return { update: t1 - t0, load: performance.now() - t1 };
  };
  updatePageGame(decoder.decode(structuredClone(encoder.encode(cold.program))), (cold as any).checkpoint);
  takeMeasures();

  const samples: any[] = [];
  let version = 1;
  let current = token;
  let lastEncoded: any;
  let lastCheckpoint = "";
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const option = options[i % options.length]!;
    const contentChanges = [{ range: { start: { line: line0, character: start }, end: { line: line0, character: start + current.length } }, text: option }];
    workerGameMs = 0;
    const t0 = performance.now();
    let result: any;
    if (config.mode === "preview") {
      result = compiler.previewCompile({ textDocument: { uri: mainUri, version }, contentChanges, root: { uri: mainUri }, startFrom } as any);
    } else {
      version += 1;
      compiler.updateDocument({ textDocument: { uri: mainUri, version }, contentChanges } as any);
      current = option;
      result = compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);
    }
    const t1 = performance.now();
    const encoded = encoder.encode(result.program);
    const t2 = performance.now();
    const wire = v8.serialize({ ...result, program: encoded });
    const t3 = performance.now();
    const received = v8.deserialize(wire);
    const t4 = performance.now();
    const decoded = decoder.decode(received.program);
    const t5 = performance.now();
    const page = updatePageGame(decoded, received.checkpoint);
    const phases = takeMeasures();
    if (i < config.warmup) continue;
    lastEncoded = encoded;
    lastCheckpoint = received.checkpoint ?? "";
    samples.push({
      option,
      wall: {
        "worker compile, game and route": t1 - t0,
        "(of which worker game.updateProgram)": workerGameMs,
        "transport encode": t2 - t1,
        "clone out (serialize)": t3 - t2,
        "clone in (deserialize)": t4 - t3,
        "transport decode": t5 - t4,
        "page game.updateProgram": page.update,
        "page game.load": page.load,
        "total without the DOM": t5 - t0 + page.update + page.load,
      },
      phases,
      wireKB: wire.length / 1024,
    });
  }
  const wireByKey: Record<string, number> = {};
  for (const [key, value] of Object.entries(lastEncoded ?? {})) {
    try {
      wireByKey[key] = v8.serialize(value).length / 1024;
    } catch {
      wireByKey[key] = -1;
    }
  }
  wireByKey["(checkpoint)"] = lastCheckpoint.length / 1024;

  const report = {
    mode: config.mode,
    project: config.project,
    line: config.line,
    lineText,
    token,
    options,
    warmup: config.warmup,
    samples: samples.length,
    routeSteps,
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1048576),
    wall: Object.fromEntries(Object.keys(samples[0]?.wall ?? {}).map((k) => [k, stats(samples.map((s) => s.wall[k]))])),
    phases: Object.fromEntries(
      [...new Set(samples.flatMap((s) => Object.keys(s.phases)))].map((k) => [k, stats(samples.map((s) => s.phases[k] ?? 0))]),
    ),
    wireKB: { total: stats(samples.map((s) => s.wireKB)), byKey: wireByKey },
    perSample: samples,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  printReport(report);
}

function printReport(report: any) {
  const row = (label: string, s: { min: number; median: number; max: number }) =>
    `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  const out = [
    `mode ${report.mode}: line ${report.line} ${JSON.stringify(report.lineText)}, replacing ${report.token}`,
    `${report.samples} samples after ${report.warmup} warm-up; route ${report.routeSteps} steps; heap ${report.heapUsedMB} MB`,
    "",
    `  ${"wall clock (ms)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    ...Object.entries(report.wall).map(([k, s]: any) => row(k, s)),
    "",
    `  ${"profiler phases (ms per sample)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    ...Object.entries(report.phases)
      .sort((a: any, b: any) => b[1].median - a[1].median)
      .filter(([, s]: any) => s.max >= 0.3)
      .map(([k, s]: any) => row(k, s)),
    "",
    `  wire: ${report.wireKB.total.median.toFixed(0)} KB per sample; by top-level program key (KB):`,
    ...Object.entries(report.wireKB.byKey)
      .sort((a: any, b: any) => b[1] - a[1])
      .filter(([, kb]: any) => kb >= 1)
      .map(([k, kb]: any) => `    ${k.padEnd(38)} ${kb.toFixed(0).padStart(9)}`),
  ];
  realLog(out.join("\n"));
}

// The games leave timers behind, so the process exits on its own terms.
try {
  main();
  process.exit(0);
} catch (error) {
  realLog(`bench failed: ${(error as Error)?.stack ?? error}`);
  process.exit(1);
}
