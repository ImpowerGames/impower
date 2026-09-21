// What the look-ahead past a line's newline costs to open and to take back:
// the story engine's state snapshot against restorable state (#693).
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json }.
//
//   engine        the shipped Story replays the route to the line, and at the
//                 end of every line on it a pair of StateSnapshot and
//                 RestoreStateSnapshot is timed, which is what the look-ahead
//                 pays when the next line turns out to be a new one
//   engine-write  the same pair with one global assigned between the two, so
//                 the restore has something to take back
//   chunk         a save and a restore of state held as chunkStepper.ts holds
//                 it, sized as the project's story is: as many globals, as many
//                 counts as the program would intern symbols, a call frame with
//                 as many temporaries as the story's frame holds at that line,
//                 and a finished line in the output
//   chunk-write   the same pair with one global assigned and one count raised
//                 between the two
//
// The route simulator is detached while the engine's pairs are timed, so that
// its own snapshot is no part of the figure.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { IntValue } from "../../packages/sparkdown/src/inkjs/engine/Value";
import { silenceConsole, stats } from "./benchProject";
import { prepareWalk, rewindWalk } from "./benchRoute";
import { measureProjectShape } from "./projectShape";

interface LookaheadBenchConfig {
  project: string;
  line: number;
  candidate: "engine" | "engine-write" | "chunk" | "chunk-write";
  samples: number;
  warmup: number;
  json?: string;
}

const config: LookaheadBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const PAIRS_PER_LINE = 20;
const PROBE = "__lookahead_probe";

// State as the chunk prototype holds it, with nothing to execute: the parts a
// save point copies, and the parts that keep an undo log while one is open.
class RestorableState {
  readonly globals = new Map<string, unknown>();
  readonly visits: Uint32Array;
  readonly turns: Int32Array;
  frames: { kind: number; seq: number; index: number; pc: number; temporaries: Map<string, unknown> }[] = [];
  blockStack: number[] = [0, 12, 40];
  evalStack: unknown[] = [];
  output: unknown[] = [new Map([["text", "A line."]]), "\n"];
  choices: unknown[] = [];
  turnIndex = 0;
  private saved = false;
  private savedFrames: RestorableState["frames"] = [];
  private savedBlockStack: number[] = [];
  private savedEvalStack: unknown[] = [];
  private savedOutput: unknown[] = [];
  private savedChoices = 0;
  private savedTurnIndex = 0;
  private undoNames: string[] = [];
  private undoValues: unknown[] = [];
  private undoCounts: number[] = [];

  constructor(globals: number, symbols: number, temporaries: number) {
    for (let i = 0; i < globals; i++) this.globals.set(`global_${i}`, i);
    this.visits = new Uint32Array(symbols);
    this.turns = new Int32Array(symbols).fill(-1);
    const frame = { kind: 0, seq: 0, index: 12, pc: 40, temporaries: new Map<string, unknown>() };
    for (let i = 0; i < temporaries; i++) frame.temporaries.set(`temp_${i}`, i);
    this.frames.push(frame);
  }

  save() {
    this.saved = true;
    // A frame's temporaries are copied whole, which a real engine would put off
    // until the first write to them.
    this.savedFrames = this.frames.map((frame) => ({ ...frame, temporaries: new Map(frame.temporaries) }));
    this.savedBlockStack = this.blockStack.slice();
    this.savedEvalStack = this.evalStack.slice();
    this.savedOutput = this.output.slice();
    this.savedChoices = this.choices.length;
    this.savedTurnIndex = this.turnIndex;
  }

  setGlobal(name: string, value: unknown) {
    if (this.saved) {
      this.undoNames.push(name);
      this.undoValues.push(this.globals.get(name));
    }
    this.globals.set(name, value);
  }

  count(symbol: number) {
    if (this.saved) this.undoCounts.push(symbol, this.visits[symbol]!, this.turns[symbol]!);
    this.visits[symbol]!++;
    this.turns[symbol] = this.turnIndex;
  }

  restore() {
    const { undoNames, undoValues, undoCounts } = this;
    for (let i = undoNames.length - 1; i >= 0; i--) {
      if (undoValues[i] === undefined) this.globals.delete(undoNames[i]!);
      else this.globals.set(undoNames[i]!, undoValues[i]);
    }
    for (let i = undoCounts.length - 3; i >= 0; i -= 3) {
      this.visits[undoCounts[i]!] = undoCounts[i + 1]!;
      this.turns[undoCounts[i]!] = undoCounts[i + 2]!;
    }
    this.frames = this.savedFrames;
    this.blockStack = this.savedBlockStack;
    this.evalStack = this.savedEvalStack;
    this.output = this.savedOutput;
    this.choices.length = this.savedChoices;
    this.turnIndex = this.savedTurnIndex;
    this.saved = false;
    undoNames.length = undoValues.length = undoCounts.length = 0;
  }
}

function main() {
  const realLog = silenceConsole();
  const writes = config.candidate.endsWith("-write");
  const perPair: number[] = [];
  let lines = 0;
  let sized = "";

  if (config.candidate.startsWith("engine")) {
    const walk = prepareWalk(config.project, config.line);
    const { story, toPath } = walk;
    const probe = new IntValue(1);
    for (let i = 0; i < config.warmup + config.samples; i++) {
      rewindWalk(walk);
      let elapsed = 0;
      lines = 0;
      while (story.state.previousPointer.path?.toString() !== toPath) {
        if (!story.canContinue) throw new Error(`the replay stopped without reaching ${toPath}`);
        story.ContinueAsync();
        if (!story.asyncContinueComplete) continue;
        const simulator = story.simulator;
        story.simulator = undefined as any;
        const t0 = performance.now();
        for (let k = 0; k < PAIRS_PER_LINE; k++) {
          story.StateSnapshot();
          if (writes) story.state.variablesState.SetGlobal(PROBE, probe);
          story.RestoreStateSnapshot();
        }
        elapsed += performance.now() - t0;
        story.simulator = simulator;
        lines++;
      }
      if (i >= config.warmup) perPair.push((elapsed * 1000) / (lines * PAIRS_PER_LINE));
    }
    sized = `at the end of each of the ${lines} lines on the route to ${toPath}`;
  } else {
    const { shape } = measureProjectShape(config.project, config.line);
    const walk = prepareWalk(config.project, config.line);
    rewindWalk(walk);
    // The frame's temporaries where the route ends, which is the deepest the
    // scene's own locals get.
    while (walk.story.state.previousPointer.path?.toString() !== walk.toPath && walk.story.canContinue) walk.story.ContinueAsync();
    const temporaries = walk.story.state.callStack.currentElement?.temporaryVariables.size ?? 0;
    const state = new RestorableState(shape.globals, shape.symbols, temporaries);
    lines = walk.route.steps.length;
    const pairs = 200_000;
    for (let i = 0; i < config.warmup + config.samples; i++) {
      const t0 = performance.now();
      for (let k = 0; k < pairs; k++) {
        state.save();
        if (writes) {
          state.setGlobal("global_0", k);
          state.count(k % shape.symbols);
        }
        state.restore();
      }
      const t1 = performance.now();
      if (i >= config.warmup) perPair.push(((t1 - t0) * 1000) / pairs);
    }
    sized = `state of ${shape.globals} globals, ${shape.symbols} counts and a frame of ${temporaries} temporaries`;
  }

  const report = { candidate: config.candidate, project: config.project, line: config.line, warmup: config.warmup, samples: perPair.length, sized, microsecondsPerPair: stats(perPair) };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(3).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: ${sized}; ${report.samples} samples after ${report.warmup} warm-up`,
      `  ${"".padEnd(34)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"save and restore (microseconds)".padEnd(34)} ${f(report.microsecondsPerPair.min)} ${f(report.microsecondsPerPair.median)} ${f(report.microsecondsPerPair.max)}`,
    ].join("\n"),
  );
}

// The game leaves timers behind, so the process exits on its own terms.
try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`look-ahead bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
