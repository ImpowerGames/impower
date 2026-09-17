import { describe, expect, test } from "vitest";
import { RIBBON_DEFAULTS, findTips, morphSubpaths, parsePathData, ribbonTrack, selfIntersects, signedArea } from "../src/index";
import {
  anchors,
  circle,
  closedLash,
  closedLashReversed,
  loop,
  lowerOpen,
  maxDistanceToLoop,
  rotatingClosed,
  rotatingOpen,
  runtimeProgress,
  square,
  tiltedClosed,
  tiltedOpen,
  upperOpen,
} from "./fixtures";

// Tolerances. Endpoint frames are handoff polylines of 48 points blended
// fully onto the authored art, so they should sit on it to within a small
// fraction of a unit; mid-morph frames are checked for topology and the
// prototype's thickness criterion rather than a position.
const ENDPOINT_TOLERANCE = 0.5;
const bakeProgress = Array.from({ length: 8 }, (_, i) => i / 7);

describe("findTips", () => {
  test("finds the two pointed ends of a lash with near-reversal folds", () => {
    const tips = findTips(loop(upperOpen));
    const pts = [tips.p1, tips.p2].sort((a, b) => a[0] - b[0]);
    expect(pts[0]![0]).toBeCloseTo(0, 0);
    expect(pts[1]![0]).toBeCloseTo(100, 0);
    expect(tips.fold1).toBeGreaterThan((160 * Math.PI) / 180);
    expect(tips.fold2).toBeGreaterThan((160 * Math.PI) / 180);
  });

  test("still ranks candidates on a blob, with small folds the method must reject", () => {
    const tips = findTips(loop(circle));
    expect(Math.max(tips.fold1, tips.fold2)).toBeLessThan((30 * Math.PI) / 180);
  });
});

describe("ribbonTrack", () => {
  for (const [name, from, to] of [
    ["upper lash to closed", upperOpen, closedLash],
    ["lower lash to closed", lowerOpen, closedLash],
    ["upper lash to a reversed, re-phased closed lash", upperOpen, closedLashReversed],
    ["tilted lash to its closed pose", tiltedOpen, tiltedClosed],
    ["crease rotating past vertical", rotatingOpen, rotatingClosed],
  ] as const) {
    test(`${name}: endpoints match, no self-intersection at bake or runtime samples, thickness holds`, () => {
      const r = ribbonTrack(loop(from), loop(to));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.track.thickness).toBeGreaterThanOrEqual(RIBBON_DEFAULTS.thicknessRatio);
      expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop(from))).toBeLessThan(ENDPOINT_TOLERANCE);
      expect(maxDistanceToLoop(anchors(r.track.frame(1)), loop(to))).toBeLessThan(ENDPOINT_TOLERANCE);
      for (const t of [...bakeProgress, ...runtimeProgress]) {
        expect(selfIntersects(r.track.frame(t)), `frame ${t}`).toBe(false);
        expect(selfIntersects(r.track.canonical(t)), `canonical ${t}`).toBe(false);
      }
      // Both endpoint loops of the track have the canonical layout.
      expect(r.track.from).toHaveLength(RIBBON_DEFAULTS.anchors);
      expect(r.track.to).toHaveLength(RIBBON_DEFAULTS.anchors);
    });
  }

  test("the winding-and-tip correspondence search is what keeps the rotating crease from pinching", () => {
    const r = ribbonTrack(loop(rotatingOpen), loop(rotatingClosed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lo = Math.min(Math.abs(signedArea(r.track.from)), Math.abs(signedArea(r.track.to)));
    for (const t of [0.25, 0.5, 0.75]) {
      expect(Math.abs(signedArea(r.track.canonical(t))) / lo).toBeGreaterThanOrEqual(RIBBON_DEFAULTS.thicknessRatio);
    }
  });

  test("tips stay at the lash ends throughout", () => {
    const r = ribbonTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) {
      const [a, b] = r.track.tips(t);
      const xs = [a[0], b[0]].sort((x, y) => x - y);
      expect(xs[0]).toBeCloseTo(0, 0);
      expect(xs[1]).toBeCloseTo(100, 0);
    }
  });

  test("edges run tip to tip with the requested point count", () => {
    const r = ribbonTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [e1, e2] = r.track.edges(0, 12);
    expect(e1).toHaveLength(12);
    expect(e2).toHaveLength(12);
    expect(e1[0]).toEqual(e2[0]);
    expect(e1[11]).toEqual(e2[11]);
    // The two edges are the two sides of the ribbon, so their middles differ.
    expect(Math.abs(e1[6]![1] - e2[6]![1])).toBeGreaterThan(5);
  });

  test("a drawing without two tapered tips fails with tips-not-found rather than switching method", () => {
    for (const [from, to] of [
      [circle, closedLash],
      [upperOpen, circle],
      [square, circle],
    ] as const) {
      const r = ribbonTrack(loop(from), loop(to));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failure.code).toBe("tips-not-found");
    }
  });

  test("a quality failure carries the progress values that failed", () => {
    // Force the thickness gate above anything the art can hold.
    const r = ribbonTrack(loop(upperOpen), loop(closedLash), { thicknessRatio: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("thickness");
    expect(r.failure.message).toMatch(/below 10/);
  });

  test("without handoff the frames stay curved canonical loops", () => {
    const r = ribbonTrack(loop(upperOpen), loop(closedLash), { handoff: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.frame(0.5)).toHaveLength(RIBBON_DEFAULTS.anchors);
  });
});

describe("morphSubpaths with the ribbon method", () => {
  test("reports the failing subpath index and never substitutes the shape method", () => {
    const r = morphSubpaths(parsePathData(upperOpen + circle), parsePathData(closedLash + square), { method: "ribbon" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toMatchObject({ code: "tips-not-found", subpath: 1 });
  });

  test("succeeds and labels the method", () => {
    const r = morphSubpaths(parsePathData(upperOpen), parsePathData(closedLash), { method: "ribbon" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.morph.method).toBe("ribbon");
    expect(r.morph.frame(0.5)).toHaveLength(1);
    expect(r.morph.frame(0.5)[0]!.closed).toBe(true);
  });
});
