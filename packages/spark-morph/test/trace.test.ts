import { describe, expect, test } from "vitest";
import { selfIntersects, signedArea } from "../src/geometry/cubic";
import { morphSubpaths, nodesTrack, traceTrack, parsePathData } from "../src/index";
import type { Cubic } from "../src/index";
import {
  allStraight,
  anchors,
  blob,
  circle,
  hook,
  hookMirrored,
  loop,
  maxDistanceToLoop,
  offKilterQuad,
  pentagon,
  runtimeProgress,
  scaled,
  sharpCorners,
  square,
  star,
  triangle,
} from "./fixtures";

// Rest-pose frames are the authored anchors plus dissolved nodes that lie
// on the outline; the check samples the outline at 720 points, so its own
// resolution is a fraction of a unit on these hundred-unit fixtures.
const ENDPOINT_TOLERANCE = 0.5;

const reversed = (d: string) => {
  const pts = d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)!;
  return `M${pts.reverse().join("L")}Z`;
};

describe("traceTrack", () => {
  for (const [name, from, to] of [
    ["square to circle", square, circle],
    ["star to circle", star, circle],
    ["circle to star", circle, star],
    ["blob to square", blob, square],
    ["square to star", square, star],
  ] as const) {
    test(`${name}: endpoints match exactly, frames never self-intersect, winding is preserved`, () => {
      const r = traceTrack(loop(from), loop(to));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop(from))).toBeLessThan(ENDPOINT_TOLERANCE);
      expect(maxDistanceToLoop(anchors(r.track.frame(1)), loop(to))).toBeLessThan(ENDPOINT_TOLERANCE);
      const wind = Math.sign(signedArea(loop(from)));
      for (const t of runtimeProgress) {
        const fr = r.track.frame(t);
        expect(selfIntersects(fr), `frame ${t}`).toBe(false);
        expect(Math.sign(signedArea(fr)), `winding ${t}`).toBe(wind);
        expect(fr).toHaveLength(r.track.from.length);
      }
    });
  }

  describe("polygons keep straight edges and sharp corners", () => {
    for (const [name, from, to, corners] of [
      ["square to off-kilter quadrilateral", square, offKilterQuad, [4, 4]],
      ["off-kilter quadrilateral to square", offKilterQuad, square, [4, 4]],
      ["square to triangle", square, triangle, [4, 3]],
      ["triangle to square", triangle, square, [3, 4]],
      ["square to pentagon", square, pentagon, [4, 5]],
      ["pentagon to square", pentagon, square, [5, 4]],
      ["pentagon to triangle", pentagon, triangle, [5, 3]],
    ] as const) {
      test(name, () => {
        const r = traceTrack(loop(from), loop(to));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Every frame is a polygon: no segment ever bows.
        for (const t of runtimeProgress) {
          const fr = r.track.frame(t);
          expect(allStraight(fr), `straight at ${t}`).toBe(true);
          expect(selfIntersects(fr), `simple at ${t}`).toBe(false);
        }
        // The rest poses show exactly the authored corners; extra nodes are
        // dissolved (collinear) there.
        expect(sharpCorners(r.track.frame(0))).toBe(corners[0]);
        expect(sharpCorners(r.track.frame(1))).toBe(corners[1]);
        // Node count is the larger of the two, so nothing is resampled.
        expect(r.track.from.length).toBe(Math.max(corners[0], corners[1]));
      });
    }

    test("same corner counts pair corner to corner, so no corner is ever dissolved", () => {
      const r = traceTrack(loop(square), loop(offKilterQuad));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      for (const t of runtimeProgress) expect(sharpCorners(r.track.frame(t)), `corners at ${t}`).toBe(4);
    });
  });

  test("a target drawn in the opposite winding is reversed to match the source", () => {
    const r = traceTrack(loop(square), loop(reversed(star)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.reversed).toBe(true);
    expect(Math.sign(signedArea(r.track.to))).toBe(Math.sign(signedArea(loop(square))));
  });

  test("curved anchors keep their handles: a still circle morphed to itself rotated is smooth throughout", () => {
    const rotated = "M50,10A40,40 0 0 1 90,50A40,40 0 0 1 50,90A40,40 0 0 1 10,50A40,40 0 0 1 50,10Z";
    const r = traceTrack(loop(circle), loop(rotated));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.travel).toBeLessThan(1e-6);
    for (const t of runtimeProgress) {
      for (const p of anchors(r.track.frame(t))) expect(Math.hypot(p[0] - 50, p[1] - 50)).toBeCloseTo(40, 6);
    }
  });

  test("a correspondence that self-intersects at a checked progress is a reported failure", () => {
    // A square to a bow tie: the target crosses itself, so every pairing
    // crosses before it arrives, whichever rotation or winding is tried.
    const bowTie = "M0,0L100,100L100,0L0,100Z";
    const r = traceTrack(loop(square), loop(bowTie));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("self-intersection");
    expect(r.failure.progress?.length).toBeGreaterThan(0);
    const viaMorph = morphSubpaths(parsePathData(square), parsePathData(bowTie), { method: "trace" });
    expect(viaMorph).toMatchObject({ ok: false, failure: { code: "self-intersection", subpath: 0 } });
  });

  test("the hook pair morphs simply at every runtime sample under the default checks", () => {
    // Some corner-to-corner alignments of this pair cross between the
    // quarter points (at 0.3) or collapse onto themselves mid-way; the
    // default checks reject those and the search settles on one that stays
    // simple at every runtime sample.
    const r = traceTrack(loop(hook), loop(hookMirrored));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) {
      expect(selfIntersects(r.track.frame(t)), `frame ${t}`).toBe(false);
      expect(allStraight(r.track.frame(t))).toBe(true);
    }
    // A single-alignment search with only the mid point checked can still
    // return a pairing that crosses elsewhere, which is what the default
    // eleven points exist to catch.
    const narrow = traceTrack(loop(hook), loop(hookMirrored), { alignments: 1, checkProgress: [0.5] });
    if (narrow.ok) expect(runtimeProgress.some((t) => selfIntersects(narrow.track.frame(t)))).toBe(true);
  });

  test("empty geometry is a structured failure, not an exception", () => {
    expect(traceTrack([], [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
    expect(traceTrack([], loop(square))).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });

  test("a coincident anchor (a zero-length segment) does not break the loop", () => {
    const doubled = "M0,0L100,0L100,0L100,100L0,100Z";
    const hexagon = "M0,0L50,0L100,0L100,100L50,100L0,100Z";
    const r = traceTrack(loop(doubled), loop(hexagon));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) {
      const fr = r.track.frame(t);
      // Every segment starts where the previous one ended.
      fr.forEach((s, i) => {
        const prev = fr[(i - 1 + fr.length) % fr.length]!;
        expect(Math.hypot(s.p0[0] - prev.p1[0], s.p0[1] - prev.p1[1]), `continuity at ${t}`).toBeLessThan(1e-9);
      });
      expect(allStraight(fr)).toBe(true);
    }
    expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop("M0,0L100,0L100,100L0,100Z"))).toBeLessThan(ENDPOINT_TOLERANCE);
  });

  test("two adjacent curves that cross away from their shared anchors are reported", () => {
    // Both endpoints are simple two-curve loops; the pairing crosses itself
    // at progress 0.4. A checker that skipped adjacent curves missed it.
    const from = "M0,0 C0,125 150,25 100,0 C25,150 0,-25 0,0Z";
    const to = "M0,0 C75,-50 0,75 100,0 C150,-25 25,-50 0,0Z";
    const r = traceTrack(loop(from), loop(to));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("self-intersection");
  });

  test("a knot inside a single curve and a retraced edge are both self-intersections", () => {
    // A two-segment loop whose curve loops through itself near its middle:
    // eight chords per curve missed it, sixteen catch it.
    const knotted: Cubic[] = [
      { p0: [-1, 0], c1: [23.812413197010756, -24.03780784457922], c2: [6.782939601689577, -8.574059829115868], p1: [1, 0] },
      { p0: [1, 0], c1: [1, 0], c2: [-1, 0], p1: [-1, 0] },
    ];
    expect(selfIntersects(knotted)).toBe(true);
    const simple: Cubic[] = [
      { p0: [-1, 0], c1: [-1, -2], c2: [1, -2], p1: [1, 0] },
      { p0: [1, 0], c1: [1, 0], c2: [-1, 0], p1: [-1, 0] },
    ];
    const r = nodesTrack(simple, knotted, { handles: "linear", checkProgress: [1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("self-intersection");
    // A loop that retraces its own first edge overlaps itself.
    const retraced = "M0,0L100,0L100,100L0,100L0,0L100,0Z";
    expect(selfIntersects(loop(retraced))).toBe(true);
    expect(traceTrack(loop(square), loop(retraced)).ok).toBe(false);
    expect(nodesTrack(loop(retraced), loop(retraced), { checkProgress: [1] }).ok).toBe(false);
  });

  test("a self-crossing target is rejected at any scale", () => {
    const bowTie = "M0,0L100,100L100,0L0,100Z";
    for (const k of [1e-10, 1e-4, 1, 1e6]) {
      const r = traceTrack(loop(scaled(square, k)), loop(scaled(bowTie, k)));
      expect(r.ok, `scale ${k}`).toBe(false);
    }
  });
});

describe("morphSubpaths with the trace method", () => {
  test("pairs compound subpaths in document order and fails on unequal counts", () => {
    const ok = morphSubpaths(parsePathData(square + circle), parsePathData(circle + square), { method: "trace" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.morph.tracks).toHaveLength(2);
    expect(maxDistanceToLoop(anchors(ok.morph.frame(0)[1]!.segments), loop(circle))).toBeLessThan(ENDPOINT_TOLERANCE);
    expect(maxDistanceToLoop(anchors(ok.morph.frame(1)[1]!.segments), loop(square))).toBeLessThan(ENDPOINT_TOLERANCE);
    const bad = morphSubpaths(parsePathData(square + circle), parsePathData(circle), { method: "trace" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.failure.code).toBe("subpath-count");
  });

  test("empty geometry fails", () => {
    expect(morphSubpaths([], parsePathData(circle), { method: "trace" })).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });
});
