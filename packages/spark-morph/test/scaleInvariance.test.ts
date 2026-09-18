import { describe, expect, test } from "vitest";
import { isLine } from "../src/geometry/cubic";
import { smoothAnchors } from "../src/methods/bend";
import { buildApertures, morphSubpaths, matchTrack, traceTrack, parsePathData, serializePathData, bendTrack } from "../src/index";
import type { MorphMethod, Subpath, BendTrack } from "../src/index";
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
const SCALES = [1e-9, 1e-6, 0.01, 1, 100, 1e6, 1e9];
const UNIT = 3;

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
    ["bend: upper lash", upperOpen, closedLash, "bend"],
    ["bend: rotating crease", rotatingOpen, rotatingClosed, "bend"],
    ["bend: rounded tips", roundedOpen, roundedClosed, "bend"],
    ["bend: one cusp (fails)", oneCusp, oneCuspNarrow, "bend"],
    ["bend: circle (fails)", circle, closedLash, "bend"],
    ["trace: square to star", square, star, "trace"],
    ["trace: star to circle", star, circle, "trace"],
    ["trace: square to triangle", square, triangle, "trace"],
    ["match: square to quadrilateral", square, offKilterQuad, "match"],
    ["still: identical lashes", upperOpen, upperOpen, "bend"],
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
      for (const mid of mids) expect(mid).toBe(mids[UNIT]);
    });
  }

  test("match chooses the same correspondence at every scale", () => {
    const rotatedStart = "M85,90L95,5L5,15L15,80Z";
    const picks = SCALES.map((k) => {
      const r = matchTrack(loop(scaled(square, k)), loop(scaled(rotatedStart, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return `${r.track.reversed}:${r.track.rotation}`;
    });
    expect(new Set(picks).size, picks.join(" | ")).toBe(1);
  });

  test("trace chooses the same alignment at every scale", () => {
    const picks = SCALES.map((k) => {
      const r = traceTrack(loop(scaled(star, k)), loop(scaled(circle, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return `${r.track.reversed}:${r.track.phase.toFixed(6)}:${r.track.from.length}`;
    });
    expect(new Set(picks).size, picks.join(" | ")).toBe(1);
  });

  test("bend thickness ratios agree across scales", () => {
    const ratios = SCALES.map((k) => {
      const r = bendTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      if (!r.ok) throw new Error(r.failure.message);
      return r.track.thickness;
    });
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[UNIT]!, 3);
  });

  test("bend frames without the handoff blend agree across scales", () => {
    const mids = SCALES.map((k) => {
      const r = bendTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)), { handoff: false });
      if (!r.ok) throw new Error(r.failure.message);
      return normalized([{ segments: r.track.frame(0.25), closed: true }], k);
    });
    for (const mid of mids) expect(mid).toBe(mids[UNIT]);
  });

  test("a curve stays a curve and smoothing keeps its effect at a tiny scale", () => {
    // Straightness is judged against the segment's own chord, so a curved
    // lash segment at 1e-12 scale is still a curve and serialises as one.
    const tiny = loop(scaled(upperOpen, 1e-12));
    expect(tiny.every((s) => !isLine(s))).toBe(true);
    expect(serializePathData(parsePathData(scaled(upperOpen, 1e-12)))).toContain("C");
    // Smoothing nearly smooth nodes moves handles identically at any scale.
    // The top node of this ring has its outgoing handle nudged 5.7 degrees
    // off collinear.
    const noisy = "M0,50 C0,20 30,0 50,0 C70,2 100,20 100,50 C100,80 70,100 50,100 C30,100 0,80 0,50Z";
    const unit = smoothAnchors(loop(noisy));
    for (const k of [1e-9, 1e9]) {
      const scaledBack = normalized([{ segments: smoothAnchors(loop(scaled(noisy, k))), closed: true }], k);
      expect(scaledBack).toBe(normalized([{ segments: unit, closed: true }], 1));
    }
    expect(normalized([{ segments: unit, closed: true }], 1)).not.toBe(normalized([{ segments: loop(noisy), closed: true }], 1));
  });

  test("an open aperture keeps its area at a tiny scale", () => {
    // Synthetic edges 100k units apart at scale k: the closure test is
    // relative to the edges' own extent, so no unit floor closes it.
    for (const k of [1e-12, 1, 1e12]) {
      const edge = (offset: number): BendTrack => ({
        from: [],
        to: [],
        canonicalFrom: [],
        canonicalTo: [],
        n1: 1,
        thickness: 1,
        frame: () => [],
        canonical: () => [],
        tips: () => [
          [0, 50 * k],
          [100 * k, 50 * k],
        ],
        edges: (_t, points) => {
          const line = (y: number): [number, number][] => Array.from({ length: points }, (_, i) => [(100 * k * i) / (points - 1), y]);
          return [line(50 * k + offset * k), line(50 * k + (offset + 4) * k)];
        },
      });
      const r = buildApertures([
        { id: "u", label: "l", track: edge(-20) },
        { id: "l", label: "l", track: edge(20) },
      ]);
      expect(r.diagnostics).toEqual([]);
      expect(r.apertures).toHaveLength(1);
      // Facing lines at 34 and 70 units (scaled), 100 wide: area 3600.
      expect(r.apertures[0]!.area(0.5) / (k * k)).toBeCloseTo(3600, 3);
    }
  });

  test("aperture pairing and relative area agree across scales", () => {
    const areas = SCALES.map((k) => {
      const u = bendTrack(loop(scaled(upperOpen, k)), loop(scaled(closedLash, k)));
      const l = bendTrack(loop(scaled(lowerOpen, k)), loop(scaled(closedLash, k)));
      if (!u.ok || !l.ok) throw new Error("bend failed");
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
      expect(half).toBeCloseTo(areas[UNIT]![0]!, 3);
      expect(closed).toBeLessThan(1e-6);
    }
  });
});
