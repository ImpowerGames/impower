// #651 — the path-location table over a JSON transport.
//
// The VS Code extension pulls the whole program from the language server over
// JSON-RPC, which has no typed arrays: the table's block of ranges arrives as
// an object keyed by position. `asPathLocationTable` restores it, and every
// lookup has to answer exactly as it did before the round trip, including the
// start and preview lookups that skip function code (#835).

import { describe, expect, it } from "vitest";
import {
  asPathLocationTable,
  findPathRow,
  locationAtRow,
  pathLocation,
  pathLocationTableOf,
  scriptRowRange,
} from "../../compiler/utils/pathLocationTable";

// `F` is a function declared on lines 4 to 5 whose container also holds a
// story line after its `end` (line 7), the shape #834 compiles.
const TABLE = pathLocationTableOf(
  {
    "A.0": [0, 0, 0, 0, 8],
    "A.1": [0, 2, 0, 3, 4],
    "F.0": [0, 4, 0, 5, 3],
    "A.2": [0, 6, 2, 6, 9],
    "F.1": [0, 7, 0, 7, 2],
    "B.0": [1, 0, 0, 1, 5],
    "B.1": [1, 4, 0, 4, 7],
  },
  [{ path: "F", lines: [0, 4, 5] }],
);

describe("a path-location table that crossed a JSON transport", () => {
  const overJson = JSON.parse(JSON.stringify(TABLE));
  const restored = asPathLocationTable(overJson)!;

  it("arrives with its ranges as an object, not a typed array", () => {
    expect(Array.isArray(overJson.paths)).toBe(true);
    expect(overJson.values instanceof Int32Array).toBe(false);
  });

  it("is restored to the table it was", () => {
    expect(restored.values).toBeInstanceOf(Int32Array);
    expect(restored.paths).toEqual(TABLE.paths);
    expect([...restored.values]).toEqual([...TABLE.values]);
    expect(restored.functions).toEqual(TABLE.functions);
  });

  it("answers every lookup the way the original does", () => {
    for (let row = 0; row < TABLE.paths.length; row++) {
      expect(locationAtRow(restored, row)).toEqual(locationAtRow(TABLE, row));
    }
    for (const path of TABLE.paths) {
      expect(pathLocation(restored, path)).toEqual(pathLocation(TABLE, path));
    }
    for (let scriptIndex = 0; scriptIndex < 3; scriptIndex++) {
      expect(scriptRowRange(restored, scriptIndex)).toEqual(
        scriptRowRange(TABLE, scriptIndex),
      );
      for (let line = 0; line <= 8; line++) {
        expect({ scriptIndex, line, row: findPathRow(restored, scriptIndex, line, false) })
          .toEqual({ scriptIndex, line, row: findPathRow(TABLE, scriptIndex, line, false) });
        for (const beat of ["first", "last"] as const) {
          expect({ scriptIndex, line, beat, row: findPathRow(restored, scriptIndex, line, true, beat) })
            .toEqual({ scriptIndex, line, beat, row: findPathRow(TABLE, scriptIndex, line, true, beat) });
        }
      }
    }
  });

  it("still skips the function's own lines, and only those, when starting or previewing", () => {
    const rowOf = (path: string) => TABLE.paths.indexOf(path);
    expect(findPathRow(restored, 0, 4, false)).toBe(rowOf("F.0"));
    expect(findPathRow(restored, 0, 4, true)).toBe(rowOf("A.2"));
    expect(findPathRow(restored, 0, 7, true)).toBe(rowOf("F.1"));
  });

  it("leaves a table that still has its typed array alone", () => {
    expect(asPathLocationTable(TABLE)).toBe(TABLE);
  });

  it("refuses what is not a table", () => {
    expect(asPathLocationTable(undefined)).toBeUndefined();
    expect(asPathLocationTable({ values: [] })).toBeUndefined();
    expect(asPathLocationTable("paths")).toBeUndefined();
  });
});
