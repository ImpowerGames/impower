// #651 — the path-location table over a JSON transport.
//
// The VS Code extension pulls the whole program from the language server over
// JSON-RPC, which has no typed arrays: the table's block of ranges arrives as
// an object keyed by position. `asPathLocationTable` restores it, and every
// lookup has to answer exactly as it did before the round trip.

import { describe, expect, it } from "vitest";
import {
  asPathLocationTable,
  findPathRow,
  locationAtRow,
  pathLocation,
  pathLocationTableOf,
  scriptRowRange,
} from "../../compiler/utils/pathLocationTable";

const TABLE = pathLocationTableOf({
  "A.0": [0, 0, 0, 0, 8],
  "A.1": [0, 2, 0, 3, 4],
  "A.2": [0, 6, 2, 6, 9],
  "B.0": [1, 0, 0, 1, 5],
  "B.1": [1, 4, 0, 4, 7],
});

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
      }
    }
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
