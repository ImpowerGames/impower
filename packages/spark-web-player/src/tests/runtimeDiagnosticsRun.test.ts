// #816 — one run's runtime errors and warnings, as the editor's diagnostics.
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { describe, expect, it } from "vitest";
import { RuntimeDiagnosticsRun } from "../utils/RuntimeDiagnosticsRun";

const URI = "file:///local/main.sd";
const at = (line: number, from: number, to: number) => ({
  uri: URI,
  range: { start: { line, character: from }, end: { line, character: to } },
});

const diagnosticsOf = (errors: { message: string; type: number; location: any }[]) => {
  const run = new RuntimeDiagnosticsRun({ uri: URI, scripts: { [URI]: 1 } }, null);
  for (const error of errors) {
    run.add(error);
  }
  return run.params().diagnostics[URI] ?? [];
};

describe("a run's runtime diagnostics", () => {
  it("leave out information, which is not a problem in the script", () => {
    expect(
      diagnosticsOf([
        { message: "hello", type: ErrorType.Information, location: at(0, 0, 5) },
        { message: "a hint", type: ErrorType.Hint, location: at(1, 0, 5) },
      ]),
    ).toEqual([]);
  });

  it("keep one diagnostic per identical severity, message and range", () => {
    const warning = { message: "careful", type: ErrorType.Warning, location: at(2, 0, 4) };
    expect(
      diagnosticsOf([warning, { ...warning, location: at(2, 0, 4) }, { ...warning, type: ErrorType.Error }]),
    ).toEqual([
      { range: at(2, 0, 4).range, severity: 2, message: "careful", source: "runtime" },
      { range: at(2, 0, 4).range, severity: 1, message: "careful", source: "runtime" },
    ]);
  });

  it("never publish a position before the start of its line", () => {
    // The statement's recorded location can start one character early.
    expect(
      diagnosticsOf([{ message: "boom", type: ErrorType.Error, location: at(6, -1, 14) }]),
    ).toEqual([{ range: at(6, 0, 14).range, severity: 1, message: "boom", source: "runtime" }]);
  });

  it("keep one diagnostic for two places that differ only before the start of the line", () => {
    expect(
      diagnosticsOf([
        { message: "boom", type: ErrorType.Error, location: at(6, -1, 14) },
        { message: "boom", type: ErrorType.Error, location: at(6, 0, 14) },
      ]),
    ).toEqual([{ range: at(6, 0, 14).range, severity: 1, message: "boom", source: "runtime" }]);
  });
});
