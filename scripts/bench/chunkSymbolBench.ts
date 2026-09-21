// What a divert through a symbol costs against a divert to a target resolved at
// compile time (#693).
//
// Run through engine-bench.mjs, one candidate per process, with the
// configuration as one JSON argument: { project, line, candidate, samples,
// warmup, json }. The program is a ring: as many flows as the named project
// would intern symbols, each holding one divert to the next and the last to the
// first, visited in a shuffled order so that consecutive lookups land far apart
// in the symbol table. The `symbol` candidate runs it as the chunk layout holds
// it, each divert naming a symbol that the root resolves to a sequence, an entry
// and a position. The `direct` candidate runs the same ring with every divert
// replaced by a reference to its target, which is what a compiler that resolved
// offsets at compile time would emit. Both count the visit and enter the
// target's chunk, so the difference between them is the lookup.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { silenceConsole, stats } from "./benchProject";
import { writeChunkProgram } from "./chunkProgram";
import { ChunkStepper } from "./chunkStepper";
import { measureProjectShape } from "./projectShape";

interface SymbolBenchConfig {
  project: string;
  line: number;
  candidate: "symbol" | "direct";
  samples: number;
  warmup: number;
  json?: string;
}

const config: SymbolBenchConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/engine-bench.mjs");

const DIVERTS_PER_SAMPLE = 2_000_000;

function main() {
  const realLog = silenceConsole();
  const { shape } = measureProjectShape(config.project, config.line);
  const flows = Math.max(shape.symbols, 2);

  // Park-Miller, so the ladder is the same on every run.
  let state = 693;
  const next = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const order = Array.from({ length: flows }, (_, i) => i);
  for (let i = flows - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const named: Record<string, unknown[]> = {};
  for (let i = 0; i < flows; i++) named[`S_${order[i]}`] = [{ "->": `S_${order[(i + 1) % flows]}` }, null];
  const root = writeChunkProgram({ root: ["done", named] }, { resolveDirect: config.candidate === "direct" });
  const stepper = new ChunkStepper(root);

  const perDivert: number[] = [];
  for (let i = 0; i < config.warmup + config.samples; i++) {
    stepper.start(`S_${order[0]}`, []);
    const t0 = performance.now();
    for (let k = 0; k < DIVERTS_PER_SAMPLE; k++) stepper.step();
    const t1 = performance.now();
    if (i >= config.warmup) perDivert.push(((t1 - t0) * 1e6) / DIVERTS_PER_SAMPLE);
  }
  // Every step was a divert, and the ring was walked evenly.
  if (stepper.steps !== DIVERTS_PER_SAMPLE) throw new Error(`the ring took ${stepper.steps} steps`);
  const expected = DIVERTS_PER_SAMPLE / flows;
  for (const visits of stepper.visits) if (Math.abs(visits - expected) > 1) throw new Error(`a flow of the ring was visited ${visits} times, not ${expected}`);

  const report = { candidate: config.candidate, project: config.project, warmup: config.warmup, samples: perDivert.length, symbols: flows, divertsPerSample: DIVERTS_PER_SAMPLE, nanosecondsPerDivert: stats(perDivert) };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(2).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: a ring of ${flows} flows, the symbol count of ${shape.flow}'s program; ${report.divertsPerSample} diverts per sample, ${report.samples} samples after ${report.warmup} warm-up`,
      `  ${"".padEnd(28)} ${"min".padStart(9)} ${"median".padStart(9)} ${"max".padStart(9)}`,
      `  ${"per divert (nanoseconds)".padEnd(28)} ${f(report.nanosecondsPerDivert.min)} ${f(report.nanosecondsPerDivert.median)} ${f(report.nanosecondsPerDivert.max)}`,
    ].join("\n"),
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`chunk symbol bench failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
