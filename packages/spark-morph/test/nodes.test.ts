import { describe, expect, test } from "vitest";
import { lerpLoopsAngular, selfIntersects } from "../src/geometry/cubic";
import { morphSubpaths, nodesTrack, parsePathData, serializePathData } from "../src/index";
import type { Cubic } from "../src/index";
import { allStraight, anchors, closedLash, loop, offKilterQuad, runtimeProgress, sharpCorners, square, triangle, upperOpen } from "./fixtures";

describe("nodesTrack", () => {
  test("pairs node with node: a square to an off-kilter quadrilateral stays a straight-edged quadrilateral", () => {
    const r = nodesTrack(loop(square), loop(offKilterQuad));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.reversed).toBe(false);
    expect(r.track.rotation).toBe(0);
    for (const t of runtimeProgress) {
      const fr = r.track.frame(t);
      expect(allStraight(fr), `straight at ${t}`).toBe(true);
      expect(sharpCorners(fr), `corners at ${t}`).toBe(4);
      expect(selfIntersects(fr)).toBe(false);
    }
    // Each corner travels on a straight line to its own counterpart.
    const half = anchors(r.track.frame(0.5));
    anchors(loop(square)).forEach((a, i) => {
      const b = anchors(loop(offKilterQuad))[i]!;
      expect(half[i]![0]).toBeCloseTo((a[0] + b[0]) / 2, 9);
      expect(half[i]![1]).toBeCloseTo((a[1] + b[1]) / 2, 9);
    });
  });

  test("the rest poses are the authored drawings exactly", () => {
    const r = nodesTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializePathData([{ segments: r.track.frame(0), closed: true }])).toBe(serializePathData(parsePathData(upperOpen)));
    expect(serializePathData([{ segments: r.track.frame(1), closed: true }])).toBe(serializePathData(parsePathData(closedLash)));
  });

  test("a target exported with the opposite winding or a rotated start still pairs as drawn", () => {
    // The same quadrilateral, reversed and started at its third corner.
    const quadReversedRotated = "M85,90L95,5L5,15L15,80Z";
    const r = nodesTrack(loop(square), loop(quadReversedRotated));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.reversed).toBe(true);
    const direct = nodesTrack(loop(square), loop(offKilterQuad));
    if (!direct.ok) return;
    expect(serializePathData([{ segments: r.track.frame(0.5), closed: true }])).toBe(
      serializePathData([{ segments: direct.track.frame(0.5), closed: true }]),
    );
  });

  test("smooth nodes stay smooth: handles rotate rather than kink", () => {
    const r = nodesTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) expect(selfIntersects(r.track.frame(t))).toBe(false);
    // Angular blending keeps handle lengths between the endpoints' lengths.
    const len = (segs: ReturnType<typeof loop>, i: number) => Math.hypot(segs[i]!.c1[0] - segs[i]!.p0[0], segs[i]!.c1[1] - segs[i]!.p0[1]);
    const l0 = len(loop(upperOpen), 0),
      l1 = len(loop(closedLash), 0),
      lm = len(r.track.frame(0.5), 0);
    expect(lm).toBeCloseTo((l0 + l1) / 2, 6);
  });

  test("a different node count is a structured failure", () => {
    const r = nodesTrack(loop(square), loop(triangle));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("node-count");
    expect(morphSubpaths(parsePathData(square), parsePathData(triangle), { method: "nodes" })).toMatchObject({
      ok: false,
      failure: { code: "node-count", subpath: 0 },
    });
  });

  test("empty geometry is a structured failure, not an exception", () => {
    expect(nodesTrack([], [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });

  test("self-intersection is reported only when the caller asks for the check", () => {
    // A square to a bow tie: the target crosses itself, so the artist's
    // pairing crosses before it arrives.
    const bowTie = "M0,0L100,100L100,0L0,100Z";
    const unchecked = nodesTrack(loop(square), loop(bowTie));
    expect(unchecked.ok).toBe(true);
    if (unchecked.ok) expect(selfIntersects(unchecked.track.frame(0.9))).toBe(true);
    const checked = nodesTrack(loop(square), loop(bowTie), { checkProgress: [0.5, 0.9] });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.failure.code).toBe("self-intersection");
    expect(checked.failure.progress).toContain(0.9);
    expect(morphSubpaths(parsePathData(square), parsePathData(bowTie), { method: "nodes", nodes: { checkProgress: [0.9] } })).toMatchObject({
      ok: false,
      failure: { code: "self-intersection", subpath: 0 },
    });
  });

  test("a smooth node turning exactly 180 degrees keeps both handles collinear mid-morph", () => {
    // The node at (50, 0) is smooth in both loops with its handles reversed
    // between them: outgoing [1, 0] becomes [-1, 0] and incoming [-1, 0]
    // becomes [1, 0]. Each handle's shortest rotation is a tie, and both
    // must resolve the same way or the node kinks into a cusp.
    const a: Cubic[] = [
      { p0: [50, 0], c1: [60, 0], c2: [100, 40], p1: [100, 50] },
      { p0: [100, 50], c1: [100, 100], c2: [0, 100], p1: [0, 50] },
      { p0: [0, 50], c1: [0, 40], c2: [40, 0], p1: [50, 0] },
    ];
    const b: Cubic[] = [
      { p0: [50, 0], c1: [40, 0], c2: [100, 40], p1: [100, 50] },
      { p0: [100, 50], c1: [100, 100], c2: [0, 100], p1: [0, 50] },
      { p0: [0, 50], c1: [0, 40], c2: [60, 0], p1: [50, 0] },
    ];
    for (const t of [0.25, 0.5, 0.75]) {
      const fr = lerpLoopsAngular(a, b, t);
      const node = fr[0]!.p0;
      const hOut = [fr[0]!.c1[0] - node[0], fr[0]!.c1[1] - node[1]];
      const hIn = [fr[2]!.c2[0] - node[0], fr[2]!.c2[1] - node[1]];
      const cross = hOut[0]! * hIn[1]! - hOut[1]! * hIn[0]!;
      const dot = hOut[0]! * hIn[0]! + hOut[1]! * hIn[1]!;
      expect(Math.abs(cross), `at ${t}`).toBeLessThan(1e-6);
      expect(dot, `at ${t}`).toBeLessThan(0);
    }
  });

  test("a seam within the tolerance does not become an extra node at any scale", () => {
    for (const k of [0.01, 1, 100]) {
      const nearly = `M0,0L${k * 100},0L0,${k * 100}L${k * 0.001},0`;
      const target = `M0,0L${k * 90},0L0,${k * 100}Z`;
      const r = nodesTrack(loop(nearly), loop(target));
      expect(r.ok, `scale ${k}`).toBe(true);
      if (r.ok) expect(r.track.from).toHaveLength(3);
    }
  });
});
