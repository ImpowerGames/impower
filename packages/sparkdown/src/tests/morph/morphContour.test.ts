import { describe, expect, test } from "vitest";
import { contourPoints, overlapsItself, pathContours } from "../../morph/contour";

const LOOP = "M60,60L80,20L120,20L120,120L20,120L20,20L60,20L80,60";

const line = (p0: [number, number], p1: [number, number]) => ({ p0, c1: p0, c2: p1, p1 });

describe("a spread contour", () => {
  test("a path closed only implicitly keeps its last vertex, so its loop is found with or without `Z`", () => {
    const open = pathContours(LOOP);
    const closed = pathContours(`${LOOP}Z`);
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveLength(8);
    expect(open[0]).toEqual(closed[0]);
    expect(overlapsItself(open[0]!, false)).toBe(true);
    expect(overlapsItself(closed[0]!, false)).toBe(true);
  });

  test("a subpath read from geometry keeps the endpoint of its last segment", () => {
    const points: [number, number][] = [[60, 60], [80, 20], [120, 20], [120, 120], [20, 120], [20, 20], [60, 20], [80, 60]];
    const segments = points.slice(0, -1).map((p, i) => line(p, points[i + 1]!));
    const flat = contourPoints({ segments, closed: false });
    expect(flat).toEqual(points);
    expect(overlapsItself(flat, false)).toBe(true);
  });

  test("a simple contour, and a loop that is a hole under even-odd, do not overlap themselves", () => {
    expect(overlapsItself(pathContours("M0,0L10,0L10,10L0,10Z")[0]!, false)).toBe(false);
    expect(overlapsItself(pathContours(LOOP)[0]!, true)).toBe(false);
  });
});
