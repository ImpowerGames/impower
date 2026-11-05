import { describe, expect, it } from "vitest";
import {
  countDiagnostics,
  countProblems,
  problemsLabel,
} from "../../src/modules/spark-editor/workspace/problemCounts";

describe("countDiagnostics", () => {
  it("counts errors, warnings and infos and leaves hints out", () => {
    expect(
      countDiagnostics([
        { severity: 1 },
        { severity: 2 },
        { severity: 2 },
        { severity: 3 },
        { severity: 4 },
      ]),
    ).toEqual({ errors: 1, warnings: 2, infos: 1 });
  });

  it("reads a diagnostic without a severity as an error", () => {
    expect(countDiagnostics([{}])).toEqual({ errors: 1, warnings: 0, infos: 0 });
  });
});

describe("countProblems", () => {
  it("adds every file's errors and warnings as problems and its infos as notes", () => {
    expect(
      countProblems({
        "file:///main.sd": { errors: 1, warnings: 1, infos: 0 },
        "file:///chapter.sd": { errors: 0, warnings: 0, infos: 3 },
        "file:///ran.sd": { errors: 0, warnings: 1, infos: 1 },
      }),
    ).toEqual({ errors: 1, problems: 3, notes: 4 });
  });

  it("counts nothing before any diagnostics arrive", () => {
    expect(countProblems(undefined)).toEqual({ errors: 0, problems: 0, notes: 0 });
  });
});

describe("problemsLabel", () => {
  it.each([
    [{ problems: 0, notes: 0 }, "No problems"],
    [{ problems: 1, notes: 0 }, "1 problem"],
    [{ problems: 2, notes: 0 }, "2 problems"],
    [{ problems: 1, notes: 3 }, "1 problem · 3 notes"],
    [{ problems: 2, notes: 1 }, "2 problems · 1 note"],
    [{ problems: 0, notes: 2 }, "No problems · 2 notes"],
  ])("labels %o as %s", (counts, label) => {
    expect(problemsLabel(counts)).toBe(label);
  });
});
