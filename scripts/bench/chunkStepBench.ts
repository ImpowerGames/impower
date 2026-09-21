// The chunk prototype against the story engine on one script (#693).
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, candidate, samples, warmup,
// json }. A candidate is an engine (`engine`, the shipped Story, or `chunk`,
// chunkStepper.ts over the layout of chunkProgram.ts) and how it is driven
// (`step`, one call per step as the route planner drives a story, or `line`,
// one call per line as a game does). Every candidate runs the script from the
// top of scene MAIN until nothing is left, taking the first choice whenever the
// story stops at one, timed from the first step. Each reports a digest of every
// line's text, tags and display tables and of every list of choices it was
// offered; engine-bench.mjs fails the run unless the digests are equal. The two
// engines take different numbers of steps by design, so each reports its own.
//
// Before anything is timed, a chunk candidate also runs the design document's
// worked example (`editProbe`): statements inserted into the long `then` clause
// on both sides of an `if`, as a compile would insert them, and the story
// resumed from inside that `if` through the new root.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { InkObject } from "../../packages/sparkdown/src/inkjs/engine/Object";
import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { B_SEQUENCE, BLOCK_ROW, H_BLOCKS, H_CODE_WORDS, H_ID, HEADER, Op, PLAIN_LINES, copyChunk, documentOrder, insertChunk, layoutFromScratch, lineOf, position, writeChunkProgram, type ProgramRoot } from "./chunkProgram";
import { ChunkStepper } from "./chunkStepper";

interface ChunkBenchConfig {
  project: string;
  candidate: "engine-step" | "engine-line" | "chunk-step" | "chunk-line";
  samples: number;
  warmup: number;
  json?: string;
}

const config: ChunkBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const SCENE = "MAIN";
const NOOP = () => {};

// What a run hands over, as plain data, the same from either engine: a line is
// its text, tags and display tables, and a stop at choices is their texts.
type Entry = [text: string, tags: string[], display: [string, unknown][][]] | ["choices", string[]];

interface Run {
  steps: number;
  entries: Entry[];
  beats: number;
}

const plainTables = (tables: any[]): [string, unknown][][] => tables.map((table) => [...table.value].map(([key, v]: [string, any]) => [key, v.value]));

function engineCandidate(compiled: Record<string, any>, perStep: boolean) {
  const story = new Story(compiled);
  story.onError = NOOP as any;
  const take = (): Entry => [story.currentText ?? "", story.currentTags ?? [], plainTables(story.state.currentDisplayInstructions)];
  return {
    story,
    // Untimed: ResetState runs the program's global initializers, which is
    // engine stepping of its own and no part of the script.
    prepare() {
      story.ResetState();
      story.ChoosePathString(SCENE);
    },
    run(): Run {
      const entries: Entry[] = [];
      let steps = 0;
      for (;;) {
        if (perStep) {
          while (story.canContinue) {
            story.ContinueAsync();
            steps++;
            if (story.asyncContinueComplete) entries.push(take());
          }
        } else {
          while (story.canContinue) {
            story.Continue();
            entries.push(take());
          }
        }
        if (story.currentChoices.length === 0) break;
        entries.push(["choices", story.currentChoices.map((choice) => choice.text)]);
        story.ChooseChoiceIndex(0);
      }
      return { steps, entries, beats: 0 };
    },
  };
}

function chunkCandidate(compiled: Record<string, any>, perStep: boolean, globals: Map<string, InkObject>) {
  const root = writeChunkProgram(compiled);
  const stepper = new ChunkStepper(root);
  return {
    root,
    stepper,
    prepare() {
      stepper.start(SCENE, globals);
    },
    run(): Run {
      const entries: Entry[] = [];
      const take = () => {
        const line = stepper.takeLine();
        entries.push([line.text, line.tags, plainTables(line.display)]);
      };
      for (;;) {
        if (perStep) {
          while (stepper.canContinue) if (stepper.step()) take();
        } else {
          while (stepper.canContinue) {
            const line = stepper.continueLine();
            entries.push([line.text, line.tags, plainTables(line.display)]);
          }
        }
        if (stepper.choices.length === 0) break;
        entries.push(["choices", stepper.choices.map((choice) => choice.text)]);
        stepper.choose(0);
      }
      // Every look-ahead that was opened was taken back or let stand.
      if (stepper.saves !== stepper.restores + stepper.forgets) throw new Error(`${stepper.saves} look-aheads were opened and ${stepper.restores + stepper.forgets} closed`);
      return { steps: stepper.steps, entries, beats: stepper.saves };
    },
  };
}

// A run to the end, one call per line, taking the first choice. `onLine` sees
// the stepper where each line left it.
function linesOf(stepper: ChunkStepper, onLine?: (lines: number) => void): string[] {
  const lines: string[] = [];
  for (;;) {
    while (stepper.canContinue) {
      const line = stepper.continueLine();
      lines.push(JSON.stringify([line.text, line.tags, plainTables(line.display)]));
      onLine?.(lines.length);
    }
    if (stepper.choices.length === 0) return lines;
    stepper.choose(0);
  }
}

// What an edit is allowed to have rebuilt, checked against what it did rebuild:
// the chunks of the edited sequence alone, and line starts only in the edited
// sequence and in a sequence that encloses it and holds statements below the
// owner. Every chunk of `before` is still held, and `before` is as it was.
function checkSharing(before: ProgramRoot, after: ProgramRoot, edited: number, inserted: number) {
  const mayShift = new Set([edited]);
  for (let body = before.sequences[edited]!; body.owner >= 0; ) {
    const owner = position(before, body.owner)!;
    if (owner.entry + 1 < owner.sequence.chunks.length) mayShift.add(owner.sequence.id);
    body = owner.sequence;
  }
  for (const row of after.sequences) {
    const was = before.sequences[row.id]!;
    if ((row.chunks !== was.chunks) !== (row.id === edited)) throw new Error(`sequence ${row.id} ${row.id === edited ? "kept" : "lost"} its chunks array`);
    if ((row.lineStarts !== was.lineStarts) !== mayShift.has(row.id)) throw new Error(`sequence ${row.id} ${mayShift.has(row.id) ? "kept" : "lost"} its line starts`);
  }
  const held = new Set(after.sequences.flatMap((row) => row.chunks));
  const shared = before.sequences.flatMap((row) => row.chunks).filter((chunk) => held.has(chunk)).length;
  if (shared !== before.chunkCount || held.size !== before.chunkCount + inserted) throw new Error(`the edit shares ${shared} of ${before.chunkCount} chunks and holds ${held.size}`);
}

// Every statement of `before` starts, in `after`, as many lines further down as
// inserted statements now stand above it, and the lines `after` holds are the
// ones a layout from nothing but its chunks gives.
function checkLines(before: ProgramRoot, after: ProgramRoot, inserted: Set<number>) {
  let above = 0;
  for (const id of documentOrder(after)) {
    if (inserted.has(id)) above += PLAIN_LINES;
    else if (lineOf(after, id) !== lineOf(before, id) + above) throw new Error(`statement ${id} starts on line ${lineOf(after, id)}, not ${lineOf(before, id)} and the ${above} inserted above it`);
  }
  const scratch = layoutFromScratch(after);
  for (const row of after.sequences) {
    const fresh = scratch.get(row.id)!;
    if (fresh.lines !== row.lines || fresh.firstLine !== row.firstLine || fresh.lineStarts.length !== row.lineStarts.length || fresh.lineStarts.some((line, i) => line !== row.lineStarts[i])) throw new Error(`sequence ${row.id} holds lines that a layout from scratch does not give`);
  }
}

// The worked example of docs/engine/binary-program.md, run. A display statement
// is inserted into the scene's long `then` clause just below an `if` whose body
// runs, and another just above it, each as a compile would: a new root that
// holds new arrays for the clause under the clause's own id and shares the
// rest. Four things are then shown. The new root shares every other array and
// every chunk with the previous root, which is as it was. The new root's run
// is the previous run with the two lines added. A story resumed from inside
// the `if`, whose row neither edit touched, runs on into the clause the new
// root holds, the line inserted below the `if` included: the block finds its
// owner through the root it is reached from. And every statement's line is
// right after each edit, one made inside the first branch of an `if` that has
// an `else` among them: the `else` branch keeps its row and both its arrays,
// and its lines still move, because a body's first line is worked out from
// its owner and the bodies above it.
function editProbe(root: ProgramRoot, globals: Map<string, InkObject>): string {
  const clause = root.sequences.filter((row) => row.owner >= 0).sort((a, b) => b.chunks.length - a.chunks.length)[0];
  if (!clause) throw new Error("the scene holds no block to edit");
  const clauseLength = clause.chunks.length;
  const inClause = (sequence: number) => clause.ids.includes(root.sequences[sequence]!.owner);

  const first = new ChunkStepper(root);
  first.start(SCENE, globals);
  let body = -1;
  const before = linesOf(first, () => {
    const at = first.cursor;
    if (body < 0 && at && inClause(at.sequence)) body = at.sequence;
  });
  if (body < 0) throw new Error("no line of the run ended inside a block of the then clause");
  const entry = clause.ids.indexOf(root.sequences[body]!.owner);
  const display = clause.chunks.find((chunk) => chunk[H_BLOCKS] === 0 && (chunk[HEADER]! & 0xff) === Op.LineStart);
  if (!display) throw new Error("the then clause holds no display statement to copy");

  // Below the `if` first, so that `entry` still names the `if` when the
  // statement above it goes in.
  const below = copyChunk(root, display);
  const lower = insertChunk(root, clause.id, entry + 1, below);
  const above = copyChunk(lower, display);
  const edited = insertChunk(lower, clause.id, entry, above);
  checkSharing(root, lower, clause.id, 1);
  checkSharing(lower, edited, clause.id, 1);
  checkLines(root, edited, new Set([below[H_ID]!, above[H_ID]!]));
  const sharedArrays = edited.sequences.filter((row, id) => row.chunks === root.sequences[id]!.chunks).length;
  if (root.sequences[clause.id] !== clause || clause.chunks.length !== clauseLength || clause.ids.length !== clauseLength || clause.lineStarts.length !== clauseLength) throw new Error("the edit changed the previous root");

  // An `if` of the clause with an `else`, and a statement inserted at the top
  // of its first branch.
  const table = (chunk: Int32Array) => HEADER + chunk[H_CODE_WORDS]!;
  const forked = clause.chunks.find((chunk) => chunk[H_BLOCKS] === 2 && [0, 1].every((k) => root.sequences[chunk[table(chunk) + k * BLOCK_ROW + B_SEQUENCE]!]!.chunks.length > 0));
  if (!forked) throw new Error("the then clause holds no if with an else to edit beside");
  const [branch, sibling] = [0, 1].map((k) => forked[table(forked) + k * BLOCK_ROW + B_SEQUENCE]!) as [number, number];
  const inner = copyChunk(edited, display);
  const beside = insertChunk(edited, branch, 0, inner);
  checkSharing(edited, beside, branch, 1);
  checkLines(edited, beside, new Set([inner[H_ID]!]));
  const siblingRow = edited.sequences[sibling]!;
  if (beside.sequences[sibling] !== siblingRow) throw new Error("an edit in the first branch rebuilt the row of the else branch");
  if (lineOf(beside, siblingRow.ids[0]!) !== lineOf(edited, siblingRow.ids[0]!) + PLAIN_LINES) throw new Error("the else branch did not move down by the line inserted in the first branch");

  // The clause stands in the last scene, so nothing above moved a later flow.
  // A statement inserted into the first scene does: every later scene starts a
  // line further down, with a new row for it and the arrays it had.
  const flows = beside.sequences.filter((row) => row.owner < 0 && row.chunks.length > 0);
  const [firstFlow, lastFlow] = [flows[0]!, flows.at(-1)!];
  if (flows.length < 2 || beside.sequences[clause.id]!.flow !== lastFlow.flow) throw new Error("the scene layout gives the probe no flow below an edit");
  const early = copyChunk(beside, display);
  const shifted = insertChunk(beside, firstFlow.id, 1, early);
  checkSharing(beside, shifted, firstFlow.id, 1);
  checkLines(beside, shifted, new Set([early[H_ID]!]));
  for (const flow of flows.slice(1)) {
    const moved = shifted.sequences[flow.id]!;
    if (moved.firstLine !== flow.firstLine + PLAIN_LINES || moved.chunks !== flow.chunks || moved.lineStarts !== flow.lineStarts) throw new Error(`the flow of sequence ${flow.id} did not move down a line with its arrays shared`);
  }

  const second = new ChunkStepper(edited);
  second.start(SCENE, globals);
  let inside: { chunk: number; pc: number; globals: Map<string, InkObject>; lines: number } | undefined;
  const after = linesOf(second, (lines) => {
    const at = second.cursor;
    if (!inside && at && at.sequence === body) inside = { chunk: at.chunk, pc: at.pc, globals: new Map(second.globals), lines };
  });
  let inserted: string | undefined;
  let added = 0;
  for (let i = 0, j = 0; j < after.length; j++) {
    if (before[i] === after[j]) i++;
    else if ((inserted ??= after[j]) === after[j]) added++;
    else throw new Error(`line ${j} of the edited run is neither the previous run's next line nor the inserted one`);
  }
  if (added !== 2 || after.length !== before.length + 2) throw new Error(`the edited run adds ${added} lines to ${before.length}, not the two inserted`);

  if (!inside) throw new Error("no line of the edited run ended inside the if");
  const resumed = new ChunkStepper(edited);
  resumed.resumeAt(inside.chunk, inside.pc, inside.globals);
  const tail = linesOf(resumed);
  const expected = after.slice(inside.lines);
  if (!expected.includes(inserted!)) throw new Error("the line inserted below the if is not in the rest of the run, so resuming could not show it");
  if (tail.length !== expected.length || tail.some((line, i) => line !== expected[i])) throw new Error(`resumed inside the if, the story ran ${tail.length} lines that are not the ${expected.length} the edited run ends with`);
  return `two statements inserted around entry ${entry} of a then clause of ${clauseLength}; the chunk arrays of ${sharedArrays} of ${root.sequences.length} sequences and all ${root.chunkCount} chunks shared with the previous root; resumed inside the if through the new root, the ${tail.length} lines to the end are equal; a third inserted into the first branch of an if moved its else branch down a line with that branch's row and arrays shared; a fourth inserted into the first scene moved the ${flows.length - 1} scenes below it down a line with their arrays shared; after each edit every statement's line equals a layout from scratch`;
}

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: 0 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const compiled = cold.program.compiled;
  if (!compiled) throw new Error("the project did not compile");

  const [engine, drive] = config.candidate.split("-");
  let candidate: { prepare(): void; run(): Run };
  let layout: Record<string, unknown> | undefined;
  let edit: string | undefined;
  if (engine === "engine") candidate = engineCandidate(compiled, drive === "step");
  else {
    // The variables as the program's global initializers leave them, which the
    // prototype does not run: read from a story that has.
    const story = new Story(compiled);
    story.onError = NOOP as any;
    story.ResetState();
    const globals: Map<string, InkObject> = (story.state.variablesState as any)["_globalVariables"];
    const made = chunkCandidate(compiled, drive === "step", globals);
    candidate = made;
    const { root } = made;
    const skipped = [...root.skipped].filter(([name]) => !name.startsWith("__"));
    layout = { chunks: root.chunkCount, instructions: root.instructionCount, bytes: root.words * 4, sequences: root.sequences.length, symbols: root.symbolNames.length, displayBeat: root.displayBeat, flowsLeftOut: Object.fromEntries(skipped) };
    edit = editProbe(root, globals);
  }

  const totals: number[] = [];
  let last: Run = { steps: 0, entries: [], beats: 0 };
  for (let i = 0; i < config.warmup + config.samples; i++) {
    candidate.prepare();
    const t0 = performance.now();
    last = candidate.run();
    const t1 = performance.now();
    if (i >= config.warmup) totals.push(t1 - t0);
  }
  // The `line` drive of the story engine does not count its steps; per-step
  // figures come from the `step` drive.
  const steps = last.steps || undefined;
  const lines = last.entries.filter((entry) => entry[0] !== "choices");
  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: totals.length,
    lines: lines.length,
    displayTables: lines.reduce((n, line) => n + (line[2] as unknown[]).length, 0),
    choiceStops: last.entries.length - lines.length,
    steps,
    lookAheads: last.beats || undefined,
    layout,
    editProbe: edit,
    outputDigest: createHash("sha256").update(JSON.stringify(last.entries)).digest("hex"),
    totalMs: stats(totals),
    microsecondsPerStep: steps ? stats(totals.map((t) => (t * 1000) / steps)) : undefined,
    microsecondsPerLine: stats(totals.map((t) => (t * 1000) / lines.length)),
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number, d = 1) => n.toFixed(d).padStart(9);
  const out = [
    `candidate ${report.candidate}: scene ${SCENE} to the end, ${report.lines} lines, ${report.displayTables} display tables, ${report.choiceStops} stops at choices, ${steps ?? "uncounted"} steps; ${report.samples} samples after ${report.warmup} warm-up`,
    `  output digest ${report.outputDigest}`,
  ];
  if (layout) {
    const beat = layout["displayBeat"] as ProgramRoot["displayBeat"];
    out.push(
      `  layout: ${layout["chunks"]} chunks in ${layout["sequences"]} sequences, ${layout["instructions"]} instructions, ${layout["bytes"]} bytes, ${layout["symbols"]} symbols; ${report.lookAheads} look-aheads`,
      `  a display beat that interpolates nothing: ${beat.instructions[0]} to ${beat.instructions[1]} instructions, ${beat.objects[0]} to ${beat.objects[1]} runtime objects in the JSON tree`,
      `  edit probe: ${edit}`,
    );
  }
  out.push(`  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`, `  ${"script, top to end (ms)".padEnd(28)} ${f(report.totalMs.min, 2)} ${f(report.totalMs.median, 2)} ${f(report.totalMs.max, 2)}`);
  if (report.microsecondsPerStep) out.push(`  ${"per step (microseconds)".padEnd(28)} ${f(report.microsecondsPerStep.min, 3)} ${f(report.microsecondsPerStep.median, 3)} ${f(report.microsecondsPerStep.max, 3)}`);
  out.push(`  ${"per line (microseconds)".padEnd(28)} ${f(report.microsecondsPerLine.min, 3)} ${f(report.microsecondsPerLine.median, 3)} ${f(report.microsecondsPerLine.max, 3)}`);
  realLog(out.join("\n"));
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`chunk step bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
