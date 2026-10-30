import { describe, expect, test } from "vitest";
import { ArcLoop, cubicDoublePoint, cubicKnots, dist, evalCubic } from "../src/geometry/cubic";
import { unknot } from "../src/methods/bend";
import { bendTrack } from "../src/index";
import type { Cubic, Point } from "../src/index";
import {
  closedLash,
  closedLashReversed,
  loop,
  roundedClosed,
  roundedOpen,
  tiltedClosed,
  tiltedOpen,
  upperOpen,
} from "./fixtures";

const STEPS = 100;
const DEPTH = 28;
const JUMP_TOLERANCE = 1e-4;

const points = (frame: { p0: Point }[]): Point[] => frame.map((c) => c.p0);
const apart = (a: Point[], b: Point[]): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(a[i]![0] - b[i]![0], a[i]![1] - b[i]![1]));
  return m;
};

function worstJump(frameAt: (t: number) => Point[]): { jump: number; at: number } {
  let worst = { jump: 0, at: 0 };
  let prev = frameAt(0);
  for (let k = 0; k < STEPS; k++) {
    const next = frameAt((k + 1) / STEPS);
    let lo = k / STEPS,
      hi = (k + 1) / STEPS,
      a = prev,
      b = next;
    for (let i = 0; i < DEPTH; i++) {
      const m = (lo + hi) / 2,
        pm = frameAt(m);
      if (apart(a, pm) >= apart(pm, b)) {
        hi = m;
        b = pm;
      } else {
        lo = m;
        a = pm;
      }
    }
    const jump = apart(a, b);
    if (jump > worst.jump) worst = { jump, at: lo };
    prev = next;
  }
  return worst;
}

describe("ArcLoop.fractionAt", () => {
  test("names the fraction at which pointAt reaches a segment's local parameter", () => {
    for (const L of [loop(upperOpen), loop(roundedOpen)]) {
      const arc = new ArcLoop(L);
      L.forEach((s, k) => {
        for (const t of [0, 0.13, 0.5, 0.87]) {
          expect(dist(arc.pointAt(arc.fractionAt(k, t)), evalCubic(s, t)), `segment ${k} at ${t}`).toBeLessThan(1e-9);
        }
      });
    }
  });
});

const curve = (k: number): Cubic => ({ p0: [0, 0], c1: [20 * k, 6], c2: [10 - 20 * k, 6], p1: [10, 0] });
const exiting = (x: number): Cubic => ({ p0: [0, 0], c1: [20, 10], c2: [-4, 10], p1: [x, 0] });
const handles = (c: Cubic): Point[] => [c.c1, c.c2];
const knotted = (c: Cubic): boolean => {
  const d = cubicDoublePoint(c);
  return !!d && d[0] >= 0 && d[1] <= 1;
};

describe("cubicDoublePoint", () => {
  test("finds where a curve crosses itself, including on a chord test's sample points", () => {
    expect(knotted(curve(0.25))).toBe(false);
    expect(cubicKnots(curve(11 / 18))).toBe(false);
    const [s, t] = cubicDoublePoint(curve(11 / 18))!;
    expect(s).toBeCloseTo(0.25, 12);
    expect(t).toBeCloseTo(0.75, 12);
    for (let k = 0; k <= 100; k++) {
      const c = curve(0.25 + k / 100),
        found = cubicDoublePoint(c);
      if (found) expect(dist(evalCubic(c, found[0]), evalCubic(c, found[1])), `k ${k}`).toBeLessThan(1e-9);
      if (!knotted(c)) expect(cubicKnots(c), `k ${k}`).toBe(false);
    }
  });
});

describe("unknot", () => {
  const neighbours = (family: (k: number) => Cubic, ks: number[]) => {
    for (const k of ks) {
      const step = apart(handles(unknot(family(k))), handles(unknot(family(k + 1e-9))));
      expect(step, `k ${k}`).toBeLessThan(1e-6);
    }
  };

  test("shortens a knotted curve's handles continuously as the knot forms and deepens", () => {
    expect(knotted(curve(1.25)), "the sweep ends knotted").toBe(true);
    for (let k = 0; k <= 100; k++) {
      const c = unknot(curve(0.25 + k / 100));
      expect(knotted(c) || cubicKnots(c), `k ${k}`).toBe(false);
    }
    const { jump, at: where } = worstJump((u) => handles(unknot(curve(0.25 + u))));
    expect(jump, `jump of ${jump} near ${where}`).toBeLessThan(1e-4);
    neighbours(curve, [...Array.from({ length: 2001 }, (_, i) => 0.25 + i / 2000), 11 / 18]);
  });

  test("eases the shortening off continuously as a crossing leaves through the curve's ends", () => {
    expect(knotted(exiting(1)), "knotted before the exit").toBe(true);
    expect(knotted(exiting(-1)), "unknotted after it").toBe(false);
    for (let k = 0; k <= 100; k++) {
      const c = unknot(exiting(-3 + (6 * k) / 100));
      expect(knotted(c) || cubicKnots(c), `k ${k}`).toBe(false);
    }
    const { jump, at: where } = worstJump((u) => handles(unknot(exiting(-3 + 6 * u))));
    expect(jump, `jump of ${jump} near ${where}`).toBeLessThan(1e-4);
    neighbours(exiting, [...Array.from({ length: 2001 }, (_, i) => -3 + (6 * i) / 2000), 0, -1e-12]);
  });
});

const exitFrom =
  "M0,0 C18.70687671471387,27.200044468045235 61.04559829225764,-8.21095135062933 100,34.56834292039275 C61.04559829225764,10.78579482063651 18.70687671471387,46.196790639311075 0,0Z";
const exitTo =
  "M0,0 C39.807459795847535,-44.90955024957657 69.09872230375186,-71.35830078274012 100,9.668684620410204 C69.09872230375186,-65.08824013732374 39.807459795847535,-38.63948960416019 0,0Z";

describe("bend handoff continuity", () => {
  for (const [name, from, to, tipDistance] of [
    ["upper lash to closed, default tip distance", upperOpen, closedLash, undefined],
    ["upper lash to closed, tip distance 4", upperOpen, closedLash, 4],
    ["upper lash to a reversed, re-phased closed lash", upperOpen, closedLashReversed, undefined],
    ["upper lash to a reversed closed lash, tip distance 1", upperOpen, closedLashReversed, 1],
    ["upper lash to a reversed closed lash, tip distance 2", upperOpen, closedLashReversed, 2],
    ["upper lash to a reversed closed lash, tip distance 4", upperOpen, closedLashReversed, 4],
    ["tilted lash to its closed pose", tiltedOpen, tiltedClosed, undefined],
    ["rounded-tip lash to its rounded closed pose", roundedOpen, roundedClosed, undefined],
    ["a lash whose tip crossing leaves through an end, tip distance 4", exitFrom, exitTo, 4],
  ] as const) {
    test(`${name}: the drawn frame has no jump at any progress`, () => {
      const r = bendTrack(loop(from), loop(to), tipDistance === undefined ? {} : { tipDistance });
      if (!r.ok) throw new Error(r.failure.message);
      const { jump, at } = worstJump((t) => points(r.track.frame(t)));
      expect(jump, `jump of ${jump} near progress ${at}`).toBeLessThan(JUMP_TOLERANCE);
    }, 60_000);
  }
  for (const [name, from, to, tipDistance, lo, hi] of [
    ["upper lash, reversed closed lash", upperOpen, closedLashReversed, undefined, 0.4681871348474821, 0.468187134847484],
    ["upper lash, tip distance 1", upperOpen, closedLash, 1, 0.4557886117414852, 0.4557886117414871],
    ["upper lash, tip distance 2", upperOpen, closedLash, 2, 0.4414178075254574, 0.44141780752545934],
    ["upper lash, reversed closed lash, tip distance 4", upperOpen, closedLashReversed, 4, 0.5803616930251898, 0.5803616930251899],
    ["upper lash, reversed closed lash, tip distance 4, second instant", upperOpen, closedLashReversed, 4, 0.568270973817507, 0.5682709738175071],
    ["tip crossing leaving through an end, tip distance 4", exitFrom, exitTo, 4, 0.6103143083161582, 0.6103143083161593],
  ] as const) {
    test(`${name}: the drawn frame has no jump across an instant where it jumped`, () => {
      const r = bendTrack(loop(from), loop(to), tipDistance === undefined ? {} : { tipDistance });
      if (!r.ok) throw new Error(r.failure.message);
      const jump = apart(points(r.track.frame(lo)), points(r.track.frame(hi)));
      expect(jump, `jump of ${jump}`).toBeLessThan(1e-6);
    });
  }
});
