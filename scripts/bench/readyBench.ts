// Ready to run, and memory (#664): from holding a whole compiled program to
// being able to take the first step, and what stays in memory once there.
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json, scratch }.
//
//   prepare       compiles the project and writes the compiled program into
//                 `scratch`, as the encoded binary buffer and as JSON text, so
//                 that no other candidate's process has held a compiler
//   story-json    the program as a JSON tree (what the page holds after the
//                 clone today), then `new Story(tree)`
//   story-buffer  the encoded buffer, then what `resolveCompiledProgram` does
//                 to it (read, materialize the tree), then `new Story(tree)`
//   buffer        the encoded buffer, then read it and build the prototype's
//                 index (bufferStepper.ts)
//
// Memory is read first, around the first construction in the fresh process,
// after forced collections; the timed samples follow.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { buildProgramBuffer, encodeProgramBuffer, materializeNode, readProgramBuffer } from "../../packages/sparkdown/src/binary/programBinary";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole, stats } from "./benchProject";
import { buildProgramIndex } from "./bufferStepper";

interface ReadyBenchConfig {
  project: string;
  line: number;
  candidate: "prepare" | "story-json" | "story-buffer" | "buffer";
  samples: number;
  warmup: number;
  json?: string;
  scratch: string;
}

const config: ReadyBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const collect = (globalThis as any).gc as (() => void) | undefined;
if (!collect) throw new Error("run with --expose-gc");

// Settled memory: the JavaScript heap, and the memory of typed arrays and
// other buffers, which the heap figure leaves out.
function memory() {
  for (let i = 0; i < 4; i++) collect!();
  const m = process.memoryUsage();
  return { heap: m.heapUsed, buffers: m.arrayBuffers };
}

function prepare(realLog: (text: string) => void) {
  const startFrom = { file: MAIN_URI, line: config.line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const compiled = cold.program.compiled;
  if (!compiled) throw new Error("the project did not compile");
  const buffer = buildProgramBuffer(compiled);
  const bytes = encodeProgramBuffer(buffer);
  const text = JSON.stringify(compiled);
  fs.writeFileSync(path.join(config.scratch, "program.bin"), bytes);
  fs.writeFileSync(path.join(config.scratch, "program.json"), text);
  const report = { candidate: config.candidate, project: config.project, records: buffer.nodes.length / 3, strings: buffer.strings.length, numbers: buffer.numbers.length, binaryKB: bytes.length / 1024, jsonKB: Buffer.byteLength(text) / 1024 };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  realLog(`candidate prepare: ${report.records} records, ${report.strings} strings, ${report.numbers} numbers; binary ${report.binaryKB.toFixed(0)} KB, JSON ${report.jsonKB.toFixed(0)} KB`);
}

function main() {
  const realLog = silenceConsole();
  if (config.candidate === "prepare") return prepare(realLog);

  // What the process holds before it starts, and the phases from there to
  // ready. Every phase returns what the next one takes; the last returns what
  // has to stay alive to step.
  let held: unknown;
  let phases: [name: string, run: (input: any) => unknown][];
  if (config.candidate === "story-json") {
    held = JSON.parse(fs.readFileSync(path.join(config.scratch, "program.json"), "utf8"));
    phases = [["new Story", (tree) => new Story(tree)]];
  } else {
    const file = fs.readFileSync(path.join(config.scratch, "program.bin"));
    // A copy at offset zero of its own buffer, as a transferred buffer arrives.
    held = new Uint8Array(file);
    phases =
      config.candidate === "story-buffer"
        ? [
            ["read buffer", (bytes) => readProgramBuffer(bytes)],
            ["materialize tree", (buffer) => materializeNode(buffer)],
            ["new Story", (tree) => new Story(tree)],
          ]
        : [
            ["read buffer", (bytes) => readProgramBuffer(bytes)],
            ["build index", (buffer) => ({ buffer, index: buildProgramIndex(buffer) })],
          ];
  }
  const build = (times?: number[]) => {
    let value = held;
    phases.forEach(([, run], p) => {
      const t0 = performance.now();
      value = run(value);
      if (times) times[p] = performance.now() - t0;
    });
    return value;
  };

  const before = memory();
  let ready: unknown = build();
  const after = memory();
  const retainedMB = { heap: (after.heap - before.heap) / 1048576, buffers: (after.buffers - before.buffers) / 1048576 };
  const heldMB = { heap: before.heap / 1048576, buffers: before.buffers / 1048576 };
  ready = undefined;

  const totals: number[] = [];
  const perPhase: number[][] = phases.map(() => []);
  for (let i = 0; i < config.warmup + config.samples; i++) {
    // No collection is forced between samples: one before each sample makes
    // the next construction slower by about a third, and a page never does it.
    const times: number[] = [];
    const t0 = performance.now();
    ready = build(times);
    const total = performance.now() - t0;
    ready = undefined;
    if (i < config.warmup) continue;
    totals.push(total);
    times.forEach((t, p) => perPhase[p]!.push(t));
  }
  const report = {
    candidate: config.candidate,
    project: config.project,
    warmup: config.warmup,
    samples: totals.length,
    readyMs: stats(totals),
    phasesMs: Object.fromEntries(phases.map(([name], p) => [name, stats(perPhase[p]!)])),
    retainedMB,
    processBeforeMB: heldMB,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(2).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: ${report.samples} samples after ${report.warmup} warm-up`,
      `  ${"(ms)".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"ready to step".padEnd(28)} ${f(report.readyMs.min)} ${f(report.readyMs.median)} ${f(report.readyMs.max)}`,
      ...Object.entries(report.phasesMs).map(([name, s]) => `  ${("  " + name).padEnd(28)} ${f(s.min)} ${f(s.median)} ${f(s.max)}`),
      `  retained once ready, first construction in a fresh process: heap ${retainedMB.heap.toFixed(2)} MB, typed arrays and buffers ${retainedMB.buffers.toFixed(2)} MB`,
      `  (held before it: heap ${heldMB.heap.toFixed(2)} MB, typed arrays and buffers ${heldMB.buffers.toFixed(2)} MB, which includes the program as it arrived)`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`ready bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
