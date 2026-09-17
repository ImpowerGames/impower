import { describe, expect, test } from "vitest";
import { anchorMean } from "../src/geometry/cubic";
import { morphScale, morphSubpaths, parsePathData, serializePathData } from "../src/index";
import { blob, closedLash, loop, square, upperOpen } from "./fixtures";

describe("identical drawings", () => {
  test("stay still under every method, frame for frame", () => {
    for (const method of ["nodes", "taper", "outline"] as const) {
      const r = morphSubpaths(parsePathData(upperOpen), parsePathData(upperOpen), { method });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.morph.method).toBe("still");
      const authored = serializePathData(parsePathData(upperOpen));
      for (const t of [0, 0.3, 0.5, 0.9, 1]) expect(serializePathData(r.morph.frame(t))).toBe(authored);
    }
  });

  test("a still subpath inside a moving compound drawing stays still", () => {
    const r = morphSubpaths(parsePathData(upperOpen + square), parsePathData(closedLash + square), { method: "taper" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.morph.method).toBe("taper");
    const sq = serializePathData(parsePathData(square));
    for (const t of [0, 0.5, 1]) expect(serializePathData([r.morph.frame(t)[1]!])).toBe(sq);
  });

  test("the still tolerance is a fraction of the drawing's size", () => {
    // Half a unit on a hundred-unit lash is within the default half-percent.
    const nudged = upperOpen.replace("C30,5", "C30.4,5.3");
    const r = morphSubpaths(parsePathData(upperOpen), parsePathData(nudged), { method: "outline" });
    expect(r.ok && r.morph.method).toBe("still");
    const strict = morphSubpaths(parsePathData(upperOpen), parsePathData(nudged), { method: "outline", stillTolerance: 0.001 });
    expect(strict.ok && strict.morph.method).toBe("outline");
  });
});

describe("morphScale", () => {
  const drawing = parsePathData(blob);
  const segs = loop(blob);

  test("collapses to the mean of segment start points, which is not the bounding box centre", () => {
    const center = anchorMean(segs);
    const xs = segs.flatMap((s) => [s.p0[0], s.c1[0], s.c2[0], s.p1[0]]);
    const ys = segs.flatMap((s) => [s.p0[1], s.c1[1], s.c2[1], s.p1[1]]);
    const boxCenter: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    expect(Math.hypot(center[0] - boxCenter[0], center[1] - boxCenter[1])).toBeGreaterThan(5);
    const grow = morphScale(drawing, "grow");
    for (const seg of grow.frame(0)[0]!.segments) {
      for (const p of [seg.p0, seg.c1, seg.c2, seg.p1]) expect(p).toEqual(center);
    }
    expect(grow.tracks[0]!.center).toEqual(center);
  });

  test("the zero endpoint is invisible and the full endpoint is the authored drawing exactly", () => {
    const grow = morphScale(drawing, "grow");
    expect(grow.visible(0)).toBe(false);
    expect(grow.visible(0.01)).toBe(true);
    expect(grow.visible(1)).toBe(true);
    expect(grow.frame(1)).toEqual(drawing.map((s) => ({ segments: s.segments, closed: s.closed })));
    const shrink = morphScale(drawing, "shrink");
    expect(shrink.visible(1)).toBe(false);
    expect(shrink.visible(0)).toBe(true);
    expect(shrink.frame(0)).toEqual(drawing);
    expect(shrink.method).toBe("scale");
  });

  test("scales about a fixed centre: every point moves on a straight line through it", () => {
    const grow = morphScale(drawing, "grow");
    const center = anchorMean(segs);
    const half = grow.frame(0.5)[0]!.segments;
    half.forEach((seg, i) => {
      const full = segs[i]!;
      for (const key of ["p0", "c1", "c2", "p1"] as const) {
        expect(seg[key][0]).toBeCloseTo(center[0] + (full[key][0] - center[0]) * 0.5, 9);
        expect(seg[key][1]).toBeCloseTo(center[1] + (full[key][1] - center[1]) * 0.5, 9);
      }
    });
  });
});
