import { describe, expect, test } from "vitest";
import { contourOverlapsItself, pathContours } from "../../morph/contour";

const LOOP = "M60,60L80,20L120,20L120,120L20,120L20,20L60,20L80,60";

const CURL = "M0.4,0C-16.266666666666666,0.13333333333333333 300.4,-16.400000000000002 950.4,950.4L-1000,1000L-1000,-1000Z";

const WIDE_CURL = "M0,0C150,-60 -50,-60 100,0L100,-100L0,-100Z";

const sliver = (h: number) => `M106,${102 + 2 * h}L108,102L112,102L112,112L102,112L102,102L106,102L108,${102 + 2 * h}Z`;

const line = (p0: [number, number], p1: [number, number]) => ({ p0, c1: p0, c2: p1, p1 });

const only = (d: string) => {
  const contours = pathContours(d);
  expect(contours).toHaveLength(1);
  return contours[0]!;
};

describe("a spread contour", () => {
  test("a path closed only implicitly keeps its last vertex, so its loop is found with or without `Z`", () => {
    expect(contourOverlapsItself(only(LOOP), false)).toBe(true);
    expect(contourOverlapsItself(only(`${LOOP}Z`), false)).toBe(true);
  });

  test("a subpath read from geometry keeps the endpoint of its last segment", () => {
    const points: [number, number][] = [[60, 60], [80, 20], [120, 20], [120, 120], [20, 120], [20, 20], [60, 20], [80, 60]];
    const segments = points.slice(0, -1).map((p, i) => line(p, points[i + 1]!));
    expect(contourOverlapsItself({ segments, closed: false }, false)).toBe(true);
  });

  test("a curve's own loop filled twice and wider than a ten-thousandth of the drawing's size overlaps itself, and under even-odd, where the loop is a hole, it does not", () => {
    expect(contourOverlapsItself(only(WIDE_CURL), false)).toBe(true);
    expect(contourOverlapsItself(only(WIDE_CURL), true)).toBe(false);
  });

  test("a curve's own loop that no circle a ten-thousandth of the drawing's size across fits in reads as touching, though it is longer than that", () => {
    expect(contourOverlapsItself(only(CURL), false)).toBe(false);
    expect(contourOverlapsItself(only(CURL), true)).toBe(false);
  });

  test("an end overshooting its start by a sliver wound with the drawing reads as touching below a ten-thousandth of the drawing's size and overlaps above it", () => {
    expect(contourOverlapsItself(only(sliver(0.0008)), false)).toBe(false);
    expect(contourOverlapsItself(only(sliver(0.0012)), false)).toBe(true);
    expect(contourOverlapsItself(only(sliver(0.0012)), true)).toBe(false);
  });

  test("a contour that crosses itself at a vertex it passes through twice overlaps itself where the loop is filled twice", () => {
    expect(contourOverlapsItself(only("M60,60L70,40L80,20L120,20L120,120L20,120L20,20L60,20L70,40L80,60"), false)).toBe(true);
    expect(contourOverlapsItself(only("M60.3,60.7L70.1,40.3L80.9,20.2L120,20L120,120L20,120L20,20L60.3,20.6L70.1,40.3L80.2,60.9"), false)).toBe(true);
  });

  test("an edge drawn back along itself has no width and reads as touching", () => {
    expect(contourOverlapsItself(only("M0,0L100,0L100,100L50,100L50,40L50,100L0,100Z"), false)).toBe(false);
  });

  test("a simple contour of lines or curves, and a loop that is a hole under even-odd, do not overlap themselves", () => {
    expect(contourOverlapsItself(only("M0,0L10,0L10,10L0,10Z"), false)).toBe(false);
    expect(contourOverlapsItself(only("M0,50C0,20 100,20 100,50C100,80 0,80 0,50Z"), false)).toBe(false);
    expect(contourOverlapsItself(only(LOOP), true)).toBe(false);
  });

  test("a detailed outline is checked in time for a frame: a 128-curve circle in well under one frame", () => {
    const n = 128;
    const k = (4 / 3) * Math.tan(Math.PI / (2 * n));
    const at = (a: number): [number, number] => [100 * Math.cos(a), 100 * Math.sin(a)];
    let d = `M${at(0).join(",")}`;
    for (let i = 0; i < n; i++) {
      const a0 = (2 * Math.PI * i) / n;
      const a1 = (2 * Math.PI * (i + 1)) / n;
      const [x0, y0] = at(a0);
      const [x1, y1] = at(a1);
      d += `C${x0 - k * 100 * Math.sin(a0)},${y0 + k * 100 * Math.cos(a0)} ${x1 + k * 100 * Math.sin(a1)},${y1 - k * 100 * Math.cos(a1)} ${x1},${y1}`;
    }
    const contour = only(`${d}Z`);
    expect(contourOverlapsItself(contour, false)).toBe(false);
    const start = performance.now();
    for (let i = 0; i < 10; i++) contourOverlapsItself(contour, false);
    expect((performance.now() - start) / 10).toBeLessThan(50);
  });
});
