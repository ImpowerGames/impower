// What writing the compiled program costs per record (#664), for estimating a
// compiler back end that emits records directly.
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json }. Every candidate serializes the compiler's whole runtime
// story with `Story.ToJson`, with no per-flow reuse, into a different writer:
//
//   walk    a writer that does nothing, which leaves the walk over the runtime
//           objects that every writer is driven by
//   binary  ProgramBinaryWriter, then `toBuffer`
//   json    SimpleJson.Writer, the default
//   tree    no runtime story at all: `buildProgramBuffer` over the compiled
//           JSON tree, which is a walk over plain objects plus the same records
//
// `binary` less `walk` is what the record writer itself costs, and `tree` is
// what writing every record costs when the walk that feeds it is cheap.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { NODE_WIDTH, buildProgramBuffer } from "../../packages/sparkdown/src/binary/programBinary";
import { ProgramBinaryWriter } from "../../packages/sparkdown/src/binary/ProgramBinaryWriter";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SimpleJson } from "../../packages/sparkdown/src/inkjs/engine/SimpleJson";
import type { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { buildProgramIndex } from "./bufferStepper";

interface EmitBenchConfig {
  project: string;
  line: number;
  candidate: "walk" | "binary" | "json" | "tree";
  samples: number;
  warmup: number;
  json?: string;
}

const config: EmitBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

// Answers every write event and keeps nothing. An event that takes a function
// for its inner content runs it, as the real writers do.
function walkOnlyWriter(): any {
  const writer: any = {};
  const event = (first: unknown, second: unknown) => {
    if (typeof first === "function") first(writer);
    else if (typeof second === "function") second(writer);
  };
  for (const proto of [ProgramBinaryWriter.prototype, SimpleJson.Writer.prototype]) {
    for (const [name, property] of Object.entries(Object.getOwnPropertyDescriptors(proto))) if (name !== "constructor" && typeof property.value === "function") writer[name] = event;
  }
  return writer;
}

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: config.line - 1 };
  const compiler = new SparkdownCompiler();
  let story: Story | undefined;
  compiler.addEventListener("compiler/didCompile", (params: any) => (story = params.story));
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  if (!story) throw new Error("the compile produced no runtime story");
  const runtime: Story = story;

  const serialize =
    config.candidate === "walk"
      ? () => runtime.ToJson(walkOnlyWriter())
      : config.candidate === "binary"
        ? () => {
            const writer = new ProgramBinaryWriter();
            runtime.ToJson(writer as any);
            return writer.toBuffer();
          }
        : config.candidate === "tree"
          ? () => buildProgramBuffer(cold.program.compiled)
          : () => {
            const writer = new SimpleJson.Writer();
            runtime.ToJson(writer);
            return writer.toString();
          };
  const totals: number[] = [];
  for (let i = 0; i < config.warmup + config.samples; i++) {
    const t0 = performance.now();
    serialize();
    const t1 = performance.now();
    if (i >= config.warmup) totals.push(t1 - t0);
  }

  // Counted after the timing, so that no candidate's process has run another
  // candidate's writer first: the program's records, and those of the
  // top-level flow that holds the measured line, which is what a compile that
  // reuses every unchanged flow writes again.
  const writer = new ProgramBinaryWriter();
  runtime.ToJson(writer as any);
  const buffer = writer.toBuffer();
  const records = buffer.nodes.length / NODE_WIDTH;
  const game = new Game({ program: cold.program, ...benchSystem } as any);
  game.setStartFrom(startFrom);
  const flow = game.startPath?.split(".")[0];
  const index = buildProgramIndex(buffer);
  const flowAt = flow ? index.named.get(index.root)?.get(flow) : undefined;
  const flowRecords = flowAt == null ? undefined : buffer.nodes[flowAt * NODE_WIDTH + 2];

  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: totals.length,
    records,
    flow,
    flowRecords,
    totalMs: stats(totals),
    microsecondsPerRecord: stats(totals.map((t) => (t * 1000) / records)),
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number, d = 2) => n.toFixed(d).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: ${records} records, of which ${flowRecords ?? "?"} in ${flow ?? "?"}; ${report.samples} samples after ${report.warmup} warm-up`,
      `  ${"".padEnd(34)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"whole program (ms)".padEnd(34)} ${f(report.totalMs.min)} ${f(report.totalMs.median)} ${f(report.totalMs.max)}`,
      `  ${"per record (microseconds)".padEnd(34)} ${f(report.microsecondsPerRecord.min, 3)} ${f(report.microsecondsPerRecord.median, 3)} ${f(report.microsecondsPerRecord.max, 3)}`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`emit bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
