// A full route search to a line on each engine (#700): `Game.planRoute`, the
// `game/planRoute` phase of the player's worker, from the top of the scene the
// line stands in to the beat the line starts, on the current engine, whose
// steps are runtime paths, and on the program engine, whose steps are
// addresses.
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json }. A candidate is the engine: `engine`, the current engine, or
// `program`, the program engine with the compiler's `programChunks` on. Each
// sample resets the story and searches the whole scene again, as a compile
// that resumes nothing does; only the search is timed. Each reports the
// route's length in steps and whether the search found it, and engine-bench.mjs
// requires both candidates to find one.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { lastSearchStats } from "../../packages/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface RouteSearchBenchConfig {
  project: string;
  /** The line of main.sd the route ends at, counting from one. */
  line: number;
  candidate: "engine" | "program";
  samples: number;
  warmup: number;
  json?: string;
}

const config: RouteSearchBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

function main() {
  const realLog = silenceConsole();
  const programChunks = config.candidate === "program";
  const startFrom = { file: MAIN_URI, line: config.line - 1 };
  const compiler = new SparkdownCompiler();
  let story: any;
  compiler.addEventListener("compiler/didCompile", (params: any) => {
    story = params.story;
  });
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom, {
    emitCompiledProgram: false,
    programChunks,
  });
  const program: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any).program;
  if (programChunks && !program.chunks) {
    throw new Error(`the program falls back for ${JSON.stringify(program.fallback)}`);
  }
  const game = new Game({ program, story, ...benchSystem, programChunks } as any);
  game.setStartFrom(startFrom, "last");
  const to = game.startAddress;
  if (to == null) throw new Error(`line ${config.line} of main.sd has no address`);
  const from = game.routeStartOf(to);
  const times: number[] = [];
  let steps = 0;
  let stepsUsed = 0;
  let found = false;
  for (let i = 0; i < config.warmup + config.samples; i++) {
    // Each search starts from a story reset, as one that resumes nothing does.
    game.story.CancelAsyncContinue();
    game.story.ResetState();
    const t0 = performance.now();
    // As the player's worker searches (`searchRouteTo`): the replay that
    // follows replaces the state, so a search that finds the route leaves
    // the story where it stopped.
    const route = Game.planRoute(game.story, game.program, from, to, undefined, {
      callerResetsStory: true,
    });
    const ms = performance.now() - t0;
    if (i >= config.warmup) times.push(ms);
    found = route != null;
    steps = route?.steps.length ?? 0;
    stepsUsed = lastSearchStats.stepsUsed;
  }
  const report = {
    candidate: config.candidate,
    project: config.project,
    line: config.line,
    from,
    to,
    found,
    routeSteps: steps,
    stepsUsed,
    warmup: config.warmup,
    samples: times.length,
    searchMs: stats(times),
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(1).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: a full route search from the top of ${from} to main.sd line ${config.line} (${typeof to === "number" ? "address" : "path"} ${to}); ${report.samples} samples after ${report.warmup} warm-up`,
      `  ${found ? "found" : "found no route"}: ${steps} route steps, ${stepsUsed} story advances`,
      `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"game/planRoute (ms)".padEnd(28)} ${f(report.searchMs.min)} ${f(report.searchMs.median)} ${f(report.searchMs.max)}`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`route search bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
