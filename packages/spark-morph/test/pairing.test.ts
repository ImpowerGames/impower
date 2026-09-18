import { describe, expect, test } from "vitest";
import { pairShapes, parsePathData, shapePosition, trackIdFor } from "../src/index";
import type { LabelledShape } from "../src/index";
import { blob, closedLash, lowerOpen, shift, upperOpen } from "./fixtures";

const shape = (id: string, label: string, d: string): LabelledShape => ({ id, label, subpaths: parsePathData(d) });

describe("pairShapes", () => {
  test("pairs shapes with the same nonempty label and never pairs empty labels", () => {
    const r = pairShapes(
      [shape("a", "eyelash-left", upperOpen), shape("x", "", upperOpen)],
      [shape("b", "eyelash-left", closedLash), shape("y", "", closedLash)],
    );
    expect(r.pairs.map((p) => [p.from.id, p.to.id, p.shared])).toEqual([["a", "b", false]]);
    expect(r.unpaired.map((u) => [u.side, u.shape.id, u.reason])).toEqual([
      ["from", "x", "empty-label"],
      ["to", "y", "empty-label"],
    ]);
    expect(r.diagnostics).toEqual([]);
  });

  test("pairs one to many when one side is single, keeping each track's identity", () => {
    const r = pairShapes(
      [shape("upper", "eyelash-left", upperOpen), shape("lower", "eyelash-left", lowerOpen)],
      [shape("closed", "eyelash-left", closedLash)],
    );
    expect(r.pairs.map((p) => [p.trackId, p.shared])).toEqual([
      ["closed<>upper", true],
      ["closed<>lower", true],
    ]);
    expect(r.unpaired).toEqual([]);
  });

  test("track ids are the same in the reverse direction", () => {
    const a = shape("upper", "l", upperOpen),
      b = shape("closed", "l", closedLash);
    expect(pairShapes([a], [b]).pairs[0]!.trackId).toBe(pairShapes([b], [a]).pairs[0]!.trackId);
    expect(trackIdFor(a, b)).toBe(trackIdFor(b, a));
  });

  test("equal counts pair by nearest position deterministically", () => {
    const from = [shape("l1", "lash", upperOpen), shape("r1", "lash", shift(upperOpen, 200, 0))];
    const to = [shape("r2", "lash", shift(closedLash, 200, 0)), shape("l2", "lash", closedLash)];
    const r = pairShapes(from, to);
    expect(r.pairs.map((p) => [p.from.id, p.to.id]).sort()).toEqual([
      ["l1", "l2"],
      ["r1", "r2"],
    ]);
    // Reordering the inputs does not change who pairs with whom.
    const again = pairShapes(from.slice().reverse(), to.slice().reverse());
    expect(again.pairs.map((p) => p.trackId).sort()).toEqual(r.pairs.map((p) => p.trackId).sort());
  });

  test("ties resolve by input order", () => {
    const from = [shape("a", "dot", upperOpen), shape("b", "dot", upperOpen)];
    const to = [shape("c", "dot", upperOpen), shape("d", "dot", upperOpen)];
    expect(pairShapes(from, to).pairs.map((p) => [p.from.id, p.to.id])).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  test("unequal nonsingle counts leave every shape of that label unpaired with a diagnostic", () => {
    const r = pairShapes(
      [shape("a", "lash", upperOpen), shape("b", "lash", lowerOpen)],
      [shape("c", "lash", closedLash), shape("d", "lash", closedLash), shape("e", "lash", closedLash)],
    );
    expect(r.pairs).toEqual([]);
    expect(r.unpaired.map((u) => u.shape.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.unpaired.every((u) => u.reason === "count-mismatch")).toBe(true);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ label: "lash", fromCount: 2, toCount: 3 });
  });

  test("a label present on one side only is unpaired without a diagnostic", () => {
    const r = pairShapes([shape("a", "brow", upperOpen)], []);
    expect(r.unpaired).toEqual([{ side: "from", shape: expect.objectContaining({ id: "a" }), reason: "no-counterpart" }]);
    expect(r.diagnostics).toEqual([]);
  });

  test("position is the mean of segment start points, not the bounding box centre", () => {
    const s = shape("blob", "blob", blob);
    const starts = s.subpaths[0]!.segments.map((c) => c.p0);
    const mean = [starts.reduce((a, p) => a + p[0], 0) / starts.length, starts.reduce((a, p) => a + p[1], 0) / starts.length];
    expect(shapePosition(s)).toEqual(mean);
    expect(shapePosition(s)).not.toEqual([50, 40]);
  });
});
