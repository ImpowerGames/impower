// The prototype stepping loop against the story engine on one scene (#664).
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, candidate, samples, warmup,
// json }. A candidate is an engine (`engine`, the shipped Story, or `buffer`,
// bufferStepper.ts) and how it is driven (`step`, one call per step as the
// route planner drives a story, or `line`, one call per line as a game does).
// Every candidate runs scene MAIN from its top to its end and reports a digest
// of every line's text, tags and display tables; engine-bench.mjs fails the
// run unless the digests of the two engines are equal.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { buildProgramBuffer, encodeProgramBuffer, readProgramBuffer } from "../../packages/sparkdown/src/binary/programBinary";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { BufferStepper, buildProgramIndex } from "./bufferStepper";

interface StepBenchConfig {
  project: string;
  candidate: "engine-step" | "engine-line" | "buffer-step" | "buffer-line";
  samples: number;
  warmup: number;
  json?: string;
}

const config: StepBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const SCENE = "MAIN";
const NOOP = () => {};

// A line as plain data, the same from either engine.
type Line = [text: string, tags: string[], display: [string, unknown][][]];

interface Run {
  steps: number;
  lines: unknown[];
}

function engineCandidate(compiled: Record<string, any>, perStep: boolean) {
  const story = new Story(compiled);
  story.onError = NOOP as any;
  const take = () => ({ text: story.currentText, tags: story.currentTags, display: story.state.currentDisplayInstructions });
  return {
    run(): Run {
      story.ResetState();
      story.ChoosePathString(SCENE);
      const lines: unknown[] = [];
      let steps = 0;
      if (perStep) {
        while (story.canContinue) {
          story.ContinueAsync(Infinity);
          steps++;
          if (story.asyncContinueComplete) lines.push(take());
        }
      } else {
        while (story.canContinue) {
          story.Continue();
          lines.push(take());
        }
      }
      return { steps, lines };
    },
    plain: (line: any): Line => [line.text, line.tags ?? [], line.display.map((table: any) => [...table.value].map(([key, v]: [string, any]) => [key, v.value]))],
  };
}

function bufferCandidate(compiled: Record<string, any>, perStep: boolean) {
  // The buffer as the page receives it: encoded by the compiler, read back.
  const buffer = readProgramBuffer(encodeProgramBuffer(buildProgramBuffer(compiled)));
  const stepper = new BufferStepper(buffer, buildProgramIndex(buffer));
  return {
    run(): Run {
      stepper.start(SCENE);
      const lines: unknown[] = [];
      if (perStep) {
        while (stepper.canContinue) if (stepper.step()) lines.push(stepper.takeLine());
      } else {
        while (stepper.canContinue) lines.push(stepper.continueLine());
      }
      return { steps: stepper.steps, lines };
    },
    plain: (line: any): Line => [line.text, line.tags, line.display.map((table: Map<string, unknown>) => [...table])],
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
  const candidate = engine === "engine" ? engineCandidate(compiled, drive === "step") : bufferCandidate(compiled, drive === "step");
  const totals: number[] = [];
  let last: Run = { steps: 0, lines: [] };
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const t0 = performance.now();
    last = candidate.run();
    const t1 = performance.now();
    if (i >= config.warmup) totals.push(t1 - t0);
  }
  const plain = last.lines.map(candidate.plain);
  // The `line` drive does not count the engine's steps; per-step figures come
  // from the `step` drive.
  const steps = last.steps || undefined;
  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: totals.length,
    lines: plain.length,
    displayTables: plain.reduce((n, line) => n + line[2].length, 0),
    steps,
    outputDigest: createHash("sha256").update(JSON.stringify(plain)).digest("hex"),
    totalMs: stats(totals),
    microsecondsPerStep: steps ? stats(totals.map((t) => (t * 1000) / steps)) : undefined,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number, d = 1) => n.toFixed(d).padStart(9);
  const out = [
    `candidate ${report.candidate}: scene ${SCENE}, ${report.lines} lines, ${report.displayTables} display tables, ${steps ?? "uncounted"} steps; ${report.samples} samples after ${report.warmup} warm-up`,
    `  output digest ${report.outputDigest}`,
    `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
    `  ${"scene, top to end (ms)".padEnd(28)} ${f(report.totalMs.min, 2)} ${f(report.totalMs.median, 2)} ${f(report.totalMs.max, 2)}`,
  ];
  if (report.microsecondsPerStep) out.push(`  ${"per step (microseconds)".padEnd(28)} ${f(report.microsecondsPerStep.min, 3)} ${f(report.microsecondsPerStep.median, 3)} ${f(report.microsecondsPerStep.max, 3)}`);
  realLog(out.join("\n"));
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`buffer step bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
