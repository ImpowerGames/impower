// Measurements of the story engine for #664: what a step on a preview route is
// made of, and what it costs, stepping only.
//
// Run through engine-bench.mjs, which bundles this file with esbuild and runs
// one mode per process; it passes the configuration as one JSON argument:
// { project, line, mode, samples, warmup, json }.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { buildRouteSimulator, type RoutePlan } from "../../packages/sparkdown/src/compiler/utils/planRoute";
import { Container } from "../../packages/sparkdown/src/inkjs/engine/Container";
import { ControlCommand } from "../../packages/sparkdown/src/inkjs/engine/ControlCommand";
import { Divert } from "../../packages/sparkdown/src/inkjs/engine/Divert";
import { NativeFunctionCall } from "../../packages/sparkdown/src/inkjs/engine/NativeFunctionCall";
import { PushPopType } from "../../packages/sparkdown/src/inkjs/engine/PushPop";
import type { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { StringValue } from "../../packages/sparkdown/src/inkjs/engine/Value";
import { VariableAssignment } from "../../packages/sparkdown/src/inkjs/engine/VariableAssignment";
import { VariableReference } from "../../packages/sparkdown/src/inkjs/engine/VariableReference";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface EngineBenchConfig {
  project: string;
  line: number;
  mode: "kinds" | "step";
  // `step` only. `as-planner` sets the story's observers as the route planner
  // does, which means onExecute cleared; `hooked` leaves onExecute a function
  // that does nothing, which is what a story with any execution hook pays,
  // because the engine builds the path string of every step to pass to it.
  candidate?: "as-planner" | "hooked";
  samples: number;
  warmup: number;
  json?: string;
}

const config: EngineBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const NOOP = () => {};

// The kind of content a step executes, named for the report. Everything the
// engine can step onto lands in some kind: an unrecognized object is reported
// under its class name instead of being dropped.
function kindOf(obj: any): string {
  if (obj == null) return "(end of container)";
  if (obj instanceof StringValue) return obj.isNewline ? "text: newline" : "text";
  if (obj instanceof ControlCommand) return "command: " + ControlCommand.CommandType[obj.commandType];
  if (obj instanceof Divert) {
    if (obj.isExternal) return "divert: external call";
    if (obj.pushesToStack) return obj.stackPushType === PushPopType.Function ? "divert: function call" : "divert: tunnel";
    if (obj.hasVariableTarget) return "divert: variable target";
    return obj.isConditional ? "divert: conditional" : "divert";
  }
  if (obj instanceof VariableAssignment) return (obj.isGlobal ? "assign: global" : "assign: temporary") + (obj.isNewDeclaration ? " (declare)" : "");
  if (obj instanceof VariableReference) return obj.pathForCount ? "read: visit count" : "read: variable";
  if (obj instanceof NativeFunctionCall) return "native call";
  if (obj instanceof Container) return "(empty container)";
  const name: string = obj.constructor?.name ?? typeof obj;
  return /Value$/.test(name) ? "value: " + name.replace(/^_+/, "") : name.replace(/^_+/, "");
}

// The object the next Step executes: the pointer's content, entered to its
// first leaf the way Step enters containers.
function nextContent(story: Story): any {
  let obj: any = story.state.currentPointer.Resolve();
  while (obj instanceof Container && obj.content.length > 0) obj = obj.content[0];
  return obj;
}

interface Walk {
  game: Game;
  story: Story;
  route: RoutePlan;
  toPath: string;
}

function prepare(): Walk {
  const files = loadProjectFiles(config.project);
  const startFrom = { file: MAIN_URI, line: config.line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, files, startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  // The engine as the page holds it: constructed from the compiled program.
  const game = new Game({ program: cold.program, ...benchSystem } as any);
  game.setStartFrom(startFrom);
  const toPath = game.startPath;
  if (!toPath) throw new Error(`line ${config.line} of main.sd maps to no story path`);
  const story = game.story as Story;
  const route = Game.planRoute(story, game.program, Game.getSimulateFromPath(toPath), toPath);
  if (!route) throw new Error(`no route to ${toPath}`);
  // The game's observers are bookkeeping of its own, as are the planner's.
  story.onError = NOOP as any;
  story.onExecute = config.candidate === "hooked" ? (NOOP as any) : null;
  story.onMakeChoice = NOOP as any;
  story.onEvaluateCondition = NOOP as any;
  story.onSaveStateSnapshot = NOOP as any;
  story.onRestoreStateSnapshot = NOOP as any;
  story.onDiscardStateSnapshot = NOOP as any;
  story.onDidContinue = null;
  return { game, story, route, toPath };
}

// Puts the story at the top of the route with the route's decisions forced,
// which is where the planner's search starts and what makes a replay follow it.
function rewind({ story, route }: Walk) {
  story.CancelAsyncContinue();
  story.ResetState();
  story.ChoosePathString(route.fromPath);
  story.simulator = buildRouteSimulator(route.decisions);
  story.pauseBeforeEvaluatingConditions = false;
}

// One engine step per call: ContinueAsync takes no limit and returns after a
// single ContinueSingleStep, which is how the route planner drives it.
function countSteps(walk: Walk): number {
  rewind(walk);
  const { story, toPath } = walk;
  let steps = 0;
  while (story.state.previousPointer.path?.toString() !== toPath) {
    if (!story.canContinue) throw new Error(`the replay stopped after ${steps} steps without reaching ${toPath}`);
    story.ContinueAsync();
    steps++;
  }
  return steps;
}

function main() {
  const realLog = silenceConsole();
  const walk = prepare();
  const steps = countSteps(walk);
  const { story } = walk;
  const report: any = { mode: config.mode, candidate: config.candidate, project: config.project, line: config.line, toPath: walk.toPath, routeSteps: walk.route.steps.length, engineSteps: steps, warmup: config.warmup, samples: config.samples };

  if (config.mode === "step") {
    // Stepping only: no path is read, nothing is recorded per step.
    const totals: number[] = [];
    for (let i = 0; i < config.warmup + config.samples; i++) {
      rewind(walk);
      const t0 = performance.now();
      for (let s = 0; s < steps; s++) story.ContinueAsync();
      const t1 = performance.now();
      if (i >= config.warmup) totals.push(t1 - t0);
    }
    report.totalMs = stats(totals);
    report.microsecondsPerStep = stats(totals.map((t) => (t * 1000) / steps));
  } else {
    // Each step is timed on its own and charged to the kind it executed. The
    // two clock reads are inside the figure, so the shares are what to read;
    // the absolute time per step comes from `step` mode.
    const count = new Map<string, number>();
    const perSample: Map<string, number>[] = [];
    for (let i = 0; i < config.warmup + config.samples; i++) {
      rewind(walk);
      const time = new Map<string, number>();
      for (let s = 0; s < steps; s++) {
        const kind = kindOf(nextContent(story));
        const t0 = performance.now();
        story.ContinueAsync();
        const dt = performance.now() - t0;
        time.set(kind, (time.get(kind) ?? 0) + dt);
        if (i === 0) count.set(kind, (count.get(kind) ?? 0) + 1);
      }
      if (i >= config.warmup) perSample.push(time);
    }
    const sampleTotals = perSample.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
    report.kinds = [...count.entries()]
      .map(([kind, n]) => {
        const ms = stats(perSample.map((m) => m.get(kind) ?? 0));
        const share = stats(perSample.map((m, i) => (m.get(kind) ?? 0) / sampleTotals[i]!));
        return { kind, steps: n, stepShare: n / steps, ms, timeShare: share, microsecondsPerStep: (ms.median * 1000) / n };
      })
      .sort((a, b) => b.steps - a.steps);
  }
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  print(report, realLog);
}

function print(report: any, log: (text: string) => void) {
  const out = [`mode ${report.mode}${report.candidate ? " " + report.candidate : ""}: ${report.project} line ${report.line}, target ${report.toPath}`, `${report.engineSteps} engine steps (${report.routeSteps} route steps); ${report.samples} samples after ${report.warmup} warm-up`, ""];
  const f = (n: number, d = 1) => n.toFixed(d).padStart(9);
  if (report.mode === "step") {
    out.push(`  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`);
    out.push(`  ${"route, stepping only (ms)".padEnd(28)} ${f(report.totalMs.min)} ${f(report.totalMs.median)} ${f(report.totalMs.max)}`);
    out.push(`  ${"per step (microseconds)".padEnd(28)} ${f(report.microsecondsPerStep.min, 2)} ${f(report.microsecondsPerStep.median, 2)} ${f(report.microsecondsPerStep.max, 2)}`);
  } else {
    out.push(`  ${"kind".padEnd(34)} ${"steps".padStart(7)} ${"% steps".padStart(8)} ${"% time".padStart(8)} ${"(min".padStart(7)} ${"max)".padStart(7)} ${"us/step".padStart(8)}`);
    for (const k of report.kinds) {
      out.push(`  ${k.kind.padEnd(34)} ${String(k.steps).padStart(7)} ${(k.stepShare * 100).toFixed(1).padStart(8)} ${(k.timeShare.median * 100).toFixed(1).padStart(8)} ${(k.timeShare.min * 100).toFixed(1).padStart(7)} ${(k.timeShare.max * 100).toFixed(1).padStart(7)} ${k.microsecondsPerStep.toFixed(2).padStart(8)}`);
    }
  }
  log(out.join("\n"));
}

// The game leaves timers behind, so the process exits on its own terms.
try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`engine bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
