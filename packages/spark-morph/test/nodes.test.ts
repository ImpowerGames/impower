import { describe, expect, test } from "vitest";
import { selfIntersects } from "../src/geometry/cubic";
import { morphSubpaths, nodesTrack, parsePathData, serializePathData } from "../src/index";
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
    // A bow tie: the artist's own pairing crosses at the middle.
    const a = "M0,0L100,0L100,100L0,100Z",
      b = "M100,100L0,100L0,0L100,0Z";
    expect(nodesTrack(loop(a), loop(b)).ok).toBe(true);
  });
});
