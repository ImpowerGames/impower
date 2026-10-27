import { describe, expect, test } from "vitest";
import { ArcLoop, dist, evalCubic } from "../src/geometry/cubic";
import { bendTrack } from "../src/index";
import type { Point } from "../src/index";
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

// A jump in the handoff frame is a single instant of progress, so a uniform
// scan at any step steps over it. These tests cover [0, 1] contiguously in
// steps and bisect every step toward the half that moves more: a smooth
// frame shrinks to nothing as the bracket narrows, while a jump keeps its
// full size however narrow the bracket gets.
const STEPS = 100;
const DEPTH = 28;
// Well under the 0.2 to 0.5 units a jump measures on these lashes, and far
// above what a smooth frame moves across 2^-28 of a step.
const JUMP_TOLERANCE = 1e-4;

const points = (frame: { p0: Point }[]): Point[] => frame.map((c) => c.p0);
const apart = (a: Point[], b: Point[]): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(a[i]![0] - b[i]![0], a[i]![1] - b[i]![1]));
  return m;
};

/** The largest frame-to-frame distance left after bisecting every step down to its narrowest bracket. */
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

describe("bend handoff continuity", () => {
  for (const [name, from, to, tipDistance] of [
    ["upper lash to closed, default tip distance", upperOpen, closedLash, undefined],
    ["upper lash to closed, tip distance 4", upperOpen, closedLash, 4],
    ["upper lash to a reversed, re-phased closed lash", upperOpen, closedLashReversed, undefined],
    ["tilted lash to its closed pose", tiltedOpen, tiltedClosed, undefined],
    ["rounded-tip lash to its rounded closed pose", roundedOpen, roundedClosed, undefined],
  ] as const) {
    test(`${name}: the drawn frame has no jump at any progress`, () => {
      const r = bendTrack(loop(from), loop(to), tipDistance === undefined ? {} : { tipDistance });
      if (!r.ok) throw new Error(r.failure.message);
      const { jump, at } = worstJump((t) => points(r.track.frame(t)));
      expect(jump, `jump of ${jump} near progress ${at}`).toBeLessThan(JUMP_TOLERANCE);
    }, 60_000);
  }
  // Brackets where a nearest-point search over the canonical frame switched
  // between the two arms of a folded tip: the canonical frame moves by about
  // 1e-13 across each, and the drawn frame jumped by up to 0.0075.
  for (const [name, to, tipDistance, lo, hi] of [
    ["reversed closed lash", closedLashReversed, undefined, 0.4681871348474821, 0.468187134847484],
    ["tip distance 1", closedLash, 1, 0.4557886117414852, 0.4557886117414871],
    ["tip distance 2", closedLash, 2, 0.4414178075254574, 0.44141780752545934],
  ] as const) {
    test(`upper lash, ${name}: the drawn frame follows the canonical frame across a folded tip`, () => {
      const r = bendTrack(loop(upperOpen), loop(to), tipDistance === undefined ? {} : { tipDistance });
      if (!r.ok) throw new Error(r.failure.message);
      const jump = apart(points(r.track.frame(lo)), points(r.track.frame(hi)));
      expect(jump, `jump of ${jump}`).toBeLessThan(1e-6);
    });
  }
});
