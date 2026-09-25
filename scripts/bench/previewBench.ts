// Worker-path benchmark for the Game Preview (#646, #647). Replays
// packages/spark-web-player/src/main/workers/workspace.worker.ts without a
// browser and times each phase of a highlighted suggestion (`preview`) or an
// accepted edit (`edit`) at one line of a project.
//
// It models the player as it ships: the compiler emits no compiled story, the
// game that searched the route loads its own checkpoint, connects to a sink
// and previews, and only the messages it emits are cloned, as they are on
// their way to the page. The compiler certifies an edit's changes as confined
// with its `ink/flowShapes` walk, so the route search resumes from its last
// route.
//
// Run through preview-bench.mjs, which bundles this file with esbuild and runs
// one configuration per process; it passes the configuration as one JSON
// argument: { project, line, word, options, mode, samples, warmup, json, gaps }.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import * as v8 from "node:v8";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { profile, setRetainProfilerEntries } from "../../packages/sparkdown/src/compiler/utils/profile";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { assetItemKey } from "../../packages/spark-engine/src/game/modules/assets/types/AssetItem";
import { RouteSearchLog } from "../../packages/spark-web-player/src/main/workers/RouteSearchLog";
import { searchRouteTo } from "../../packages/spark-web-player/src/main/workers/searchRouteTo";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { totalLength, uncovered } from "./phaseGaps.mjs";

interface BenchConfig {
  project: string;
  line: number;
  word: string;
  options: string[];
  mode: "preview" | "edit";
  samples: number;
  warmup: number;
  json?: string;
  // Where to write, for profile-shares.mjs --gaps, the stretches of each
  // measured sample's worker time that no phase covers.
  gaps?: string;
}

const config: BenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/preview-bench.mjs");
const PROFILER_ID = "bench";

type Interval = [number, number];

// The profiler's measures since the last call, summed per method, and the
// stretch each one covered. Names are `<profilerId> <method> <uri>`.
function takeMeasures(): { sums: Record<string, number>; intervals: Interval[] } {
  const sums: Record<string, number> = {};
  const intervals: Interval[] = [];
  for (const entry of performance.getEntriesByType("measure")) {
    const method = entry.name.split(" ")[1] ?? entry.name;
    sums[method] = (sums[method] ?? 0) + entry.duration;
    intervals.push([entry.startTime, entry.startTime + entry.duration]);
  }
  performance.clearMeasures();
  performance.clearMarks();
  return { sums, intervals };
}

// The report and a failure print here; main silences everything else.
let realLog = console.log;

// What the page answers each request with (UIManager, AudioManager,
// WorldManager, the asset loader), with every asset resident.
function pageResult(method: string, params: any): unknown {
  switch (method) {
    case "ui/write-text":
    case "ui/write-image":
      return params.target;
    case "ui/animate":
      return (params.effects ?? []).map((_: unknown, i: number) => i);
    case "assets/load": {
      const keys = (params.items ?? []).map(assetItemKey);
      return { loaded: keys, failed: [], pinned: keys };
    }
    case "audio/load":
      return { outputLatency: 0 };
    case "world/load":
      return params;
    default:
      return undefined;
  }
}

// The page's end of a game's connection. Every message the game emits is
// counted, and goes through v8.serialize and v8.deserialize first, as a
// postMessage to the page does; the answer to a request is cloned on its way
// back. Only messages sent while `open` are what a display sends;
// anything else is residue of the work before it.
class PageSink {
  open = false;
  count = 0;
  bytesOut = 0;
  bytesIn = 0;
  cloneMs = 0;
  outside: Record<string, number> = {};
  unanswered = new Set<string>();
  largest = { method: "", bytes: 0 };
  forbidden = new Set<string>();
  stream: string[] = [];
  bytesByMethod: Record<string, number> = {};

  constructor(readonly forbiddenStrings: () => string[]) {}

  reset() {
    this.count = this.bytesOut = this.bytesIn = this.cloneMs = 0;
    this.unanswered.clear();
    this.largest = { method: "", bytes: 0 };
    this.forbidden.clear();
    this.stream = [];
    this.bytesByMethod = {};
  }

  stats() {
    return {
      count: this.count,
      outKB: this.bytesOut / 1024,
      inKB: this.bytesIn / 1024,
      largest: { ...this.largest },
      kbByMethod: Object.fromEntries(Object.entries(this.bytesByMethod).map(([k, b]) => [k, b / 1024])),
      unanswered: [...this.unanswered],
      forbidden: [...this.forbidden],
    };
  }

  connect(game: Game) {
    return game.connect((sent: any) => {
      if (!this.open) {
        this.outside[sent.method] = (this.outside[sent.method] ?? 0) + 1;
        return;
      }
      const t0 = performance.now();
      const wire = v8.serialize(sent);
      const msg = v8.deserialize(wire);
      this.cloneMs += performance.now() - t0;
      this.count += 1;
      this.bytesOut += wire.length;
      this.bytesByMethod[msg.method] = (this.bytesByMethod[msg.method] ?? 0) + wire.length;
      if (wire.length > this.largest.bytes) this.largest = { method: msg.method, bytes: wire.length };
      this.inspect(msg, msg.method);
      this.stream.push(JSON.stringify({ method: msg.method, params: msg.params }));
      if (!("id" in msg)) return;
      const result = pageResult(msg.method, msg.params);
      if (result === undefined) this.unanswered.add(msg.method);
      const response = { jsonrpc: "2.0", id: msg.id, method: msg.method, result: result ?? "" };
      // Answered on a later microtask, as a page's answer arrives after the
      // turn that sent the request.
      queueMicrotask(() => {
        const t1 = performance.now();
        const back = v8.serialize(response);
        const received = v8.deserialize(back);
        this.cloneMs += performance.now() - t1;
        this.bytesIn += back.length;
        game.connection.receive(received);
      });
    });
  }

  // Records any key or string in a message that only the program, the
  // checkpoint or the path locations would carry.
  protected inspect(value: any, method: string) {
    const forbiddenStrings = this.forbiddenStrings();
    const walk = (v: any) => {
      if (typeof v === "string") {
        if (v.length > 1024 && forbiddenStrings.includes(v)) this.forbidden.add(`${method}: checkpoint`);
        return;
      }
      if (!v || typeof v !== "object") return;
      for (const [k, child] of Object.entries(v)) {
        if (k === "pathLocations" || k === "compiled" || k === "compiledBuffer" || k === "program") this.forbidden.add(`${method}: ${k}`);
        walk(child);
      }
    };
    walk(value);
  }
}

async function main() {
  setRetainProfilerEntries(true);
  const files = loadProjectFiles(config.project);
  const mainUri = MAIN_URI;
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

  realLog = silenceConsole();
  const compiler = new SparkdownCompiler();
  compiler.profilerId = PROFILER_ID;
  const system = benchSystem;

  // The worker: one game kept across compiles, and the route searched to the
  // cursor after each, as workspace.worker.ts does.
  let workerGame: Game | undefined;
  let workerGameMs = 0;
  // Each update's stretch, which counts as covered: it has no phase of its own.
  let workerGameIntervals: Interval[] = [];
  let routeSteps = 0;
  const updateWorkerGame = (program: any, story: any) => {
    const t0 = performance.now();
    if (!workerGame) {
      workerGame = new Game({ program, story, ...system, incrementalCheckpoints: true, verifyCheckpoints: false } as any);
    } else {
      workerGame.updateProgram(program, story);
    }
    const t1 = performance.now();
    workerGameMs += t1 - t0;
    workerGameIntervals.push([t0, t1]);
    return workerGame;
  };
  // Under the phase the worker gives it: it builds the program's path lookup
  // indexes the first time a program is asked for a path.
  const setStartFrom = (game: Game, startFrom: { file: string; line: number }) => {
    profile("start", PROFILER_ID, "game/setStartFrom");
    game.setStartFrom(startFrom);
    profile("end", PROFILER_ID, "game/setStartFrom");
  };
  // The last route search's target and the checkpoint it produced.
  let searched: { toPath: string; checkpoint?: string } | undefined;
  const search = (game: Game, toPath: string, log: RouteSearchLog, remember: boolean) => {
    const checkpoint = searchRouteTo(game, toPath, log, { config: (compiler as any).config, profilerId: PROFILER_ID, remember });
    routeSteps = (game as any)._plannedRoute?.steps?.length ?? 0;
    searched = { toPath, checkpoint };
  };
  const routeSearches = new RouteSearchLog();
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    routeSearches.forget();
    const game = updateWorkerGame(params.program, params.story);
    if (params.program.startFrom) {
      setStartFrom(game, params.program.startFrom);
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
    setStartFrom(game, params.startFrom);
    const toPath = game.startPath;
    if (toPath) {
      const log = new RouteSearchLog();
      search(game, toPath, log, false);
      log.report(params, toPath);
    }
  });

  const startFrom = { file: mainUri, line: line0 };
  configurePlayerCompiler(compiler, files, startFrom, { emitCompiledProgram: false });
  compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);

  // A preview's display, in the order the worker's display runs it
  // (`displayPreviewFrom`): declare the preview, drop the last preview's
  // images, end the route search's simulation, load the route's checkpoint,
  // connect, preview.
  let lastCheckpoint = "";
  const sink = new PageSink(() => [lastCheckpoint]);
  //
  // What the route search leaves on the game, which the display ends through
  // the engine: `system.simulating` stays set, and while it is set the
  // modules restore as a simulation does (the asset module prefetches
  // nothing, the ui module writes instantly). Every entry is a call the
  // engine offers; the benchmark resets no field by hand.
  const CALLS = ["game.endSimulation()"];
  const prepare = (game: Game, checkpoint: string | undefined) => {
    // What a preview displays is a suggestion, whose report the player takes
    // without what only the editors read.
    game.reportsExecutedLines = config.mode !== "preview";
    game.markPreviewing(searched?.toPath);
    game.module.ui.forgetDisplayedImages();
    game.endSimulation();
    const t0 = performance.now();
    if (checkpoint) game.load(checkpoint);
    return performance.now() - t0;
  };
  const display = async (game: Game) => {
    sink.reset();
    sink.open = true;
    const t0 = performance.now();
    await sink.connect(game);
    const t1 = performance.now();
    const previewed = await game.preview(mainUri, line0);
    const t2 = performance.now();
    sink.open = false;
    return { connect: t1 - t0, preview: t2 - t1, previewed };
  };
  // What the route search left on the game the display is from, read before
  // the display prepares it.
  const residueOf = (game: any) => ({
    state: game.state,
    simulation: game._simulation,
    "system.simulating": game._context.system.simulating ?? null,
    "system.previewing": game._context.system.previewing ?? null,
    incrementalCheckpoints: game._checkpoints?._incremental ?? game._checkpoints?.options?.incremental ?? null,
    previewedPath: game.previewedPath ?? null,
  });

  takeMeasures();

  const samples: any[] = [];
  // The profile's clock is process.hrtime in microseconds; performance.now()
  // is milliseconds from a later origin on the same clock.
  const clockOriginUs = Number(process.hrtime.bigint() / 1000n) - performance.now() * 1000;
  const gapsBySample: Interval[][] = [];
  let version = 1;
  let current = token;
  let residue: any;
  let lastStream: string[] = [];
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const option = options[i % options.length]!;
    const contentChanges = [{ range: { start: { line: line0, character: start }, end: { line: line0, character: start + current.length } }, text: option }];
    workerGameMs = 0;
    workerGameIntervals = [];
    const t0 = performance.now();
    if (config.mode === "preview") {
      compiler.previewCompile({ textDocument: { uri: mainUri, version }, contentChanges, root: { uri: mainUri }, startFrom } as any);
    } else {
      version += 1;
      compiler.updateDocument({ textDocument: { uri: mainUri, version }, contentChanges } as any);
      current = option;
      compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);
    }
    const t1 = performance.now();
    const game = workerGame!;
    const before = residueOf(game);
    lastCheckpoint = searched?.checkpoint ?? "";
    const load = prepare(game, searched?.checkpoint);
    const shown = await display(game);
    const { sums: phases, intervals } = takeMeasures();
    if (i < config.warmup) continue;
    const gaps = uncovered([t0, t1], [...intervals, ...workerGameIntervals]);
    gapsBySample.push(gaps);
    residue = { calls: CALLS, beforeDisplay: before, afterDisplay: residueOf(game), outsideMessages: { ...sink.outside }, previewed: shown.previewed };
    lastStream = sink.stream;
    samples.push({
      option,
      wall: {
        "worker compile, game and route": t1 - t0,
        "(of which worker game.updateProgram)": workerGameMs,
        "(of which unattributed)": totalLength(gaps),
        "worker game.load": load,
        "worker connect": shown.connect,
        "worker preview": shown.preview,
        "(of which message clone)": sink.cloneMs,
        "total without the DOM": t1 - t0 + load + sink.cloneMs,
      },
      phases,
      messages: sink.stats(),
    });
  }

  const withMessages = samples.filter((s) => s.messages);
  const last = samples.at(-1)?.messages;
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
    messages: withMessages.length
      ? {
          count: stats(withMessages.map((s) => s.messages.count)),
          outKB: stats(withMessages.map((s) => s.messages.outKB)),
          inKB: stats(withMessages.map((s) => s.messages.inKB)),
          largest: last?.largest,
          kbByMethod: last?.kbByMethod,
          unanswered: last?.unanswered,
          forbidden: [...new Set(withMessages.flatMap((s) => s.messages.forbidden))],
        }
      : undefined,
    residue,
    // The last sample's display, message by message.
    displayStream: lastStream,
    perSample: samples,
  };
  if (config.gaps) {
    const us = (t: number) => clockOriginUs + t * 1000;
    fs.writeFileSync(config.gaps, JSON.stringify({ clock: "process.hrtime, microseconds", samples: gapsBySample.map((gaps) => gaps.map(([s, e]) => [us(s), us(e)])) }));
  }
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
  ];
  const m = report.messages;
  if (m) {
    out.push(
      "",
      `  ${"display messages (cloned)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      row("count", m.count),
      row("KB to the page", m.outKB),
      ...(m.inKB ? [row("KB of answers back", m.inKB)] : []),
      `  largest message: ${m.largest?.method} ${((m.largest?.bytes ?? 0) / 1024).toFixed(1)} KB; by method (KB, last sample):`,
      ...Object.entries(m.kbByMethod ?? {})
        .sort((a: any, b: any) => b[1] - a[1])
        .map(([k, kb]: any) => `    ${k.padEnd(38)} ${kb.toFixed(1).padStart(9)}`),
    );
    if (m.unanswered?.length) out.push(`  requests the sink does not model: ${m.unanswered.join(", ")}`);
    if (m.forbidden) out.push(`  program, checkpoint or path locations in what was cloned: ${m.forbidden.length ? m.forbidden.join("; ") : "none"}`);
  }
  if (report.residue) {
    const r = report.residue;
    out.push(
      "",
      `  engine calls before each display: ${r.calls.join(", ")}; fields reset by hand: none`,
      `  the route game before the display: ${JSON.stringify(r.beforeDisplay)}`,
      `  after it: ${JSON.stringify(r.afterDisplay)}`,
      `  messages it sent outside a display, over the run: ${JSON.stringify(r.outsideMessages)}; previewed ${r.previewed}`,
    );
  }
  realLog(out.join("\n"));
}

// The games leave timers behind, so the process exits on its own terms.
main().then(
  () => process.exit(0),
  (error) => {
    realLog(`bench failed: ${(error as Error)?.stack ?? error}`);
    process.exit(1);
  },
);
