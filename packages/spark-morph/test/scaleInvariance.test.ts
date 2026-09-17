import { describe, expect, test } from "vitest";
import { buildApertures, morphSubpaths, nodesTrack, outlineTrack, parsePathData, serializePathData, taperTrack } from "../src/index";
import type { MorphMethod, Subpath } from "../src/index";
import {
  circle,
  closedLash,
  loop,
  lowerOpen,
  offKilterQuad,
  oneCusp,
  oneCuspNarrow,
  roundedClosed,
  roundedOpen,
  rotatingClosed,
  rotatingOpen,
  scaled,
  square,
  star,
  triangle,
  upperOpen,
} from "./fixtures";

// Every tolerance is a fraction of the drawing's own size, so the same art
// at a hundredth or a hundred times the scale (and far beyond) must produce
// the same outcome: the same success or failure code, the same
// correspondence, the same frames once scaled back, the same aperture
// pairing. A tolerance that were still an absolute number of user units
// would break one end of this range.
const SCALES = [1e-6, 0.01, 1, 100, 1e6];

/** A frame scaled back to unit scale and serialised at a fixed precision. */
const normalized = (frame: Subpath[], k: number): string =>
  serializePathData(
    frame.map((s) => ({
      closed: s.closed,
      segments: s.segments.map((c) => ({
        p0: [c.p0[0] / k, c.p0[1] / k] as [number, number],
        c1: [c.c1[0] / k, c.c1[1] / k] as [number, number],
        c2: [c.c2[0] / k, c.c2[1] / k] as [number, number],
        p1: [c.p1[0] / k, c.p1[1] / k] as [number, number],
      })),
    })),
    4,
  );

describe("scale invariance", () => {
  const cases: [string, string, string, MorphMethod][] = [
    ["taper: upper lash", upperOpen, closedLash, "taper"],
    ["taper: rotating crease", rotatingOpen, rotatingClosed, "taper"],
    ["taper: rounded tips", roundedOpen, roundedClosed, "taper"],
    ["taper: one cusp (fails)", oneCusp, oneCuspNarrow, "taper"],
    ["taper: circle (fails)", circle, closedLash, "taper"],
    ["outline: square to star", square, star, "outline"],
    ["outline: star to circle", star, circle, "outline"],
    ["outline: square to triangle", square, triangle, "outline"],
    ["nodes: square to quadrilateral", square, offKilterQuad, "nodes"],
    ["still: identical lashes", upperOpen, upperOpen, "taper"],
  ];
  for (const [name, from, to, method] of cases) {
    test(`${name}: the same outcome and the same frames at every scale`, () => {
      const results = SCALES.map((k) => {
        const r = morphSubpaths(parsePathData(scaled(from, k)), parsePathData(scaled(to, k)), { method });
        return r.ok ? { outcome: `ok:${r.morph.method}`, mid: normalized(r.morph.frame(0.5), k) } : { outcome: `fail:${r.failure.code}`, mid: "" };
      });
      const outcomes = results.map((r) => r.outcome);
      expect(new Set(outcomes).size, outcomes.join(" | ")).toBe(1);
      // The mid frame, scaled back to unit scale, is the same drawing.
      const mids = results.map((r) => r.mid);
      for (const mid of mids) expect(mid).toBe(mids[2]);
    });
  }

  test("nodes chooses the same correspondence at every scale", () => {
    const rotatedStart = "M85,90L95,5L5,15L15,80Z";
    const picks = SCALES.map((k) => {
      const r = nodesTrack(loop(scaled(square, k)), loop(scaled(rotatedStart, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return `${r.track.reversed}:${r.track.rotation}`;
    });
    expect(new Set(picks).size, picks.join(" | ")).toBe(1);
  });

  test("outline chooses the same alignment at every scale", () => {
    const picks = SCALES.map((k) => {
      const r = outlineTrack(loop(scaled(star, k)), loop(scaled(circle, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return `${r.track.reversed}:${r.track.phase.toFixed(6)}:${r.track.from.length}`;
    });
    expect(new Set(picks).size, picks.join(" | ")).toBe(1);
  });

  test("taper thickness ratios agree across scales", () => {
    const ratios = SCALES.map((k) => {
      const r = taperTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return r.track.thickness;
    });
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[2]!, 3);
  });

  test("aperture pairing and relative area agree across scales", () => {
    const areas = SCALES.map((k) => {
      const u = taperTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      const l = taperTrack(loop(scaled(lowerOpen, k)), loop(scaled(closedLash, k)));
      if (!u.ok || !l.ok) throw new Error("taper failed");
      const r = buildApertures([
        { id: "u", label: "l", track: u.track },
        { id: "l", label: "l", track: l.track },
      ]);
      expect(r.diagnostics).toEqual([]);
      expect(r.apertures).toHaveLength(1);
      const open = r.apertures[0]!.area(0);
      expect(open).toBeGreaterThan(0);
      return [r.apertures[0]!.area(0.5) / open, r.apertures[0]!.area(1) / open];
    });
    for (const [half, closed] of areas) {
      expect(half).toBeCloseTo(areas[2]![0]!, 3);
      expect(closed).toBeLessThan(1e-6);
    }
  });
});
