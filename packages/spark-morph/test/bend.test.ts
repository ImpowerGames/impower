import { describe, expect, test } from "vitest";
import { selfIntersects, signedArea } from "../src/geometry/cubic";
import { canonicalFrame, findTips, selectCandidate } from "../src/methods/bend";
import type { Point } from "../src/types";
import { BEND_DEFAULTS, morphSubpaths, parsePathData, bendTrack } from "../src/index";
import {
  anchors,
  circle,
  closedLash,
  closedLashReversed,
  loop,
  lowerOpen,
  maxDistanceToLoop,
  oneCusp,
  oneCuspNarrow,
  ribbonClosed,
  ribbonLash,
  ribbonOpen,
  rotatingClosed,
  rotatingOpen,
  roundedClosed,
  roundedOpen,
  runtimeProgress,
  scaled,
  square,
  tiltedClosed,
  tiltedOpen,
  upperOpen,
} from "./fixtures";

const ENDPOINT_TOLERANCE = 0.5;
const bakeProgress = Array.from({ length: 8 }, (_, i) => i / 7);

describe("findTips", () => {
  test("finds the two pointed ends of a lash with near-reversal folds", () => {
    const tips = findTips(loop(upperOpen));
    const pts = [tips.p1, tips.p2].sort((a, b) => a[0] - b[0]);
    expect(pts[0]![0]).toBeCloseTo(0, 0);
    expect(pts[1]![0]).toBeCloseTo(100, 0);
    expect(tips.fold1).toBeGreaterThan((160 * Math.PI) / 180);
    expect(tips.fold2).toBeGreaterThan((160 * Math.PI) / 180);
  });

  test("still ranks candidates on a blob, with small folds the method must reject", () => {
    const tips = findTips(loop(circle));
    expect(Math.max(tips.fold1, tips.fold2)).toBeLessThan((30 * Math.PI) / 180);
  });
});

describe("bendTrack", () => {
  for (const [name, from, to] of [
    ["upper lash to closed", upperOpen, closedLash],
    ["lower lash to closed", lowerOpen, closedLash],
    ["upper lash to a reversed, re-phased closed lash", upperOpen, closedLashReversed],
    ["tilted lash to its closed pose", tiltedOpen, tiltedClosed],
    ["crease rotating past vertical", rotatingOpen, rotatingClosed],
    ["rounded-tip lash to its rounded closed pose", roundedOpen, roundedClosed],
    ["rounded-tip lash to a sharp closed lash", roundedOpen, closedLash],
  ] as const) {
    test(`${name}: endpoints match, no self-intersection at bake or runtime samples, thickness holds`, () => {
      const r = bendTrack(loop(from), loop(to));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.track.thickness).toBeGreaterThanOrEqual(BEND_DEFAULTS.thicknessRatio);
      expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop(from))).toBeLessThan(ENDPOINT_TOLERANCE);
      expect(maxDistanceToLoop(anchors(r.track.frame(1)), loop(to))).toBeLessThan(ENDPOINT_TOLERANCE);
      for (const t of [...bakeProgress, ...runtimeProgress]) {
        expect(selfIntersects(r.track.frame(t)), `frame ${t}`).toBe(false);
        expect(selfIntersects(r.track.canonical(t)), `canonical ${t}`).toBe(false);
      }
      expect(r.track.canonicalFrom).toHaveLength(BEND_DEFAULTS.anchors);
      expect(r.track.canonicalTo).toHaveLength(BEND_DEFAULTS.anchors);
      expect(r.track.from).toHaveLength(r.track.frame(0.5).length);
      expect(r.track.to).toHaveLength(r.track.frame(0.5).length);
      const area = (segs: ReturnType<typeof loop>) => Math.abs(signedArea(segs));
      const cap = 1.25 * Math.max(area(r.track.canonicalFrom), area(r.track.canonicalTo));
      for (const t of runtimeProgress) expect(area(r.track.canonical(t)), `area at ${t}`).toBeLessThanOrEqual(cap);
    });
  }

  test("among candidates that hold thickness, the least-travel one wins over a thicker one", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.track.canonicalFrom,
      real = r.track.canonicalTo;
    const shifted = real.map((s) => {
      const move = (p: [number, number]): [number, number] => [p[0] + 5, 50 + (p[1] - 50) * 0.9];
      return { p0: move(s.p0), c1: move(s.c1), c2: move(s.c2), p1: move(s.p1) };
    });
    const area = (segs: ReturnType<typeof loop>) => Math.abs(signedArea(segs));
    const score = (b: ReturnType<typeof loop>) => {
      const lo = Math.min(area(a), area(b)) || 1;
      return Math.min(...[0.25, 0.5, 0.75].map((tt) => area(canonicalFrame(a, b, tt)) / lo));
    };
    expect(score(shifted)).toBeGreaterThan(score(real));
    expect(score(real)).toBeGreaterThanOrEqual(BEND_DEFAULTS.thicknessRatio);
    const picked = selectCandidate(a, [shifted, real], score, BEND_DEFAULTS.thicknessRatio);
    expect(picked.candidate).toBe(real);
    expect(picked.travel).toBeLessThan(selectCandidate(a, [shifted], score, BEND_DEFAULTS.thicknessRatio).travel);
    expect(selectCandidate(a, [shifted, real], (b) => (b === real ? 0.9 : 0.3), BEND_DEFAULTS.thicknessRatio).candidate).toBe(real);
    expect(selectCandidate(a, [real, shifted], (b) => (b === real ? 0.3 : 0.5), BEND_DEFAULTS.thicknessRatio).candidate).toBe(shifted);
  });

  test("the winding-and-tip correspondence search is what keeps the rotating crease from pinching", () => {
    const r = bendTrack(loop(rotatingOpen), loop(rotatingClosed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lo = Math.min(Math.abs(signedArea(r.track.from)), Math.abs(signedArea(r.track.to)));
    for (const t of [0.25, 0.5, 0.75]) {
      expect(Math.abs(signedArea(r.track.canonical(t))) / lo).toBeGreaterThanOrEqual(BEND_DEFAULTS.thicknessRatio);
    }
  });

  test("a rounded tip keeps its width near the tip through the morph rather than pinching to a point", () => {
    const r = bendTrack(loop(roundedOpen), loop(roundedClosed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const area = (segs: ReturnType<typeof loop>) => Math.abs(signedArea(segs));
    expect(Math.abs(area(r.track.canonicalFrom) - area(loop(roundedOpen))) / area(loop(roundedOpen))).toBeLessThan(0.15);
    expect(Math.abs(area(r.track.canonicalTo) - area(loop(roundedClosed))) / area(loop(roundedClosed))).toBeLessThan(0.15);
    const widthNearTip = (t: number, which: 0 | 1, at: number) => {
      const [e1, e2] = r.track.edges(t, 40);
      const i = which === 0 ? at : 39 - at;
      return Math.hypot(e1[i]![0] - e2[i]![0], e1[i]![1] - e2[i]![1]);
    };
    for (const which of [0, 1] as const) {
      const w0 = widthNearTip(0, which, 4),
        w1 = widthNearTip(1, which, 4);
      const lo = Math.min(w0, w1) * 0.6,
        hi = Math.max(w0, w1) * 1.4;
      for (const t of runtimeProgress) {
        const w = widthNearTip(t, which, 4);
        expect(w, `tip ${which} width at ${t}`).toBeGreaterThanOrEqual(lo);
        expect(w, `tip ${which} width at ${t}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  test("tips stay at the lash ends throughout", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) {
      const [a, b] = r.track.tips(t);
      const xs = [a[0], b[0]].sort((x, y) => x - y);
      expect(xs[0]).toBeCloseTo(0, 0);
      expect(xs[1]).toBeCloseTo(100, 0);
    }
  });

  test("between the rest poses the edges lie on the frame that is drawn", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of [0.2, 0.5, 0.8]) {
      const drawn = r.track.frame(t).map((segment) => segment.p0);
      const onDrawn = (p: Point) => {
        let best = Infinity;
        for (let i = 0; i < drawn.length; i++) {
          const a = drawn[i]!,
            b = drawn[(i + 1) % drawn.length]!;
          const dx = b[0] - a[0],
            dy = b[1] - a[1];
          const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
          best = Math.min(best, Math.hypot(a[0] + f * dx - p[0], a[1] + f * dy - p[1]));
        }
        return best;
      };
      const [e1, e2] = r.track.edges(t, 24);
      expect(e1).toHaveLength(24);
      expect(e2).toHaveLength(24);
      expect(Math.max(...[...e1, ...e2].map(onDrawn)), `at ${t}`).toBeLessThan(1e-9);
    }
  });

  test("edges run tip to tip with the requested point count", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [e1, e2] = r.track.edges(0, 12);
    expect(e1).toHaveLength(12);
    expect(e2).toHaveLength(12);
    expect(e1[0]).toEqual(e2[0]);
    expect(e1[11]).toEqual(e2[11]);
    expect(Math.abs(e1[6]![1] - e2[6]![1])).toBeGreaterThan(5);
  });

  test("a drawing without two tapered tips fails with tips-not-found rather than switching method", () => {
    for (const [from, to] of [
      [circle, closedLash],
      [upperOpen, circle],
      [square, circle],
    ] as const) {
      const r = bendTrack(loop(from), loop(to));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failure.code).toBe("tips-not-found");
    }
  });

  test("a single-segment loop with one cusp is not a taper: its reconstruction cannot hold the drawing's area", () => {
    const r = bendTrack(loop(oneCusp), loop(oneCuspNarrow));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("tips-not-found");
  });

  test("empty geometry is a structured failure, not an exception", () => {
    expect(bendTrack([], [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
    expect(bendTrack(loop(upperOpen), [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });

  test("a quality failure carries the progress values that failed", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash), { thicknessRatio: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("thickness");
    expect(r.failure.message).toMatch(/below 10/);
  });

  test("a handoff point count below eight is raised to eight rather than producing empty frames", () => {
    for (const handoffPoints of [0, -1, 3]) {
      const r = bendTrack(loop(upperOpen), loop(closedLash), { handoffPoints });
      expect(r.ok, `handoffPoints ${handoffPoints}`).toBe(true);
      if (!r.ok) return;
      expect(r.track.from).toHaveLength(8);
      expect(r.track.frame(0.5)).toHaveLength(8);
      expect(r.track.to).toHaveLength(8);
    }
  });

  test("without handoff the frames stay curved canonical loops", () => {
    const r = bendTrack(loop(upperOpen), loop(closedLash), { handoff: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.frame(0.5)).toHaveLength(BEND_DEFAULTS.anchors);
  });

  test("the default tip distance bends a portrait-shaped ribbon lash into its closed pose", () => {
    const r = bendTrack(loop(ribbonOpen), loop(ribbonClosed));
    expect(r.ok ? "ok" : r.failure.message).toBe("ok");
    for (const thickness of [8, 12, 16, 20]) {
      for (const bow of [4, 14, 26]) {
        const rr = bendTrack(loop(ribbonLash(160, bow, thickness)), loop(ribbonClosed));
        expect(rr.ok ? "ok" : rr.failure.message, `thickness ${thickness}, bow ${bow}`).toBe("ok");
      }
    }
  });

  test("the default tip distance bends a closed pose drawn at another size than the open one", () => {
    for (const k of [0.1, 0.5, 2, 5, 10, 20]) {
      for (const [name, open, closed] of [
        ["rounded", roundedOpen, roundedClosed],
        ["upper", upperOpen, closedLash],
        ["ribbon", ribbonOpen, ribbonClosed],
      ] as const) {
        const r = bendTrack(loop(open), loop(scaled(closed, k)));
        expect(r.ok ? "ok" : r.failure.message, `${name} lash, closed pose at ${k}x`).toBe("ok");
      }
    }
  });
});

describe("morphSubpaths with the bend method", () => {
  test("reports the failing subpath index and never substitutes another method", () => {
    const r = morphSubpaths(parsePathData(upperOpen + circle), parsePathData(closedLash + square), { method: "bend" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toMatchObject({ code: "tips-not-found", subpath: 1 });
  });

  test("an open subpath with a real gap is refused as not-closed instead of being sealed silently", () => {
    for (const gap of [10, 20, 40]) {
      const open = `M0,50 C30,5 70,5 100,50 C70,25 30,25 ${gap},50`;
      const r = morphSubpaths(parsePathData(open), parsePathData(closedLash), { method: "bend" });
      expect(r.ok, `gap ${gap}`).toBe(false);
      if (r.ok) return;
      expect(r.failure).toMatchObject({ code: "not-closed", subpath: 0 });
    }
    const nearly = "M0,50 C30,5 70,5 100,50 C70,25 30,25 2,50";
    expect(morphSubpaths(parsePathData(nearly), parsePathData(closedLash), { method: "bend" }).ok).toBe(true);
    expect(morphSubpaths(parsePathData(nearly), parsePathData(closedLash), { method: "bend", seamTolerance: 0.001 })).toMatchObject({
      ok: false,
      failure: { code: "not-closed" },
    });
  });

  test("succeeds and labels the method", () => {
    const r = morphSubpaths(parsePathData(upperOpen), parsePathData(closedLash), { method: "bend" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.morph.method).toBe("bend");
    expect(r.morph.frame(0.5)).toHaveLength(1);
    expect(r.morph.frame(0.5)[0]!.closed).toBe(true);
  });
});
