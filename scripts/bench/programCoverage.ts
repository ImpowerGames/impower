// How much of a project the binary program's writer emits (#694, #695, #698): the
// project compiled cold as the player's worker compiles it, with statement
// chunks on, and the statements of its flows and its declaration sequences
// counted by what became of them.
//
// Run through preview-bench.mjs --mode coverage, with the configuration as one
// JSON argument: { project, json }. The report gives the statements the writer
// emits, of which how many are declarations, the ones it has no emit path for
// counted by the construct each names, how many functions the program has (the
// statements of their bodies are among the statements counted), and the
// construct the program falls back for, with its script and line.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import * as fs from "node:fs";
import { performance } from "node:perf_hooks";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { MAIN_URI, configurePlayerCompiler, loadProjectFiles, silenceConsole } from "./benchProject";

interface CoverageConfig {
  project: string;
  json?: string;
}

const config: CoverageConfig = JSON.parse(process.argv[2] ?? "null");
if (!config?.project) throw new Error("run through scripts/bench/preview-bench.mjs --mode coverage");

function main() {
  const realLog = silenceConsole();
  const startFrom = { file: MAIN_URI, line: 0 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(config.project), startFrom, {
    programChunks: true,
  });
  const t0 = performance.now();
  compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const compileMs = performance.now() - t0;
  const build = compiler.lastProgramBuild;
  if (!build) throw new Error("the project did not compile");
  const unsupported = Object.entries(build.coverage.unsupported).sort(
    ([a, n], [b, m]) => m - n || a.localeCompare(b),
  );
  const report = {
    project: config.project,
    compileMs,
    statements: build.coverage.statements,
    emitted: build.coverage.emitted,
    unsupported: Object.fromEntries(unsupported),
    unsupportedStatements: unsupported.reduce((n, [, count]) => n + count, 0),
    declarations: build.declarations,
    functions: build.functions,
    fallback: build.fallback ?? null,
  };
  if (config.json) fs.writeFileSync(config.json, JSON.stringify(report, null, 2));
  const share = (n: number) =>
    report.statements ? `${((100 * n) / report.statements).toFixed(1)}%` : "-";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const out = [
    `coverage: ${report.statements} statements in the program's flows, functions and declaration sequences (${plural(report.declarations, "declaration")}, ${plural(report.functions, "function")}), of which the writer emits ${report.emitted} (${share(report.emitted)})`,
    report.fallback
      ? `  the program falls back for ${report.fallback.construct} at ${report.fallback.uri} line ${report.fallback.line + 1}`
      : "  the program runs from its chunks",
  ];
  if (unsupported.length) {
    out.push(`  ${"construct".padEnd(28)} ${"statements".padStart(10)}`);
    for (const [construct, count] of unsupported) {
      out.push(`  ${construct.padEnd(28)} ${String(count).padStart(10)}`);
    }
  }
  realLog(out.join("\n"));
}

try {
  main();
  process.exit(0);
} catch (error) {
  process.stdout.write(`program coverage failed: ${(error as Error)?.stack ?? error}\n`);
  process.exit(1);
}
