import "../../inkjs/engine/Container";
import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { generatePerfScreenplay } from "./perfFixture";

interface PhaseStat {
  total: number;
  count: number;
}

// Read all "measure" entries synchronously, aggregate by method label, then
// clear so the next phase starts fresh. (PerformanceObserver delivers entries
// asynchronously, which never flushes inside a synchronous test.)
function collectMeasures(): Map<string, PhaseStat> {
  const stats = new Map<string, PhaseStat>();
  for (const entry of performance.getEntriesByType("measure")) {
    // name format: `${profilerId} ${method} ${uri}` — keep the method label.
    const parts = entry.name.split(" ");
    const method = parts[1] ?? entry.name;
    const stat = stats.get(method) ?? { total: 0, count: 0 };
    stat.total += entry.duration;
    stat.count += 1;
    stats.set(method, stat);
  }
  performance.clearMeasures();
  performance.clearMarks();
  return stats;
}

function report(label: string, stats: Map<string, PhaseStat>) {
  const rows = [...stats.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`\n===== ${label} =====`);
  for (const [method, stat] of rows) {
    console.log(
      `  ${method.padEnd(30)} ${stat.total.toFixed(1).padStart(9)}ms  (${
        stat.count
      }x, ${(stat.total / stat.count).toFixed(2)}ms avg)`,
    );
  }
}

describe("compiler perf profile", () => {
  it("profiles cold compile + per-edit recompile", () => {
    const PROFILER_ID = "perf";
    const uri = "inmemory:///main.sd";
    const sceneCount = 280; // ~150KB, ~8800 lines
    const source = generatePerfScreenplay(sceneCount);
    const lineCount = source.split("\n").length;
    console.log(
      `\nFixture: ${lineCount} lines, ${(source.length / 1024).toFixed(1)}KB`,
    );

    // Silence the compiler's verbose diagnostic logging (console.warn/error)
    // so the profile report is readable. Keep console.log for our output.
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    const restoreConsole = () => {
      console.warn = realWarn;
      console.error = realError;
    };

    const compiler = new SparkdownCompiler();
    compiler.profilerId = PROFILER_ID;

    // ---- Configure (registers + full-parses the doc) ----
    {
      performance.clearMeasures();
      performance.clearMarks();
      const t0 = performance.now();
      compiler.configure({
        files: [
          {
            uri,
            type: "script",
            name: "main",
            ext: "sd",
            text: source,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      });
      const t1 = performance.now();
      console.log(`\nconfigure wall: ${(t1 - t0).toFixed(1)}ms`);
      report("CONFIGURE (full parse + annotate)", collectMeasures());
    }

    // ---- Cold compile ----
    {
      const t0 = performance.now();
      compiler.compile({ textDocument: { uri } });
      const t1 = performance.now();
      console.log(`\nCOLD compile() wall: ${(t1 - t0).toFixed(1)}ms`);
      report("COLD COMPILE", collectMeasures());
    }

    // ---- Per-edit recompile (the HMR path) ----
    // Insert one character into the middle of a dialogue line each iteration,
    // bumping the document version, then recompile — mirrors a keystroke.
    // Report MIN (robust to background interference on this noisy machine) and
    // median, with a few warmup iterations discarded.
    const WARMUP = 3;
    const EDITS = 10;
    const editWalls: number[] = [];
    const updateWalls: number[] = [];
    const compileWalls: number[] = [];
    // Pick a stable insertion offset roughly in the middle of the doc.
    const marker = `This is dialogue line one in scene ${Math.floor(
      sceneCount / 2,
    )}.`;
    let version = 1;
    let doc = source;
    for (let e = 0; e < WARMUP + EDITS; e++) {
      version += 1;
      const insertOffset = doc.indexOf(marker) + marker.length - 1;
      const before = doc.slice(0, insertOffset);
      const line = before.split("\n").length - 1;
      const character = insertOffset - (before.lastIndexOf("\n") + 1);
      if (e === WARMUP) {
        performance.clearMeasures();
        performance.clearMarks();
      }
      const tEdit0 = performance.now();
      const tU0 = performance.now();
      compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [
          {
            range: { start: { line, character }, end: { line, character } },
            text: "x",
          },
        ],
      });
      const tU1 = performance.now();
      doc = doc.slice(0, insertOffset) + "x" + doc.slice(insertOffset);
      const tC0 = performance.now();
      compiler.compile({ textDocument: { uri } });
      const tC1 = performance.now();
      const tEdit1 = performance.now();
      if (e >= WARMUP) {
        updateWalls.push(tU1 - tU0);
        compileWalls.push(tC1 - tC0);
        editWalls.push(tEdit1 - tEdit0);
      }
    }

    const editStats = collectMeasures();
    const stat = (a: number[]) => {
      const sorted = [...a].sort((x, y) => x - y);
      const min = sorted[0];
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = a.reduce((x, y) => x + y, 0) / a.length;
      return { min, median, avg };
    };
    const fmt = (s: { min: number; median: number; avg: number }) =>
      `min ${s.min.toFixed(1)}ms / median ${s.median.toFixed(
        1,
      )}ms / avg ${s.avg.toFixed(1)}ms`;
    console.log(`\n===== PER-EDIT (${EDITS} edits, ${WARMUP} warmup) =====`);
    console.log(`  updateDocument: ${fmt(stat(updateWalls))}`);
    console.log(`  compile()     : ${fmt(stat(compileWalls))}`);
    console.log(`  TOTAL per-edit: ${fmt(stat(editWalls))}`);
    report("PER-EDIT phase totals (across measured edits)", editStats);
    restoreConsole();
  });
});
