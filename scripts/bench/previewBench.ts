// Worker-path benchmark for the Game Preview (#646, #647). Replays
// packages/spark-web-player/src/main/workers/workspace.worker.ts without a
// browser and times each phase of a highlighted suggestion (`preview`) or an
// accepted edit (`edit`) at one line of a project.
//
// A preview runs in one of two shapes. `transport` is the player as it is: the
// worker's program crosses to the page through the transport and a clone, and
// the page's own game loads the route's checkpoint and displays it. `resident`
// models a preview displayed from the worker's game (#676, #677): the compiler
// emits no compiled story, the game that searched the route loads its own
// checkpoint, connects to a sink and previews, and only the messages it emits
// are cloned, as they would be on their way to the page. `resident-emitting`
// is the resident shape with the compiled story still emitted: the compiler
// certifies an edit's changes as confined only when it serializes the story,
// and the route search resumes from its last route only when they are, so this
// shape is what the resident one costs once that certification no longer
// depends on emission.
//
// Run through preview-bench.mjs, which bundles this file with esbuild and runs
// one configuration per process; it passes the configuration as one JSON
// argument: { project, line, word, options, mode, shape, samples, warmup, json }.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import * as v8 from "node:v8";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { setRetainProfilerEntries } from "../../packages/sparkdown/src/compiler/utils/profile";
import { ProgramTransportDecoder, ProgramTransportEncoder } from "../../packages/sparkdown/src/workspace/utils/programTransport";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { assetItemKey } from "../../packages/spark-engine/src/game/modules/assets/types/AssetItem";
import { RouteSearchLog } from "../../packages/spark-web-player/src/main/workers/RouteSearchLog";
import { searchRouteTo } from "../../packages/spark-web-player/src/main/workers/searchRouteTo";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface BenchConfig {
  project: string;
  line: number;
  word: string;
  options: string[];
  mode: "preview" | "edit";
  shape: "transport" | "resident" | "resident-emitting";
  samples: number;
  warmup: number;
  json?: string;
}

const config: BenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/preview-bench.mjs");
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
// counted, and with `clone` it goes through v8.serialize and v8.deserialize
// first, as a postMessage to the page would; the answer to a request is cloned
// on its way back. Only messages sent while `open` are what a display sends;
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

  constructor(
    readonly clone: boolean,
    readonly forbiddenStrings: () => string[],
  ) {}

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
      const msg = this.clone ? v8.deserialize(wire) : sent;
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
        const received = this.clone ? v8.deserialize(back) : response;
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
  const encoder = new ProgramTransportEncoder();
  const decoder = new ProgramTransportDecoder();
  const system = benchSystem;

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

  const resident = config.shape !== "transport";
  if (resident && config.mode !== "preview") throw new Error("the resident shape models a preview only");
  const startFrom = { file: mainUri, line: line0 };
  configurePlayerCompiler(compiler, files, startFrom, config.shape === "resident" ? { emitCompiledProgram: false } : {});
  const cold = compiler.compile({ textDocument: { uri: mainUri }, startFrom } as any);

  // A preview's display, on whichever game shows it, in the order the page's
  // preview update runs it: declare the preview, drop the last preview's
  // images, load the route's checkpoint, connect, preview.
  let lastCheckpoint = "";
  const sink = new PageSink(resident, () => [lastCheckpoint]);
  //
  // What the route game carries that the page's game does not, and that the
  // resident shape has to reset before it displays: the route search leaves
  // `system.simulating` set until a preview clears it, which is after the
  // connect, and while it is set the modules restore as a simulation does
  // (the asset module prefetches nothing, the ui module writes instantly).
  const RESETS = ["system.simulating"];
  const prepare = (game: Game, checkpoint: string | undefined) => {
    game.markPreviewing(searched?.toPath);
    game.module.ui.forgetDisplayedImages();
    if (resident) (game as any)._context.system.simulating = undefined;
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
  // What the route search left on the game the resident shape displays from,
  // read before the display prepares it.
  const residueOf = (game: any) => ({
    state: game.state,
    simulation: game._simulation,
    "system.simulating": game._context.system.simulating ?? null,
    "system.previewing": game._context.system.previewing ?? null,
    incrementalCheckpoints: game._checkpoints?._incremental ?? game._checkpoints?.options?.incremental ?? null,
    previewedPath: game.previewedPath ?? null,
  });

  // The page: a second game that receives each program over the transport.
  let pageGame: Game | undefined;
  const updatePageGame = (program: any, checkpoint: string | undefined) => {
    const t0 = performance.now();
    if (!pageGame) pageGame = new Game({ program, ...system, startFrom, previewFrom: startFrom } as any);
    else pageGame.updateProgram(program);
    const t1 = performance.now();
    const load = prepare(pageGame, checkpoint);
    return { update: t1 - t0, load };
  };
  if (!resident) updatePageGame(decoder.decode(structuredClone(encoder.encode(cold.program))), (cold as any).checkpoint);
  takeMeasures();

  const samples: any[] = [];
  let version = 1;
  let current = token;
  let lastEncoded: any;
  let residue: any;
  let lastStream: string[] = [];
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
    if (resident) {
      const game = workerGame!;
      const before = residueOf(game);
      lastCheckpoint = searched?.checkpoint ?? "";
      const load = prepare(game, searched?.checkpoint);
      const shown = await display(game);
      const phases = takeMeasures();
      if (i < config.warmup) continue;
      residue = { resets: RESETS, beforeDisplay: before, afterDisplay: residueOf(game), outsideMessages: { ...sink.outside }, previewed: shown.previewed };
      lastStream = sink.stream;
      samples.push({
        option,
        wall: {
          "worker compile, game and route": t1 - t0,
          "(of which worker game.updateProgram)": workerGameMs,
          "worker game.load": load,
          "worker connect": shown.connect,
          "worker preview": shown.preview,
          "(of which message clone)": sink.cloneMs,
          "total without the DOM": t1 - t0 + load + sink.cloneMs,
        },
        phases,
        messages: sink.stats(),
      });
      continue;
    }
    const encoded = encoder.encode(result.program);
    const t2 = performance.now();
    const wire = v8.serialize({ ...result, program: encoded });
    const t3 = performance.now();
    const received = v8.deserialize(wire);
    const t4 = performance.now();
    const decoded = decoder.decode(received.program);
    const t5 = performance.now();
    const page = updatePageGame(decoded, received.checkpoint);
    // The page's connect and preview, which the resident shape moves into the
    // worker: timed apart from the total, and their messages kept to compare
    // with what the resident game sends.
    const shown = config.mode === "preview" ? await display(pageGame!) : undefined;
    const phases = takeMeasures();
    if (i < config.warmup) continue;
    lastEncoded = encoded;
    lastCheckpoint = received.checkpoint ?? "";
    lastStream = sink.stream;
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
        ...(shown ? { "page connect (not in total)": shown.connect, "page preview (not in total)": shown.preview } : {}),
      },
      phases,
      wireKB: wire.length / 1024,
      ...(shown ? { messages: sink.stats() } : {}),
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
  if (!resident) wireByKey["(checkpoint)"] = lastCheckpoint.length / 1024;

  const withMessages = samples.filter((s) => s.messages);
  const last = samples.at(-1)?.messages;
  const report = {
    mode: config.mode,
    shape: config.shape,
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
    wireKB: resident ? undefined : { total: stats(samples.map((s) => s.wireKB)), byKey: wireByKey },
    messages: withMessages.length
      ? {
          count: stats(withMessages.map((s) => s.messages.count)),
          outKB: stats(withMessages.map((s) => s.messages.outKB)),
          inKB: resident ? stats(withMessages.map((s) => s.messages.inKB)) : undefined,
          largest: last?.largest,
          kbByMethod: last?.kbByMethod,
          unanswered: last?.unanswered,
          forbidden: resident ? [...new Set(withMessages.flatMap((s) => s.messages.forbidden))] : undefined,
        }
      : undefined,
    residue,
    // The last sample's display, message by message, for the launcher to
    // compare between the shapes.
    displayStream: lastStream,
    perSample: samples,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  printReport(report);
}

function printReport(report: any) {
  const row = (label: string, s: { min: number; median: number; max: number }) =>
    `  ${label.padEnd(40)} ${s.min.toFixed(1).padStart(9)} ${s.median.toFixed(1).padStart(9)} ${s.max.toFixed(1).padStart(9)}`;
  const out = [
    `mode ${report.mode}, ${report.shape} shape: line ${report.line} ${JSON.stringify(report.lineText)}, replacing ${report.token}`,
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
  if (report.wireKB) {
    out.push(
      "",
      `  wire: ${report.wireKB.total.median.toFixed(0)} KB per sample; by top-level program key (KB):`,
      ...Object.entries(report.wireKB.byKey)
        .sort((a: any, b: any) => b[1] - a[1])
        .filter(([, kb]: any) => kb >= 1)
        .map(([k, kb]: any) => `    ${k.padEnd(38)} ${kb.toFixed(0).padStart(9)}`),
    );
  }
  const m = report.messages;
  if (m) {
    out.push(
      "",
      `  ${(report.shape !== "transport" ? "display messages (cloned)" : "display messages (in-process)").padEnd(40)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
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
      `  reset before each display: ${r.resets.join(", ")}`,
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
