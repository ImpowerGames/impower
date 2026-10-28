// Worker-path benchmark for the Game Preview (#646, #647). Replays
// packages/spark-web-player/src/main/workers/workspace.worker.ts without a
// browser and times each phase of a highlighted suggestion (`preview`) or an
// accepted edit (`edit`) at one line of a project.
//
// It models the player as it ships: the worker's game runs the program engine
// on the compile's statement chunks, the game that searched the route loads
// its own checkpoint, connects to a sink
// and previews, and only the messages it emits are cloned, as they are on
// their way to the page. The compiler certifies an edit's changes as confined
// with its `ink/flowShapes` walk, so the route search resumes from its last
// route.
//
// Run through preview-bench.mjs, which bundles this file with esbuild and runs
// one configuration per process; it passes the configuration as one JSON
// argument: { project, line, word, options, structural, mode, samples, warmup,
// json, gaps }.
import * as fs from "node:fs";
import * as v8 from "node:v8";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { ProgramAddress } from "../../packages/sparkdown/src/compiler/types/ProgramAddress";
import { profile, setRetainProfilerEntries } from "../../packages/sparkdown/src/compiler/utils/profile";
import { ParsedObject } from "../../packages/sparkdown/src/inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { assetItemKey } from "../../packages/spark-engine/src/game/modules/assets/types/AssetItem";
import { RouteSearchLog } from "../../packages/spark-web-player/src/main/workers/RouteSearchLog";
import { searchRouteFor } from "../../packages/spark-web-player/src/main/workers/searchRouteTo";
import { workerBeatOnly, type StandingDisplay } from "../../packages/spark-web-player/src/main/workers/classifyDisplay";
import type { StoredCheckpoint } from "../../packages/spark-engine/src/game/core/classes/CheckpointStore";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { totalLength, uncovered } from "./phaseGaps.mjs";

interface BenchConfig {
  project: string;
  line: number;
  word: string;
  options: string[];
  // A structural edit in place of a replacement (#1672): the samples
  // alternately apply `insert`, which adds `inserted` as a line after `line`,
  // and `remove`, which takes it out again (`structuralEdits` in
  // preview-bench.mjs).
  structural?: { lineText: string; inserted: string; insert: ContentChange; remove: ContentChange };
  // `cold`: each sample compiles the project on a compiler of its own, with
  // no game (#1712).
  mode: "preview" | "edit" | "cold";
  samples: number;
  warmup: number;
  json?: string;
  // Where to write, for profile-shares.mjs --gaps, the stretches of each
  // measured sample's worker time that no phase covers.
  gaps?: string;
  // Refuse the compiler's parsed-flow reuse (`tryReuseFlowRun`) on every
  // compile, as `_disableFlowReuseNextCompile` does for one (#1712).
  noFlowReuse?: boolean;
  // After the last sample, a heap snapshot at `<heapProbe>.heapsnapshot` and
  // the parsed classes alive then at `<heapProbe>.parsed.json`, for
  // heap-retained.mjs (#1712).
  heapProbe?: string;
  // Where to write, for profile-shares.mjs --windows, the stretch of each
  // measured sample's compile, so that a profile leaves out the warm-up and
  // the first compile (#1712).
  windows?: string;
}

interface ContentChange {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  text: string;
}

function writeWindows(file: string, clockOriginUs: number, windows: [number, number][]) {
  const us = (t: number) => clockOriginUs + t * 1000;
  fs.writeFileSync(file, JSON.stringify({ clock: "process.hrtime, microseconds", samples: windows.map(([s, e]) => [[us(s), us(e)]]) }));
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
    return game.connect(this.send(game));
  }

  // A beat-only display's stand-in for the connect (#657).
  redisplay(game: Game) {
    return game.redisplay(this.send(game));
  }

  protected send(game: Game) {
    return (sent: any) => {
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
    };
  }

  // Records any key or string in a message that only the program, the
  // checkpoint or the path locations would carry.
  protected inspect(value: any, method: string) {
    // Asked for only when a message carries a string that long: the
    // checkpoint's full save is written for the comparison alone, which a
    // display no longer writes (#1758).
    let forbiddenStrings: string[] | undefined;
    const walk = (v: any) => {
      if (typeof v === "string") {
        if (v.length > 1024 && (forbiddenStrings ??= this.forbiddenStrings()).includes(v)) this.forbidden.add(`${method}: checkpoint`);
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

// The parsed objects alive after full collections, counted by class, and,
// with `heapProbe`, a heap snapshot beside them: heap-retained.mjs reads the
// two and measures what only parsed objects hold (#1712). A class's name is
// its constructor's name in this bundle, which is the name the snapshot gives
// its instances.
function probeParsedObjects(): Record<string, unknown> {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  gc?.();
  const byClass: Record<string, number> = {};
  for (const line of v8.queryObjects(ParsedObject as any, { format: "summary" }) as string[]) {
    const name = /^[\w$]+/.exec(line)?.[0] ?? "?";
    byClass[name] = (byClass[name] ?? 0) + 1;
  }
  const probe: Record<string, unknown> = {
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 104857.6) / 10,
    // Each class's prototype is listed once among them.
    parsedObjects: Object.values(byClass).reduce((a, b) => a + b, 0),
    byClass,
  };
  if (config.heapProbe) {
    fs.writeFileSync(`${config.heapProbe}.parsed.json`, JSON.stringify(probe, null, 2));
    probe.snapshot = v8.writeHeapSnapshot(`${config.heapProbe}.heapsnapshot`);
  }
  return probe;
}

// A cold compile: a compiler of its own for each sample, configured and
// compiled as the worker's first compile is, with no game listening.
async function coldMain() {
  setRetainProfilerEntries(true);
  const files = loadProjectFiles(config.project);
  const startFrom = { file: MAIN_URI, line: Math.max(0, (config.line ?? 1) - 1) };
  realLog = silenceConsole();
  takeMeasures();
  const samples: { wall: number; phases: Record<string, number> }[] = [];
  const clockOriginUs = Number(process.hrtime.bigint() / 1000n) - performance.now() * 1000;
  const windows: [number, number][] = [];
  let compiler: SparkdownCompiler | undefined;
  for (let i = 0; i < config.warmup + config.samples; i++) {
    compiler = undefined;
    (globalThis as { gc?: () => void }).gc?.();
    takeMeasures();
    const t0 = performance.now();
    compiler = new SparkdownCompiler();
    compiler.profilerId = PROFILER_ID;
    configurePlayerCompiler(compiler, files, startFrom);
    compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
    const t1 = performance.now();
    const { sums } = takeMeasures();
    if (i < config.warmup) continue;
    samples.push({ wall: t1 - t0, phases: sums });
    windows.push([t0, t1]);
  }
  if (config.windows) writeWindows(config.windows, clockOriginUs, windows);
  const probe = probeParsedObjects();
  const report = {
    mode: "cold",
    project: config.project,
    warmup: config.warmup,
    samples: samples.length,
    wall: stats(samples.map((s) => s.wall)),
    phases: Object.fromEntries(
      [...new Set(samples.flatMap((s) => Object.keys(s.phases)))].map((k) => [k, stats(samples.map((s) => s.phases[k] ?? 0))]),
    ),
    parsedProbe: probe,
    perSample: samples,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const row = (label: string, s: { min: number; median: number; max: number }) =>
    `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  realLog(
    [
      `mode cold: ${report.samples} samples after ${report.warmup} warm-up, a compiler of its own each`,
      `after the last: ${probe.heapUsedMB} MB after full collections, ${probe.parsedObjects} parsed objects alive`,
      "",
      `  ${"wall clock (ms)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      row("compile", report.wall),
      "",
      `  ${"profiler phases (ms per sample)".padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      ...Object.entries(report.phases)
        .sort((a: any, b: any) => b[1].median - a[1].median)
        .filter(([, s]: any) => s.max >= 0.3)
        .map(([k, s]: any) => row(k, s)),
    ].join("\n"),
  );
  // Held until here, so the probe sees the last compile's objects.
  void compiler;
}

async function main() {
  if (config.mode === "cold") return coldMain();
  setRetainProfilerEntries(true);
  const files = loadProjectFiles(config.project);
  const mainUri = MAIN_URI;
  const mainFile = files.find((f) => f.uri === mainUri);
  if (!mainFile) throw new Error(`${config.project} has no main.sd`);
  const line0 = config.line - 1;
  const lineText: string = mainFile.text.split(/\r?\n/)[line0] ?? "";
  const structural = config.structural;
  let start = 0;
  let token = "";
  let options: string[] = [];
  if (!structural) {
    const wordAt = lineText.indexOf(config.word);
    if (wordAt < 0) throw new Error(`"${config.word}" is not on line ${config.line}: ${JSON.stringify(lineText)}`);
    // The whole identifier the word belongs to is what a suggestion replaces.
    start = wordAt;
    let end = wordAt + config.word.length;
    while (start > 0 && /\w/.test(lineText[start - 1]!)) start--;
    while (end < lineText.length && /\w/.test(lineText[end]!)) end++;
    token = lineText.slice(start, end);
    options = config.options.filter((o) => o !== token);
    if (!options.length) throw new Error(`no replacement for ${token}: pass --options`);
  } else if (structural.lineText !== lineText) {
    throw new Error(`line ${config.line} changed since the structural edit was made for it: ${JSON.stringify(lineText)}`);
  }
  // The document's text as the compiler holds it, which every structural
  // removal has to give back byte for byte. The compiler's documents hold
  // line breaks as `\n` whatever the file has, so the text to compare with is
  // the compiler's own from before the first sample, not the file's.
  const documentText = () => compiler.documents.get(mainUri)?.getText();

  realLog = silenceConsole();
  const compiler = new SparkdownCompiler();
  compiler.profilerId = PROFILER_ID;
  // The worker's game composes each display into one `ui/beat`, as
  // `installGameWorker` has it (#1820).
  const system = { ...benchSystem, composeBeats: true };

  // The worker: one game kept across compiles, and the route searched to the
  // cursor after each, as workspace.worker.ts does.
  let workerGame: Game | undefined;
  let workerGameMs = 0;
  // Each update's stretch, which counts as covered: it has no phase of its own.
  let workerGameIntervals: Interval[] = [];
  let routeSteps = 0;
  const updateWorkerGame = (program: any) => {
    const t0 = performance.now();
    if (!workerGame) {
      workerGame = new Game({ program, ...system } as any);
    } else {
      workerGame.updateProgram(program);
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
    // The line's last beat, which the worker routes a preview to
    // (`installPlayerWorker.ts`, both compile handlers).
    game.setStartFrom(startFrom, "last");
    profile("end", PROFILER_ID, "game/setStartFrom");
  };
  // The last route search's target and the checkpoint it produced.
  // The checkpoint is the value the worker's route hands its display
  // (`searchRouteFor`), which the display loads in place (#1758).
  let searched: { to: ProgramAddress; checkpoint?: StoredCheckpoint } | undefined;
  const search = (game: Game, to: ProgramAddress, log: RouteSearchLog, remember: boolean) => {
    const checkpoint = searchRouteFor(game, to, log, { config: (compiler as any).config, profilerId: PROFILER_ID, remember });
    routeSteps = (game as any)._plannedRoute?.steps?.length ?? 0;
    searched = { to, checkpoint };
  };
  const routeSearches = new RouteSearchLog();
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    routeSearches.forget();
    const game = updateWorkerGame(params.program);
    if (params.program.startFrom) {
      setStartFrom(game, params.program.startFrom);
      const to = game.startAddress;
      if (to != null) {
        search(game, to, routeSearches, true);
        // Attaches the route's checkpoint to the result, as the worker does.
        routeSearches.report(params, to);
      }
    }
  });
  compiler.addEventListener("compiler/didPreviewCompile", (params: any) => {
    const game = updateWorkerGame(params.program);
    setStartFrom(game, params.startFrom);
    const to = game.startAddress;
    if (to != null) {
      const log = new RouteSearchLog();
      search(game, to, log, false);
      log.report(params, to);
    }
  });

  const startFrom = { file: mainUri, line: line0 };
  configurePlayerCompiler(compiler, files, startFrom);
  // The first compile searches its route from the top, which no sample
  // does while the route before it still holds (#1636).
  const firstT0 = performance.now();
  compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);
  const firstCompile = {
    ms: performance.now() - firstT0,
    planRouteMs: takeMeasures().sums["game/planRoute"] ?? 0,
  };
  const originalText = documentText();

  // A preview's display, in the order the worker's display runs it
  // (`displayPreviewFrom`): declare the preview, drop the last preview's
  // images, end the route search's simulation, load the route's checkpoint,
  // connect, preview.
  let lastCheckpoint: (() => string) | undefined;
  const sink = new PageSink(() => (lastCheckpoint ? [lastCheckpoint()] : []));
  //
  // What the route search leaves on the game, which the display ends through
  // the engine: `system.simulating` stays set, and while it is set the
  // modules restore as a simulation does (the asset module prefetches
  // nothing, the ui module writes instantly). Every entry is a call the
  // engine offers; the benchmark resets no field by hand.
  const CALLS = ["game.endSimulation()"];
  const prepare = (game: Game, checkpoint: StoredCheckpoint | undefined) => {
    // What a preview displays is a suggestion, whose report the player takes
    // without what only the editors read.
    game.reportsExecutedLines = config.mode !== "preview";
    game.markPreviewing(searched?.to);
    game.module.ui.forgetDisplayedImages();
    game.endSimulation();
    const t0 = performance.now();
    if (checkpoint) game.loadCheckpoint(checkpoint);
    return performance.now() - t0;
  };
  // A display connects, or redisplays when it is beat-only (#657), previews
  // and sweeps, as `displayPreviewFrom` does.
  const display = async (game: Game, beatOnly: boolean, line: number) => {
    sink.reset();
    sink.open = true;
    const t0 = performance.now();
    await (beatOnly ? sink.redisplay(game) : sink.connect(game));
    const t1 = performance.now();
    const previewed = await game.preview(mainUri, line);
    game.module.ui.sweepReconcile();
    const t2 = performance.now();
    // The composed display goes once what it realizes is in, a few
    // microtasks after the sweep; it is counted, not timed.
    await new Promise((resolve) => setImmediate(resolve));
    sink.open = false;
    return { connect: t1 - t0, preview: t2 - t1, previewed };
  };
  // The display the page shows, as the worker records it (`classifyDisplay`).
  let standing: StandingDisplay | undefined;
  // What the route search left on the game the display is from, read before
  // the display prepares it.
  const residueOf = (game: any) => ({
    state: game.state,
    simulation: game._simulation,
    "system.simulating": game._context.system.simulating ?? null,
    "system.previewing": game._context.system.previewing ?? null,
    previewedAddress: game.previewedAddress ?? null,
  });

  takeMeasures();

  const samples: any[] = [];
  // The heap the process holds after full collections (the launcher exposes
  // `gc`), in MB: after the first measured sample, when the warm-up has
  // filled the caches, after every 50th, and after the last, so that a run
  // of N samples says whether N highlights left the worker holding more, and
  // whether what it holds grows with them or settles.
  const heapNow = () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    gc?.();
    return Math.round(process.memoryUsage().heapUsed / 104857.6) / 10;
  };
  let heapAfterFirst = 0;
  const heapEvery50: number[] = [];
  // The profile's clock is process.hrtime in microseconds; performance.now()
  // is milliseconds from a later origin on the same clock.
  const clockOriginUs = Number(process.hrtime.bigint() / 1000n) - performance.now() * 1000;
  const gapsBySample: Interval[][] = [];
  // Each measured sample's compile, game and route, for --windows.
  const windowsBySample: Interval[] = [];
  let version = 1;
  let current = token;
  let residue: any;
  let lastStream: string[] = [];
  let restoredMatches: boolean | undefined;
  for (let i = 0; i < config.warmup + config.samples; i++) {
    // A structural sample inserts the line or removes it, alternately, and
    // previews where the editor leaves the caret: on the inserted line after
    // an insert, on the measured line after a removal (#1672).
    const direction = structural ? (i % 2 === 0 ? "insert" : "remove") : undefined;
    const option = direction ?? options[i % options.length]!;
    const contentChanges = direction
      ? [structural![direction]]
      : [{ range: { start: { line: line0, character: start }, end: { line: line0, character: start + current.length } }, text: option }];
    const previewLine = direction === "insert" ? line0 + 1 : line0;
    const startFrom = { file: mainUri, line: previewLine };
    workerGameMs = 0;
    workerGameIntervals = [];
    // The store counts the declarations' runs over its lifetime; a sample
    // reports the runs its own compile made.
    const runsBefore = compiler.chunkStore?.initializerRuns ?? 0;
    if (config.noFlowReuse) (compiler as any)._disableFlowReuseNextCompile = true;
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
    // The document's line count after the edit, and after a removal whether
    // it is the document as it was before the first sample.
    let edited: { lines: number; restored?: boolean } | undefined;
    if (direction) {
      const text = documentText() ?? "";
      edited = { lines: text.split(/\r?\n/).length };
      if (direction === "remove") restoredMatches = edited.restored = text === originalText;
    }
    // What each pass of the chunk store and of the program resolver visited
    // for this sample's compile.
    const store = compiler.chunkStore;
    const passes = { ...store?.passesLastBuild, initializerRuns: (store?.initializerRuns ?? 0) - runsBefore, fallback: compiler.lastProgramBuild?.unsupported?.construct ?? null };
    const resolver = compiler.programResolver?.passesLastResolve;
    // What the scoping of the user's defines walked and classified (#709).
    const defineScope = compiler.defineScopeStats ? { ...compiler.defineScopeStats } : undefined;
    const game = workerGame!;
    const before = residueOf(game);
    const checkpoint = searched?.checkpoint;
    let written: string | undefined;
    lastCheckpoint = () => (written ??= (checkpoint && workerGame?.checkpointJson(checkpoint)) || "");
    // Classified as the worker classifies it, before anything of the game
    // changes (#657).
    const speculative = config.mode === "preview";
    const offered = workerBeatOnly(standing, { game, fresh: false, speculative, checkpoint });
    const refused = offered === true ? game.beatOnlyRefusal(searched?.to) : offered;
    standing = undefined;
    const load = prepare(game, searched?.checkpoint);
    const shown = await display(game, refused === null, previewLine);
    standing = { game, speculative };
    const { sums: phases, intervals } = takeMeasures();
    if (i < config.warmup) continue;
    const gaps = uncovered([t0, t1], [...intervals, ...workerGameIntervals]);
    gapsBySample.push(gaps);
    windowsBySample.push([t0, t1]);
    residue = { calls: CALLS, beforeDisplay: before, afterDisplay: residueOf(game), outsideMessages: { ...sink.outside }, previewed: shown.previewed };
    lastStream = sink.stream;
    samples.push({
      option,
      ...(direction ? { direction, previewLine: previewLine + 1, ...edited } : {}),
      // How the display went: beat-only, or in full and why (#657).
      path: refused === null ? "beat" : `full: ${refused}`,
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
      passes,
      ...(resolver ? { resolver } : {}),
      ...(defineScope ? { defineScope } : {}),
    });
    if (i === config.warmup) heapAfterFirst = heapNow();
    else if ((i - config.warmup + 1) % 50 === 0) heapEvery50.push(heapNow());
  }
  if (structural) {
    // A run that ended on an insert takes it out again, untimed, so the
    // document the run leaves is the one it found.
    if ((config.warmup + config.samples) % 2 === 1) {
      version += 1;
      compiler.updateDocument({ textDocument: { uri: mainUri, version }, contentChanges: [structural.remove] } as any);
    }
    restoredMatches = documentText() === originalText;
  }
  const heapAtEnd = heapNow();
  const parsedProbe = config.heapProbe ? probeParsedObjects() : undefined;

  const withMessages = samples.filter((s) => s.messages);
  const last = samples.at(-1)?.messages;
  const report = {
    mode: config.mode,
    project: config.project,
    line: config.line,
    lineText,
    token,
    options,
    ...(structural ? { structural: { inserted: structural.inserted, linesBefore: (originalText ?? "").split("\n").length }, restoredMatches } : {}),
    warmup: config.warmup,
    samples: samples.length,
    routeSteps,
    firstCompile,
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1048576),
    // After full collections, when the launcher exposes them.
    heapAfterFirstSampleMB: heapAfterFirst,
    heapAfterLastSampleMB: heapAtEnd,
    heapEvery50SamplesMB: heapEvery50,
    noFlowReuse: Boolean(config.noFlowReuse),
    ...(parsedProbe ? { parsedProbe } : {}),
    // How many displays were beat-only, and why each other one was not (#657).
    paths: samples.reduce((counts: Record<string, number>, s) => ({ ...counts, [s.path]: (counts[s.path] ?? 0) + 1 }), {}),
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
  if (config.windows) writeWindows(config.windows, clockOriginUs, windowsBySample);
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  printReport(report);
  if (structural && !restoredMatches) throw new Error("the structural removals did not give the document back as it was");
}

function printReport(report: any) {
  const row = (label: string, s: { min: number; median: number; max: number }) =>
    `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  const s = report.structural;
  const out = [
    s
      ? `mode ${report.mode}, structural: line ${report.line} ${JSON.stringify(report.lineText)}, inserting ${JSON.stringify(s.inserted)} after it and removing it, alternately`
      : `mode ${report.mode}: line ${report.line} ${JSON.stringify(report.lineText)}, replacing ${report.token}`,
    `${report.samples} samples after ${report.warmup} warm-up; route ${report.routeSteps} steps; heap ${report.heapUsedMB} MB`,
    `first compile and route search, from the top: ${report.firstCompile.ms.toFixed(1)} ms (game/planRoute ${report.firstCompile.planRouteMs.toFixed(1)} ms)`,
    `heap after full collections: ${report.heapAfterFirstSampleMB} MB after the first sample, ${report.heapEvery50SamplesMB.map((mb: number) => `${mb} MB`).join(", ") || "-"} after every 50th, ${report.heapAfterLastSampleMB} MB after the last`,
    ...(report.noFlowReuse ? ["parsed-flow reuse refused on every compile (--no-flow-reuse)"] : []),
    ...(report.parsedProbe ? [`parsed objects alive after the last sample: ${report.parsedProbe.parsedObjects}`] : []),
    `display paths over the samples: ${Object.entries(report.paths ?? {}).map(([path, n]) => `${path} ${n}`).join(", ") || "-"}`,
    ...(s
      ? [
          // Each sample's edit, the document's line count after it, where it
          // previewed, how the display went and the worker's time.
          `structural samples (main.sd had ${s.linesBefore} lines):`,
          ...report.perSample.map(
            (p: any, i: number) =>
              `  ${String(i + 1).padStart(3)} ${p.direction.padEnd(6)} ${p.lines} lines, preview at line ${p.previewLine}, ${p.path}, worker ${p.wall["worker compile, game and route"].toFixed(1)} ms, total without the DOM ${p.wall["total without the DOM"].toFixed(1)} ms${p.restored === false ? ", NOT RESTORED" : ""}`,
          ),
          `restoredMatches: ${report.restoredMatches} (the compiler's document after the run against its text before the first sample; main.sd itself is never written)`,
        ]
      : []),
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
    // What each pass of the chunk store visited, per sample
    // (`ChunkStore.passesLastBuild`).
    out.push("", "  chunk store passes, per sample:", ...passes.map((p: any) => `    ${JSON.stringify(p)}`));
  }
  const resolves = report.perSample?.map((s: any) => s.resolver).filter(Boolean);
  if (resolves?.length) {
    // What the program path's resolver visited, per sample
    // (`ProgramResolver.passesLastResolve`, #1607).
    out.push("", "  resolver passes, per sample:", ...resolves.map((p: any) => `    ${JSON.stringify(p)}`));
  }
  const scopes = report.perSample?.map((s: any) => s.defineScope).filter(Boolean);
  if (scopes?.length) {
    // The chunks and objects the scoping of the user's defines walked, and
    // the declarations it classified (`SparkdownCompiler.defineScopeStats`).
    out.push("", "  define scoping, per sample:", ...scopes.map((p: any) => `    ${JSON.stringify(p)}`));
  }
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
