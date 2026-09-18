import { describe, expect, test } from "vitest";
import { selfIntersects, signedArea } from "../src/geometry/cubic";
import { canonicalFrame, findTips, selectCandidate, taperDistance } from "../src/methods/taper";
import { TAPER_DEFAULTS, morphSubpaths, parsePathData, taperTrack } from "../src/index";
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
  rotatingClosed,
  rotatingOpen,
  roundedClosed,
  roundedOpen,
  runtimeProgress,
  square,
  tiltedClosed,
  tiltedOpen,
  upperOpen,
} from "./fixtures";

// Tolerances. Endpoint frames are handoff polylines of 48 points blended
// fully onto the authored art, so they should sit on it to within a small
// fraction of a unit; mid-morph frames are checked for topology and the
// prototype's thickness criterion rather than a position.
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

describe("taperTrack", () => {
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
      const r = taperTrack(loop(from), loop(to));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.track.thickness).toBeGreaterThanOrEqual(TAPER_DEFAULTS.thicknessRatio);
      expect(maxDistanceToLoop(anchors(r.track.frame(0)), loop(from))).toBeLessThan(ENDPOINT_TOLERANCE);
      expect(maxDistanceToLoop(anchors(r.track.frame(1)), loop(to))).toBeLessThan(ENDPOINT_TOLERANCE);
      for (const t of [...bakeProgress, ...runtimeProgress]) {
        expect(selfIntersects(r.track.frame(t)), `frame ${t}`).toBe(false);
        expect(selfIntersects(r.track.canonical(t)), `canonical ${t}`).toBe(false);
      }
      expect(r.track.canonicalFrom).toHaveLength(TAPER_DEFAULTS.anchors);
      expect(r.track.canonicalTo).toHaveLength(TAPER_DEFAULTS.anchors);
      // The track's endpoints share the frames' topology.
      expect(r.track.from).toHaveLength(r.track.frame(0.5).length);
      expect(r.track.to).toHaveLength(r.track.frame(0.5).length);
      // No candidate that inflates the ribbon mid-morph is chosen: the
      // area never exceeds the larger rest pose by more than a quarter.
      const area = (segs: ReturnType<typeof loop>) => Math.abs(signedArea(segs));
      const cap = 1.25 * Math.max(area(r.track.canonicalFrom), area(r.track.canonicalTo));
      for (const t of runtimeProgress) expect(area(r.track.canonical(t)), `area at ${t}`).toBeLessThanOrEqual(cap);
    });
  }

  test("among candidates that hold thickness, the least-travel one wins over a thicker one", () => {
    // Two viable candidates built from the closed lash's canonical loop:
    // the real one, and a copy pushed 5 units right and thinned to 90%,
    // whose mid-morph ratio is higher (the ratio is measured against the
    // thinner endpoint) but whose anchors travel farther. On the synthetic
    // fixtures the tip search never yields two viable candidates, so the
    // policy is pinned on this constructed pair.
    const r = taperTrack(loop(upperOpen), loop(closedLash));
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
    expect(score(real)).toBeGreaterThanOrEqual(TAPER_DEFAULTS.thicknessRatio);
    const picked = selectCandidate(a, [shifted, real], score, TAPER_DEFAULTS.thicknessRatio);
    expect(picked.candidate).toBe(real);
    expect(picked.travel).toBeLessThan(selectCandidate(a, [shifted], score, TAPER_DEFAULTS.thicknessRatio).travel);
    // When only one holds thickness it wins regardless of travel, and when
    // none does the least-pinching one is reported.
    expect(selectCandidate(a, [shifted, real], (b) => (b === real ? 0.9 : 0.3), TAPER_DEFAULTS.thicknessRatio).candidate).toBe(real);
    expect(selectCandidate(a, [real, shifted], (b) => (b === real ? 0.3 : 0.5), TAPER_DEFAULTS.thicknessRatio).candidate).toBe(shifted);
  });

  test("the taper distance is capped at 12% of the tip-to-tip span", () => {
    // A capsule with semicircular ends: its width plateaus about a radius
    // in from each end, 30% of the span, so the measured distance would
    // put the flanks far into the body without the cap. The tips are
    // given directly because a capsule's ends do not fold sharply enough
    // to be found as taper tips.
    const capsule = loop("M0,50 C0,10 100,10 100,50 C100,90 0,90 0,50Z");
    const tips = { f1: 0, f2: 0.5, p1: [0, 50] as [number, number], p2: [100, 50] as [number, number], fold1: Math.PI, fold2: Math.PI };
    const span = 100;
    expect(taperDistance(capsule, tips)).toBeCloseTo(0.12 * span, 6);
    // A real lash's measured distance sits between the 2% floor and the cap.
    const lash = loop(upperOpen);
    const lashTips = findTips(lash);
    const lashSpan = Math.hypot(lashTips.p1[0] - lashTips.p2[0], lashTips.p1[1] - lashTips.p2[1]);
    const px = taperDistance(lash, lashTips);
    expect(px).toBeGreaterThanOrEqual(0.02 * lashSpan - 1e-9);
    expect(px).toBeLessThan(0.12 * lashSpan);
  });

  test("the winding-and-tip correspondence search is what keeps the rotating crease from pinching", () => {
    const r = taperTrack(loop(rotatingOpen), loop(rotatingClosed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lo = Math.min(Math.abs(signedArea(r.track.from)), Math.abs(signedArea(r.track.to)));
    for (const t of [0.25, 0.5, 0.75]) {
      expect(Math.abs(signedArea(r.track.canonical(t))) / lo).toBeGreaterThanOrEqual(TAPER_DEFAULTS.thicknessRatio);
    }
  });

  test("a rounded tip keeps its width near the tip through the morph rather than pinching to a point", () => {
    const r = taperTrack(loop(roundedOpen), loop(roundedClosed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The canonical loops must describe the art: smoothing the junction
    // where the tip's arc meets the body would flip the underside and
    // double the area.
    const area = (segs: ReturnType<typeof loop>) => Math.abs(signedArea(segs));
    expect(Math.abs(area(r.track.canonicalFrom) - area(loop(roundedOpen))) / area(loop(roundedOpen))).toBeLessThan(0.15);
    expect(Math.abs(area(r.track.canonicalTo) - area(loop(roundedClosed))) / area(loop(roundedClosed))).toBeLessThan(0.15);
    // Width of the ribbon a short way in from each tip, at every runtime
    // progress, must stay between the two rest poses' widths (with slack).
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
    const r = taperTrack(loop(upperOpen), loop(closedLash));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of runtimeProgress) {
      const [a, b] = r.track.tips(t);
      const xs = [a[0], b[0]].sort((x, y) => x - y);
      expect(xs[0]).toBeCloseTo(0, 0);
      expect(xs[1]).toBeCloseTo(100, 0);
    }
  });

  test("edges run tip to tip with the requested point count", () => {
    const r = taperTrack(loop(upperOpen), loop(closedLash));
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
      const r = taperTrack(loop(from), loop(to));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failure.code).toBe("tips-not-found");
    }
  });

  test("a single-segment loop with one cusp is not a taper: its reconstruction cannot hold the drawing's area", () => {
    const r = taperTrack(loop(oneCusp), loop(oneCuspNarrow));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("tips-not-found");
  });

  test("empty geometry is a structured failure, not an exception", () => {
    expect(taperTrack([], [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
    expect(taperTrack(loop(upperOpen), [])).toMatchObject({ ok: false, failure: { code: "empty-geometry" } });
  });

  test("a quality failure carries the progress values that failed", () => {
    const r = taperTrack(loop(upperOpen), loop(closedLash), { thicknessRatio: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.code).toBe("thickness");
    expect(r.failure.message).toMatch(/below 10/);
  });

  test("a handoff point count below eight is raised to eight rather than producing empty frames", () => {
    for (const handoffPoints of [0, -1, 3]) {
      const r = taperTrack(loop(upperOpen), loop(closedLash), { handoffPoints });
      expect(r.ok, `handoffPoints ${handoffPoints}`).toBe(true);
      if (!r.ok) return;
      expect(r.track.from).toHaveLength(8);
      expect(r.track.frame(0.5)).toHaveLength(8);
      expect(r.track.to).toHaveLength(8);
    }
  });

  test("without handoff the frames stay curved canonical loops", () => {
    const r = taperTrack(loop(upperOpen), loop(closedLash), { handoff: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.track.frame(0.5)).toHaveLength(TAPER_DEFAULTS.anchors);
  });
});

describe("morphSubpaths with the taper method", () => {
  test("reports the failing subpath index and never substitutes another method", () => {
    const r = morphSubpaths(parsePathData(upperOpen + circle), parsePathData(closedLash + square), { method: "taper" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toMatchObject({ code: "tips-not-found", subpath: 1 });
  });

  test("an open subpath with a real gap is refused as not-closed instead of being sealed silently", () => {
    // The lash's perimeter is about 250 units; the default seam tolerance
    // is 2% of that, so a gap of 10 or more is a real opening.
    for (const gap of [10, 20, 40]) {
      const open = `M0,50 C30,5 70,5 100,50 C70,25 30,25 ${gap},50`;
      const r = morphSubpaths(parsePathData(open), parsePathData(closedLash), { method: "taper" });
      expect(r.ok, `gap ${gap}`).toBe(false);
      if (r.ok) return;
      expect(r.failure).toMatchObject({ code: "not-closed", subpath: 0 });
    }
    // A seam within the tolerance (a hair short of closing) is accepted,
    // and a stricter tolerance refuses it.
    const nearly = "M0,50 C30,5 70,5 100,50 C70,25 30,25 2,50";
    expect(morphSubpaths(parsePathData(nearly), parsePathData(closedLash), { method: "taper" }).ok).toBe(true);
    expect(morphSubpaths(parsePathData(nearly), parsePathData(closedLash), { method: "taper", seamTolerance: 0.001 })).toMatchObject({
      ok: false,
      failure: { code: "not-closed" },
    });
  });

  test("succeeds and labels the method", () => {
    const r = morphSubpaths(parsePathData(upperOpen), parsePathData(closedLash), { method: "taper" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.morph.method).toBe("taper");
    expect(r.morph.frame(0.5)).toHaveLength(1);
    expect(r.morph.frame(0.5)[0]!.closed).toBe(true);
  });
});
