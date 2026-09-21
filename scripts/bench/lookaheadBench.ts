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
//                 it, sized as the project's story is: as many globals, a count
//                 for each symbol of a kind that counts, a call frame with as
//                 many temporaries as the story's frame holds at that line, and
//                 a finished line in the output. The stepper has no call frame,
//                 which is why this state is a class of its own here
//   chunk-write   the same pair with one global assigned and one count raised
//                 between the two
//
// The route simulator is detached while the engine's pairs are timed, so that
// its own snapshot is no part of the figure.
//
// Before anything is timed, each side is shown to restore: the engine takes
// back a global written after its snapshot, and the restorable state takes back
// a write to every kind of state it holds, which includes what a continue has
// raised (its errors and warnings) and a table's entries, metatable and frozen
// flag.
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
  // What a continue has raised so far. A look-ahead that is taken back takes
  // these back too, as the engine's snapshot does.
  errors: string[] = [];
  warnings: string[] = [];
  // A table is its entries and also what it is: its metatable and whether it
  // is frozen. All three go through the one barrier.
  readonly table = { entries: new Map<string, unknown>([["a", 1]]), metatable: null as object | null, frozen: false };
  private saved = false;
  private savedFrames: RestorableState["frames"] = [];
  private savedBlockStack: number[] = [];
  private savedEvalStack: unknown[] = [];
  private savedOutput: unknown[] = [];
  private savedChoices = 0;
  private savedTurnIndex = 0;
  private savedErrors = 0;
  private savedWarnings = 0;
  private undoNames: string[] = [];
  private undoValues: unknown[] = [];
  private undoCounts: number[] = [];
  // What was written to the table: an entry's key, or one of the two fields,
  // with the value it had.
  private undoTable: [what: "entry" | "metatable" | "frozen", key: string, old: unknown][] = [];

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
    this.savedErrors = this.errors.length;
    this.savedWarnings = this.warnings.length;
  }

  setEntry(key: string, value: unknown) {
    if (this.saved) this.undoTable.push(["entry", key, this.table.entries.get(key)]);
    this.table.entries.set(key, value);
  }

  setMetatable(metatable: object | null) {
    if (this.saved) this.undoTable.push(["metatable", "", this.table.metatable]);
    this.table.metatable = metatable;
  }

  freeze() {
    if (this.saved) this.undoTable.push(["frozen", "", this.table.frozen]);
    this.table.frozen = true;
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
    this.errors.length = this.savedErrors;
    this.warnings.length = this.savedWarnings;
    const { undoTable, table } = this;
    for (let i = undoTable.length - 1; i >= 0; i--) {
      const [what, key, old] = undoTable[i]!;
      if (what === "metatable") table.metatable = old as object | null;
      else if (what === "frozen") table.frozen = old as boolean;
      else if (old === undefined) table.entries.delete(key);
      else table.entries.set(key, old);
    }
    this.saved = false;
    undoNames.length = undoValues.length = undoCounts.length = undoTable.length = 0;
  }
}

// A save point has to give back every kind of state it covers, or the figure
// below prices something else. Each kind is written after a save, shown to have
// changed, and shown to be as it was after the restore.
function probeRestorable(state: RestorableState) {
  const picture = (): Record<string, string> => ({
    globals: JSON.stringify([...state.globals]),
    counts: JSON.stringify([[...state.visits], [...state.turns]]),
    frames: JSON.stringify(state.frames.map((frame) => ({ ...frame, temporaries: [...frame.temporaries] }))),
    blockStack: JSON.stringify(state.blockStack),
    evalStack: JSON.stringify(state.evalStack),
    output: JSON.stringify(state.output.map((entry) => (entry instanceof Map ? [...entry] : entry))),
    choices: JSON.stringify(state.choices),
    turnIndex: JSON.stringify(state.turnIndex),
    errors: JSON.stringify(state.errors),
    warnings: JSON.stringify(state.warnings),
    tableEntries: JSON.stringify([...state.table.entries]),
    tableMetatable: JSON.stringify(state.table.metatable),
    tableFrozen: JSON.stringify(state.table.frozen),
  });
  const before = picture();
  state.save();
  state.errors.push("an error raised during the look-ahead");
  state.warnings.push("a warning raised during the look-ahead");
  state.setEntry("a", "written");
  state.setEntry(PROBE, 1);
  state.setMetatable({ __index: "written" });
  state.freeze();
  state.setGlobal("global_0", "written");
  state.setGlobal(PROBE, 1);
  state.turnIndex++;
  state.count(0);
  state.frames[0]!.pc += 2;
  state.frames[0]!.temporaries.set(PROBE, 1);
  state.frames.push({ kind: 1, seq: 1, index: 0, pc: 3, temporaries: new Map() });
  state.blockStack.push(1, 2, 3);
  state.evalStack.push(1);
  state.output.push("written");
  state.choices.push("a choice");
  const written = picture();
  const unchanged = Object.keys(before).filter((kind) => written[kind] === before[kind]);
  if (unchanged.length) throw new Error(`the probe did not write: ${unchanged.join(", ")}`);
  state.restore();
  const after = picture();
  const lost = Object.keys(before).filter((kind) => after[kind] !== before[kind]);
  if (lost.length) throw new Error(`a restore did not give back: ${lost.join(", ")}`);
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
    let probed = false;
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
        if (!probed) {
          // Untimed, once: the write lands in the snapshot's patch, and the
          // restore takes it back.
          story.StateSnapshot();
          story.state.variablesState.SetGlobal(PROBE, probe);
          const landed = story.state.variablesState.GetRawVariableWithName(PROBE, 0) === probe;
          story.RestoreStateSnapshot();
          if (!landed || story.state.variablesState.GetRawVariableWithName(PROBE, 0) != null) throw new Error("the engine's snapshot did not take back a global written after it");
          probed = true;
        }
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
    const counts = Math.max(shape.countedSymbols, 1);
    const state = new RestorableState(shape.globals, counts, temporaries);
    probeRestorable(state);
    const pairs = 200_000;
    for (let i = 0; i < config.warmup + config.samples; i++) {
      const t0 = performance.now();
      for (let k = 0; k < pairs; k++) {
        state.save();
        if (writes) {
          state.setGlobal("global_0", k);
          state.count(k % counts);
        }
        state.restore();
      }
      const t1 = performance.now();
      if (i >= config.warmup) perPair.push(((t1 - t0) * 1000) / pairs);
    }
    // The timed pairs left the state as the probe left it, which is as it was
    // built.
    if ((shape.globals > 0 && state.globals.get("global_0") !== 0) || state.visits.some((visits) => visits !== 0)) throw new Error("the timed pairs left a write behind");
    sized = `state of ${shape.globals} globals, ${counts} counts and a frame of ${temporaries} temporaries`;
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
