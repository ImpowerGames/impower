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
  const flows = Math.max(shape.countedSymbols, 2);
  const size = Math.max(shape.symbols, flows);

  let state = 693;
  const next = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const order = Array.from({ length: flows }, (_, i) => i);
  for (let i = flows - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const idOf = (member: number) => Math.floor((member * size) / flows);
  const target = new Map<number, number>();
  for (let i = 0; i < flows; i++) target.set(idOf(order[i]!), idOf(order[(i + 1) % flows]!));
  const named: Record<string, unknown[]> = {};
  for (let id = 0; id < size; id++) named[`S_${id}`] = target.has(id) ? [{ "->": `S_${target.get(id)}` }, null] : ["done", null];
  const root = writeChunkProgram({ root: ["done", named] }, { resolveDirect: config.candidate === "direct" });
  if (root.symSeq.length !== size || root.symbolNames.some((name, id) => name !== `S_${id}`)) throw new Error(`the symbol table holds ${root.symSeq.length} symbols, not the ${size} it was sized for`);
  const stepper = new ChunkStepper(root);

  const perDivert: number[] = [];
  for (let i = 0; i < config.warmup + config.samples; i++) {
    stepper.start(`S_${idOf(order[0]!)}`, []);
    const t0 = performance.now();
    for (let k = 0; k < DIVERTS_PER_SAMPLE; k++) stepper.step();
    const t1 = performance.now();
    if (i >= config.warmup) perDivert.push(((t1 - t0) * 1e6) / DIVERTS_PER_SAMPLE);
  }
  if (stepper.steps !== DIVERTS_PER_SAMPLE) throw new Error(`the ring took ${stepper.steps} steps`);
  const expected = DIVERTS_PER_SAMPLE / flows;
  stepper.visits.forEach((visits, id) => {
    const wanted = target.has(id) ? expected : 0;
    if (Math.abs(visits - wanted) > 1) throw new Error(`symbol ${id} was visited ${visits} times, not ${wanted}`);
  });

  const report = { candidate: config.candidate, project: config.project, warmup: config.warmup, samples: perDivert.length, symbols: size, ring: flows, countedSymbols: shape.countedSymbols, globals: shape.globals, constants: shape.constants, divertsPerSample: DIVERTS_PER_SAMPLE, nanosecondsPerDivert: stats(perDivert) };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const f = (n: number) => n.toFixed(2).padStart(9);
  realLog(
    [
      `candidate ${report.candidate}: a ring of ${flows} flows spread through a symbol table of ${size}, which is the ${shape.countedSymbols} counted symbols, ${shape.globals} globals and ${shape.constants} constants of ${shape.flow}'s program; ${report.divertsPerSample} diverts per sample, ${report.samples} samples after ${report.warmup} warm-up`,
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
