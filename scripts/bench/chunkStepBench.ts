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
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { InkObject } from "../../packages/sparkdown/src/inkjs/engine/Object";
import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { writeChunkProgram } from "./chunkProgram";
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
      return { steps: stepper.steps, entries, beats: stepper.restores + stepper.forgets };
    },
  };
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
    layout = { chunks: root.chunkCount, instructions: root.instructionCount, bytes: root.words * 4, sequences: root.sequences.length, symbols: root.symbolNames.length, flowsLeftOut: Object.fromEntries(skipped) };
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
  if (layout) out.push(`  layout: ${layout["chunks"]} chunks in ${layout["sequences"]} sequences, ${layout["instructions"]} instructions, ${layout["bytes"]} bytes, ${layout["symbols"]} symbols; ${report.lookAheads} look-aheads`);
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
