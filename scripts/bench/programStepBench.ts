// The program engine (#694) on the beats scene.
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, candidate, samples, warmup,
// json }. A candidate is how ProgramStory, running the scene's statement
// chunks, is driven: `program-step`, one call per step as the route planner
// drives a story, or `program-line`, one call per line as a game does. Every
// candidate runs scene MAIN from its top to its end, timed from the first
// step, and reports a digest of every line's text, tags and display tables;
// engine-bench.mjs fails the run unless the digests are equal, and unless the
// steps are the instructions of the scene's chunks and the one step that finds
// the scene ended, so that every display beat ran once.
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "../../packages/sparkdown/src/program/ProgramStory";
import type { ProgramRoot } from "../../packages/sparkdown/src/program/ProgramRoot";
import { codeWords } from "../../packages/sparkdown/src/program/StatementChunk";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";

interface ProgramBenchConfig {
  project: string;
  candidate: "program-step" | "program-line";
  samples: number;
  warmup: number;
  json?: string;
}

const config: ProgramBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const SCENE = "MAIN";
const NOOP = () => {};

// A line as plain data, the same from either drive.
type Line = [text: string, tags: string[], display: [string, unknown][][]];

interface Run {
  steps: number;
  lines: Line[];
}

// The members of ProgramStory a run reads.
interface Engine {
  canContinue: boolean;
  asyncContinueComplete: boolean;
  stepCount: number;
  currentText: string | null;
  currentTags: string[];
  currentDisplayInstructions: { value: Map<string, { value?: unknown }> | null }[];
  onError: unknown;
  ResetState(): void;
  ChoosePathString(path: string): void;
  Continue(): unknown;
  ContinueAsync(): void;
}

function candidate(story: Engine, perStep: boolean) {
  story.onError = NOOP;
  const take = (): Line => [
    story.currentText ?? "",
    [...story.currentTags],
    story.currentDisplayInstructions.map((table) =>
      [...(table.value ?? [])].map(([key, v]): [string, unknown] => [key, v?.value]),
    ),
  ];
  return {
    // Untimed: ResetState runs the program's global initializers, which is
    // engine stepping of its own and no part of the scene.
    prepare() {
      story.ResetState();
      story.ChoosePathString(SCENE);
    },
    run(): Run {
      const lines: Line[] = [];
      const before = story.stepCount;
      if (perStep) {
        while (story.canContinue) {
          story.ContinueAsync();
          if (story.asyncContinueComplete) lines.push(take());
        }
      } else {
        while (story.canContinue) {
          story.Continue();
          lines.push(take());
        }
      }
      return { steps: story.stepCount - before, lines };
    },
  };
}

// The instructions of the scene's statement chunks.
const instructionsOf = (root: ProgramRoot): number =>
  root
    .flowNamed(SCENE)!
    .arrays.chunks.reduce((n, chunk) => n + codeWords(chunk) / 2, 0);

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: 0 };
  const drive = config.candidate.split("-")[1];
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const program = cold.program;
  if (!program.chunks) throw new Error("the project did not compile");
  const story = new ProgramStory(program.chunks) as unknown as Engine;
  const instructions = instructionsOf(program.chunks);
  const bench = candidate(story, drive === "step");
  const totals: number[] = [];
  let last: Run = { steps: 0, lines: [] };
  for (let i = 0; i < config.warmup + config.samples; i++) {
    bench.prepare();
    const t0 = performance.now();
    last = bench.run();
    const t1 = performance.now();
    if (i >= config.warmup) totals.push(t1 - t0);
  }
  // A continue returns at its line's newline, so the one after the scene's
  // last line completes with no text and no table. The game makes no beat of
  // it, and neither does the digest.
  const plain = last.lines.filter(([text, , display]) => text !== "" || display.length > 0);
  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: totals.length,
    lines: plain.length,
    displayTables: plain.reduce((n, line) => n + line[2].length, 0),
    steps: last.steps,
    instructions,
    outputDigest: createHash("sha256").update(JSON.stringify(plain)).digest("hex"),
    totalMs: stats(totals),
    microsecondsPerLine: stats(totals.map((t) => (t * 1000) / Math.max(1, plain.length))),
    microsecondsPerStep: stats(totals.map((t) => (t * 1000) / Math.max(1, last.steps))),
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number, d = 1) => n.toFixed(d).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: scene ${SCENE}, ${report.lines} lines, ${report.displayTables} display tables, ${report.steps} steps over ${instructions} instructions; ${report.samples} samples after ${report.warmup} warm-up`,
      `  output digest ${report.outputDigest}`,
      `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"scene, top to end (ms)".padEnd(28)} ${f(report.totalMs.min, 2)} ${f(report.totalMs.median, 2)} ${f(report.totalMs.max, 2)}`,
      `  ${"per line (microseconds)".padEnd(28)} ${f(report.microsecondsPerLine.min, 2)} ${f(report.microsecondsPerLine.median, 2)} ${f(report.microsecondsPerLine.max, 2)}`,
      `  ${"per step (microseconds)".padEnd(28)} ${f(report.microsecondsPerStep.min, 3)} ${f(report.microsecondsPerStep.median, 3)} ${f(report.microsecondsPerStep.max, 3)}`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`program step bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
