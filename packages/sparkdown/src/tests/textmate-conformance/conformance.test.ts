import { describe, expect, test } from "vitest";
import {
  type Axis,
  type CaseResult,
  loadSuite,
  runCase,
  suiteDirFor,
} from "./harness";

// Runs the vendored vscode-textmate conformance corpus through our engine and
// snapshots a baseline report. As we close divergence axes (capture model,
// line+stack, while rules, regex), the report improves and guards regressions.

const SUITES: { suite: string; files: string[] }[] = [
  { suite: "first-mate", files: ["tests.json"] },
  { suite: "suite1", files: ["tests.json", "whileTests.json"] },
];

function runAll(): CaseResult[] {
  const results: CaseResult[] = [];
  const trace = process.env.CONFORMANCE_TRACE;
  for (const { suite, files } of SUITES) {
    const dir = suiteDirFor(import.meta.url, suite);
    for (const file of files) {
      const cases = loadSuite(dir, file);
      cases.forEach((c, i) => {
        if (trace) {
          // crash-surviving progress log to find a runaway grammar
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require("node:fs").appendFileSync(
            trace,
            `START ${suite}#${i} ${c.grammarPath ?? c.grammarScopeName}\n`,
          );
        }
        results.push(runCase(suite, dir, i, c));
        if (trace) {
          require("node:fs").appendFileSync(trace, `  done ${suite}#${i}\n`);
        }
      });
    }
  }
  return results;
}

const AXIS_ORDER: Axis[] = [
  "pass",
  "mismatch",
  "incomplete",
  "capture-model",
  "while-rule",
  "regex-invalid",
  "throw-other",
  "external-includes",
  "load-error",
];

describe("textmate-conformance baseline", () => {
  const results = runAll();

  test("baseline report", async () => {
    const byAxis = new Map<Axis, CaseResult[]>();
    for (const r of results) {
      const list = byAxis.get(r.axis) ?? [];
      list.push(r);
      byAxis.set(r.axis, list);
    }

    const lines: string[] = [];
    lines.push("# vscode-textmate conformance baseline");
    lines.push("");
    lines.push(`Total cases: ${results.length}`);
    lines.push("");
    lines.push("## Summary by axis");
    lines.push("");
    for (const axis of AXIS_ORDER) {
      const count = byAxis.get(axis)?.length ?? 0;
      lines.push(`- ${axis}: ${count}`);
    }
    lines.push("");
    lines.push("## Per-case");
    lines.push("");
    for (const axis of AXIS_ORDER) {
      const list = byAxis.get(axis);
      if (!list || list.length === 0) continue;
      lines.push(`### ${axis} (${list.length})`);
      for (const r of list) {
        const id = `${r.suite}#${r.index} [${r.grammar}] ${r.desc}`;
        const note = r.firstDiff ?? r.detail ?? "";
        lines.push(`- ${id}${note ? ` — ${note}` : ""}`);
      }
      lines.push("");
    }

    await expect(lines.join("\n") + "\n").toMatchFileSnapshot(
      "./__snapshots__/baseline.md",
    );
  });

  test("pass rate is recorded (non-gating)", () => {
    const pass = results.filter((r) => r.axis === "pass").length;
    // eslint-disable-next-line no-console
    console.log(
      `[conformance] ${pass}/${results.length} pass (${((pass / results.length) * 100).toFixed(1)}%)`,
    );
    expect(results.length).toBeGreaterThan(0);
  });
});
