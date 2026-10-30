import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { lastSearchStats } from "../../packages/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface RouteSearchBenchConfig {
  project: string;
  line: number;
  samples: number;
  warmup: number;
  json?: string;
}

const config: RouteSearchBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: config.line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom);
  const program: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any).program;
  if (!program.chunks) throw new Error("the project did not compile");
  const game = new Game({ program, ...benchSystem } as any);
  game.setStartFrom(startFrom, "last");
  const to = game.startAddress;
  if (to == null) throw new Error(`line ${config.line} of main.sd has no address`);
  const from = game.routeStartOf(to);
  const times: number[] = [];
  let steps = 0;
  let stepsUsed = 0;
  let found = false;
  for (let i = 0; i < config.warmup + config.samples; i++) {
    game.story.CancelAsyncContinue();
    game.story.ResetState();
    const t0 = performance.now();
    const route = Game.planRoute(game.story, game.program, from, to, {
      callerResetsStory: true,
    });
    const ms = performance.now() - t0;
    if (i >= config.warmup) times.push(ms);
    found = route != null;
    steps = route?.steps.length ?? 0;
    stepsUsed = lastSearchStats.stepsUsed;
  }
  const report = {
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
      `mode search: a full route search from the top of ${from} to main.sd line ${config.line} (address ${to}); ${report.samples} samples after ${report.warmup} warm-up`,
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
