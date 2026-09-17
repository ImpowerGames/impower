import { describe, expect, test } from "vitest";
import { ArcLoop, basicShapeToPathData, basicShapeToSubpaths, parsePathData, serializePathData, signedArea } from "../src/index";
import { circle, loop, maxDistanceToLoop } from "./fixtures";

describe("parsePathData", () => {
  test("promotes lines, quadratics, smooth curves and relative commands to absolute cubics", () => {
    const subs = parsePathData("m10,10 l10,0 q5,5 10,0 t10,0 c1,1 2,2 3,3 s1,1 2,2 h5 v5 z");
    expect(subs).toHaveLength(1);
    const s = subs[0]!;
    expect(s.closed).toBe(true);
    expect(s.segments.map((c) => c.p1)).toEqual([
      [20, 10],
      [30, 10],
      [40, 10],
      [43, 13],
      [45, 15],
      [50, 15],
      [50, 20],
      [10, 10],
    ]);
    // Quadratic control (25, 15) becomes cubic handles two thirds of the way.
    expect(s.segments[1]!.c1).toEqual([20 + (2 / 3) * 5, 10 + (2 / 3) * 5]);
    // The smooth quadratic reflects the previous control point.
    expect(s.segments[2]!.c1[1]).toBeCloseTo(10 - (2 / 3) * 5, 9);
  });

  test("reads run-together numbers and exponents", () => {
    const subs = parsePathData("M1.5.5L-1-2 1e1,2E0");
    expect(subs[0]!.segments.map((c) => c.p1)).toEqual([
      [-1, -2],
      [10, 2],
    ]);
    expect(subs[0]!.segments[0]!.p0).toEqual([1.5, 0.5]);
  });

  test("splits subpaths at every move and records which close", () => {
    const subs = parsePathData("M0,0L10,0L10,10ZM20,20L30,20M40,40L50,50Z");
    expect(subs.map((s) => [s.segments.length, s.closed])).toEqual([
      [3, true],
      [1, false],
      [2, true],
    ]);
  });

  test("converts arcs into cubics that stay on the circle", () => {
    const segs = loop(circle);
    expect(segs).toHaveLength(4);
    const arc = new ArcLoop(segs);
    for (let i = 0; i < 100; i++) {
      const p = arc.pointAt(i / 100);
      expect(Math.hypot(p[0] - 50, p[1] - 50)).toBeCloseTo(40, 1);
    }
    expect(Math.abs(signedArea(segs))).toBeCloseTo(Math.PI * 40 * 40, -2);
  });

  test("handles relative, rotated and large arcs", () => {
    const subs = parsePathData("M10,10a20,10 30 1 0 10,10");
    expect(subs[0]!.segments.length).toBeGreaterThanOrEqual(2);
    const last = subs[0]!.segments[subs[0]!.segments.length - 1]!;
    expect(last.p1).toEqual([20, 20]);
  });
});

describe("serializePathData", () => {
  test("round-trips through the parser", () => {
    const d = "M0,50C30,5 70,5 100,50L70,25L30,25Z";
    const once = serializePathData(parsePathData(d));
    expect(once).toBe("M0,50C30,5 70,5 100,50L70,25L30,25L0,50Z");
    expect(serializePathData(parsePathData(once))).toBe(once);
  });

  test("keeps the requested precision and trims zeros", () => {
    const d = serializePathData([{ segments: [{ p0: [0.123456, 1], c1: [0.123456, 1], c2: [2.5, 3.999], p1: [2.5, 3.999] }], closed: false }], 3);
    expect(d).toBe("M0.123,1L2.5,3.999");
  });
});

describe("basic shapes", () => {
  test("rect, rounded rect, circle, ellipse, line, polyline and polygon become paths", () => {
    expect(basicShapeToPathData({ kind: "rect", x: 1, y: 2, width: 3, height: 4 })).toBe("M1,2H4V6H1Z");
    expect(basicShapeToPathData({ kind: "line", x1: 1, y1: 2, x2: 3, y2: 4 })).toBe("M1,2L3,4");
    expect(basicShapeToPathData({ kind: "polygon", points: "0,0 10,0 10,10" })).toBe("M0,0L10,0L10,10Z");
    expect(basicShapeToPathData({ kind: "polyline", points: [0, 0, 10, 0] })).toBe("M0,0L10,0");
    const rounded = basicShapeToSubpaths({ kind: "rect", x: 0, y: 0, width: 100, height: 50, rx: 10 });
    expect(rounded[0]!.closed).toBe(true);
    expect(Math.abs(signedArea(rounded[0]!.segments))).toBeCloseTo(100 * 50 - (4 - Math.PI) * 100, -1);
    const ellipse = basicShapeToSubpaths({ kind: "ellipse", cx: 50, cy: 50, rx: 40, ry: 20 });
    expect(Math.abs(signedArea(ellipse[0]!.segments))).toBeCloseTo(Math.PI * 40 * 20, -1);
    const c = basicShapeToSubpaths({ kind: "circle", cx: 50, cy: 50, r: 40 });
    expect(maxDistanceToLoop(c[0]!.segments.map((s) => s.p0), loop(circle))).toBeLessThan(0.05);
  });
});
