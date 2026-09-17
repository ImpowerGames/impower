import { describe, expect, test } from "vitest";
import { buildApertures, pairShapes, parsePathData, polygonSelfIntersects, ribbonTrack } from "../src/index";
import type { EdgeTrack, LabelledShape, RibbonTrack } from "../src/index";
import { closedLash, loop, lowerOpen, runtimeProgress, shift, upperOpen } from "./fixtures";

// A closed aperture reports an area at floating-point noise, not exactly zero.
const AREA_ZERO = 1e-6;
const track = (from: string, to: string): RibbonTrack => {
  const r = ribbonTrack(loop(from), loop(to));
  if (!r.ok) throw new Error(r.failure.message);
  return r.track;
};
const edge = (id: string, from: string, to: string, label = "eyelash-left"): EdgeTrack => ({ id, label, track: track(from, to) });

describe("buildApertures", () => {
  test("two open lashes converging on one closed lash form one aperture that closes to zero", () => {
    const r = buildApertures([edge("upper", upperOpen, closedLash), edge("lower", lowerOpen, closedLash)]);
    expect(r.diagnostics).toEqual([]);
    expect(r.apertures).toHaveLength(1);
    const ap = r.apertures[0]!;
    expect(ap.edgeIds).toEqual(["upper", "lower"]);
    const open = ap.area(0);
    expect(open).toBeGreaterThan(1000);
    let prev = Infinity;
    for (const t of runtimeProgress) {
      const a = ap.area(t);
      expect(a, `area at ${t}`).toBeLessThanOrEqual(prev + 1e-6);
      expect(polygonSelfIntersects(ap.loop(t)), `loop at ${t}`).toBe(false);
      prev = a;
    }
    expect(ap.area(1)).toBeLessThan(AREA_ZERO);
  });

  test("the two tracks keep their identities from pairing through to the aperture", () => {
    const shape = (id: string, d: string): LabelledShape => ({ id, label: "eyelash-left", subpaths: parsePathData(d) });
    const pairs = pairShapes([shape("upper", upperOpen), shape("lower", lowerOpen)], [shape("closed", closedLash)]);
    expect(pairs.pairs.map((p) => p.trackId)).toEqual(["closed<>upper", "closed<>lower"]);
    const edges = pairs.pairs.map((p) => ({
      id: p.trackId,
      label: p.from.label,
      track: track(p.from.id === "upper" ? upperOpen : lowerOpen, closedLash),
    }));
    const r = buildApertures(edges);
    expect(r.apertures.map((a) => a.edgeIds)).toEqual([["closed<>upper", "closed<>lower"]]);
  });

  test("two eyes yield two separate apertures", () => {
    const r = buildApertures([
      edge("upper-left", upperOpen, closedLash),
      edge("upper-right", shift(upperOpen, 200, 0), shift(closedLash, 200, 0), "eyelash-right"),
      edge("lower-left", lowerOpen, closedLash),
      edge("lower-right", shift(lowerOpen, 200, 0), shift(closedLash, 200, 0), "eyelash-right"),
    ]);
    expect(r.diagnostics).toEqual([]);
    expect(r.apertures.map((a) => a.edgeIds)).toEqual([
      ["upper-left", "lower-left"],
      ["upper-right", "lower-right"],
    ]);
    for (const ap of r.apertures) {
      expect(ap.area(0)).toBeGreaterThan(1000);
      expect(ap.area(1)).toBeLessThan(AREA_ZERO);
    }
  });

  test("three edges sharing tips are ambiguous and produce no aperture", () => {
    const third = "M0,50 C30,60 70,60 100,50 C70,64 30,64 0,50Z";
    const r = buildApertures([edge("upper", upperOpen, closedLash), edge("lower", lowerOpen, closedLash), edge("extra", third, closedLash)]);
    expect(r.apertures).toEqual([]);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ code: "ambiguous", edgeIds: ["upper", "lower", "extra"] });
  });

  test("a lone edge and edges whose tips do not meet are reported as unpaired", () => {
    const lone = buildApertures([edge("upper", upperOpen, closedLash)]);
    expect(lone.apertures).toEqual([]);
    expect(lone.diagnostics).toEqual([{ code: "unpaired-edge", edgeIds: ["upper"], message: expect.any(String) }]);
    const apart = buildApertures([edge("upper", upperOpen, closedLash), edge("far", shift(lowerOpen, 0, 300), shift(closedLash, 0, 300))]);
    expect(apart.apertures).toEqual([]);
    expect(apart.diagnostics.map((d) => d.code)).toEqual(["unpaired-edge", "unpaired-edge"]);
  });

  test("results are deterministic across input order", () => {
    const a = buildApertures([edge("upper", upperOpen, closedLash), edge("lower", lowerOpen, closedLash)]);
    const b = buildApertures([edge("lower", lowerOpen, closedLash), edge("upper", upperOpen, closedLash)]);
    expect(a.apertures[0]!.area(0.4)).toBeCloseTo(b.apertures[0]!.area(0.4), 6);
  });
});
