import { describe, expect, test } from "vitest";
import { morphSubpaths, parsePathData, polygonSelfIntersects, selfIntersects, shapeTrack, signedArea } from "../src/index";
import { anchors, blob, circle, loop, maxDistanceToLoop, runtimeProgress, square, star } from "./fixtures";

// Frames are polylines sampled on the authored outline, so the endpoint
// frames lie on it to within the flattening error of a 64-point ring.
const ENDPOINT_TOLERANCE = 0.75;

const reversed = (d: string) => {
  // Reverse a polygon's vertex order to flip its winding.
  const pts = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)!;
  return `M${pts.reverse().join("L")}Z`;
};

describe("shapeTrack", () => {
  for (const [name, from, to] of [
    ["square to circle", square, circle],
    ["star to circle", star, circle],
    ["circle to star", circle, star],
    ["blob to square", blob, square],
    ["square to star", square, star],
  ] as const) {
    test(`${name}: endpoints match, frames never self-intersect, winding is preserved`, () => {
      const r = shapeTrack(loop(from), loop(to));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop(from))).toBeLessThan(ENDPOINT_TOLERANCE);
      expect(maxDistanceToLoop(anchors(r.track.frame(1)), loop(to))).toBeLessThan(ENDPOINT_TOLERANCE);
      const wind = Math.sign(signedArea(loop(from)));
      for (const t of runtimeProgress) {
        const fr = r.track.frame(t);
        expect(selfIntersects(fr), `frame ${t}`).toBe(false);
        expect(Math.sign(signedArea(fr)), `winding ${t}`).toBe(wind);
        expect(fr).toHaveLength(r.track.fromPoints.length);
      }
    });
  }

  test("a target drawn in the opposite winding is reversed to match the source", () => {
    const r = shapeTrack(loop(square), loop(reversed(star)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.reversed).toBe(true);
    expect(Math.sign(signedArea(r.track.to))).toBe(Math.sign(signedArea(loop(square))));
  });

  test("the warp correspondence keeps the star's points paired to their own neighbourhood", () => {
    // Uniform pairing after rotation is the baseline; the warp must not do
    // worse in total travel and must keep every corner of the star present.
    const warp = shapeTrack(loop(star), loop(circle), { correspondence: "warp" });
    const uniform = shapeTrack(loop(star), loop(circle), { correspondence: "uniform" });
    expect(warp.ok && uniform.ok).toBe(true);
    if (!warp.ok || !uniform.ok) return;
    const travel = (a: [number, number][], b: [number, number][]) =>
      a.reduce((acc, p, i) => acc + Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1]) ** 2, 0) / a.length;
    expect(travel(warp.track.fromPoints, warp.track.toPoints)).toBeLessThanOrEqual(travel(uniform.track.fromPoints, uniform.track.toPoints) + 1e-6);
    for (const corner of loop(star).map((s) => s.p0)) {
      expect(maxDistanceToLoop([corner], warp.track.from)).toBeLessThan(ENDPOINT_TOLERANCE);
    }
  });

  test("the sample count is honoured and frames stay consistent", () => {
    const r = shapeTrack(loop(square), loop(circle), { samples: 16, correspondence: "uniform" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.fromPoints).toHaveLength(16);
    expect(polygonSelfIntersects(r.track.frame(0.5).map((s) => s.p0))).toBe(false);
  });

  test("a correspondence that self-intersects at a checked progress is a reported failure", () => {
    // A C-shaped hook morphing to its mirror image folds through itself
    // halfway under either correspondence: a deterministic method failure
    // the caller can tell apart from a method substitution.
    const hook = "M0,0L100,0L100,20L20,20L20,80L100,80L100,100L0,100Z";
    const mirrored = "M100,0L0,0L0,20L80,20L80,80L0,80L0,100L100,100Z";
    const uniform = shapeTrack(loop(hook), loop(mirrored), { correspondence: "uniform", checkProgress: [0.5] });
    expect(uniform.ok).toBe(false);
    if (uniform.ok) return;
    expect(uniform.failure.code).toBe("self-intersection");
    expect(uniform.failure.progress).toEqual([0.5]);
    const warp = shapeTrack(loop(hook), loop(mirrored));
    expect(warp.ok).toBe(false);
    if (warp.ok) return;
    expect(warp.failure.code).toBe("self-intersection");
    const viaMorph = morphSubpaths(parsePathData(hook), parsePathData(mirrored), { method: "shape" });
    expect(viaMorph).toMatchObject({ ok: false, failure: { code: "self-intersection", subpath: 0 } });
  });
});

describe("morphSubpaths with the shape method", () => {
  test("pairs compound subpaths in document order and fails on unequal counts", () => {
    const ok = morphSubpaths(parsePathData(square + circle), parsePathData(circle + square), { method: "shape" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.morph.tracks).toHaveLength(2);
    expect(maxDistanceToLoop(anchors(ok.morph.frame(0)[1]!.segments), loop(circle))).toBeLessThan(ENDPOINT_TOLERANCE);
    expect(maxDistanceToLoop(anchors(ok.morph.frame(1)[1]!.segments), loop(square))).toBeLessThan(ENDPOINT_TOLERANCE);
    const bad = morphSubpaths(parsePathData(square + circle), parsePathData(circle), { method: "shape" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.failure.code).toBe("subpath-count");
  });

  test("empty geometry fails", () => {
    expect(morphSubpaths([], parsePathData(circle), { method: "shape" })).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });
});
