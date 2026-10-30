import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { parseMorphEasing } from "../../morph/easing";
import { morphFrameState, morphPosesAt, renderMorphAt, renderMorphFrame } from "../../morph/render";
import { MorphTimeline, morphRandom } from "../../morph/timeline";
import type { MorphTiming } from "../../morph/types";
import { blink, CLOSED, portrait } from "./fixtures";

const timing = (overrides: Partial<MorphTiming> = {}): MorphTiming => ({
  duration: 0.25,
  delay: 0,
  easing: "linear",
  iterations: 1,
  direction: "normal",
  ...overrides,
});

const offsetAt = (timeline: MorphTimeline, t: number) => {
  const head = timeline.at(t);
  return "offset" in head ? head.offset : head.phase;
};

describe("morph easing", () => {
  test("named curves follow their CSS cubic Béziers", () => {
    const easeOut = parseMorphEasing("ease-out")!;
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeCloseTo(0.68464, 4);
    const ease = parseMorphEasing("ease")!;
    expect(ease(0.25)).toBeCloseTo(0.40851, 4);
  });

  test("cubic-bezier() solves for x, and a linear curve is the identity", () => {
    const curve = parseMorphEasing("cubic-bezier(0.42, 0, 1, 1)")!;
    expect(curve(0.5)).toBeCloseTo(parseMorphEasing("ease-in")!(0.5), 9);
    expect(parseMorphEasing("cubic-bezier(0.3, 0.3, 0.7, 0.7)")!(0.37)).toBeCloseTo(0.37, 9);
  });

  test("steps(3) is steps(3, end), and the other positions jump where CSS says", () => {
    const end = parseMorphEasing("steps(3)")!;
    const explicit = parseMorphEasing("steps(3, end)")!;
    for (const x of [0, 0.2, 1 / 3, 0.5, 0.7, 0.99, 1]) expect(end(x)).toBe(explicit(x));
    expect([0, 0.34, 0.67, 1].map(end)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect([0, 0.34, 0.99].map(parseMorphEasing("steps(3, jump-start)")!)).toEqual([1 / 3, 2 / 3, 1]);
    expect([0, 0.5, 1].map(parseMorphEasing("steps(2, jump-none)")!)).toEqual([0, 1, 1]);
    expect([0, 0.5].map(parseMorphEasing("steps(1, jump-both)")!)).toEqual([0.5, 0.5]);
    expect(parseMorphEasing("step-start")!(0)).toBe(1);
    expect(parseMorphEasing("step-end")!(0.99)).toBe(0);
  });

  test("linear() places omitted inputs between their neighbours", () => {
    const curve = parseMorphEasing("linear(0, 0.25, 1)")!;
    expect(curve(0.25)).toBeCloseTo(0.125, 9);
    expect(curve(0.75)).toBeCloseTo(0.625, 9);
    expect(parseMorphEasing("linear(0, 0.9 20%, 1)")!(0.1)).toBeCloseTo(0.45, 9);
  });

  test("text that is no timing function is refused", () => {
    expect(parseMorphEasing("bouncy")).toBeUndefined();
    expect(parseMorphEasing("steps(0)")).toBeUndefined();
    expect(parseMorphEasing("cubic-bezier(2, 0, 1, 1)")).toBeUndefined();
  });
});

describe("morph timeline", () => {
  test("the first play waits for the delay, and a finite sequence holds its terminal pose", () => {
    const timeline = new MorphTimeline(timing({ delay: 0.7, iterations: 2 }), morphRandom("a"));
    expect(timeline.at(0.5)).toEqual({ phase: "waiting" });
    expect(timeline.at(0.7 + 0.125)).toEqual({ phase: "playing", play: 0, offset: 0.5 });
    expect(timeline.at(0.7 + 0.25 + 0.05)).toMatchObject({ phase: "playing", play: 1 });
    expect(timeline.at(5)).toEqual({ phase: "done", play: 1, offset: 1 });
  });

  test("zero iterations never plays", () => {
    expect(new MorphTimeline(timing({ iterations: 0 }), morphRandom("a")).at(1)).toEqual({ phase: "off" });
  });

  test("easing maps each play's directed progress exactly once", () => {
    const timeline = new MorphTimeline(timing({ easing: "ease-out", direction: "alternate", iterations: 2 }), morphRandom("a"));
    const easeOut = parseMorphEasing("ease-out")!;
    expect(offsetAt(timeline, 0.05)).toBeCloseTo(easeOut(0.2), 9);
    expect(offsetAt(timeline, 0.3)).toBeCloseTo(easeOut(0.8), 9);
    const reverse = new MorphTimeline(timing({ direction: "reverse" }), morphRandom("a"));
    expect(offsetAt(reverse, 0.05)).toBeCloseTo(0.8, 9);
    expect(reverse.at(1)).toEqual({ phase: "done", play: 0, offset: 0 });
  });

  test("each quiet gap is drawn uniformly between the bounds, reproducibly per seed", () => {
    const bounds = { iterations: "infinite" as const, iteration_delay_min: 0.2, iteration_delay_max: 6 };
    const starts = (seed: string) => {
      const timeline = new MorphTimeline(timing(bounds), morphRandom(seed));
      const found: number[] = [];
      let last = -1;
      for (let t = 0; t < 120; t += 0.01) {
        const head = timeline.at(t);
        if (head.phase === "playing" && head.play !== last) {
          found.push(Math.round(t * 100) / 100);
          last = head.play;
        }
      }
      return found;
    };
    const a = starts("bunny");
    expect(a.length).toBeGreaterThan(10);
    for (let i = 1; i < a.length; i++) {
      const gap = a[i]! - a[i - 1]! - 0.25;
      expect(gap).toBeGreaterThanOrEqual(0.2 - 0.011);
      expect(gap).toBeLessThanOrEqual(6 + 0.011);
    }
    expect(starts("bunny")).toEqual(a);
    expect(starts("raffles")).not.toEqual(a);
  });

  test("equal bounds give a fixed gap", () => {
    const timeline = new MorphTimeline(timing({ iterations: "infinite", iteration_delay_min: 1, iteration_delay_max: 1 }), morphRandom("a"));
    expect(timeline.at(0.3)).toMatchObject({ phase: "between", play: 0 });
    expect(timeline.at(1.25 + 0.1)).toMatchObject({ phase: "playing", play: 1 });
    expect(timeline.at(2.5 + 0.1)).toMatchObject({ phase: "playing", play: 2 });
  });
});

describe("morph poses at a keyframe offset", () => {
  const recipe = blink({
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.33333, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
  });
  const artifact = bakeMorphArtifact({ source: portrait({ dx: 0, dy: 0 }), selection: {}, recipe, key: "k", variant: "bunny" });
  const timeline = new MorphTimeline(
    timing({ easing: "steps(3)", delay: 0.7, iterations: "infinite", iteration_delay_min: 0.2, iteration_delay_max: 6 }),
    morphRandom("bunny"),
  );
  const at = (ms: number) => offsetAt(timeline, 0.7 + ms / 1000) as number;
  const lashes = (offset: number) => {
    const frame = morphFrameState(artifact, morphPosesAt(artifact, offset));
    return { frame, poses: morphPosesAt(artifact, offset) };
  };

  test("the example samples open, closed, halfway back and open", () => {
    expect(artifact.status).toBe("live");
    expect(lashes(at(40)).poses["eyes"]).toEqual({ segment: 0, progress: 0 });
    const closed = lashes(at(120)).poses["eyes"] as { segment: number; progress: number };
    expect(closed.segment).toBe(1);
    expect(closed.progress).toBeLessThan(1e-4);
    const half = lashes(at(200)).poses["eyes"] as { segment: number; progress: number };
    expect(half.segment).toBe(1);
    expect(half.progress).toBeCloseTo(0.5, 4);
    expect(lashes(at(260)).poses["eyes"]).toEqual({ segment: 1, progress: 1 });
  });

  test("a held pose draws what the reference renderer draws at that segment's end", () => {
    expect(renderMorphAt(artifact, 0.33333)).toBe(renderMorphFrame(artifact, { segment: 0, progress: 1 }));
    expect(renderMorphAt(artifact, 0.33333)).toContain(CLOSED);
    expect(renderMorphAt(artifact, 0)).toBe(renderMorphFrame(artifact, { segment: 0, progress: 0 }));
  });

  test("outside its segments an aperture keeps the last pose its segments left it in", () => {
    const clip = artifact.clipTargets[0]!.aperture;
    const closedEnd = morphFrameState(artifact, morphPosesAt(artifact, 0.33333)).clips.get(clip);
    const reopening = morphFrameState(artifact, morphPosesAt(artifact, 0.66)).clips.get(clip);
    expect(closedEnd).toBeDefined();
    expect(reopening).toBeDefined();
    expect(reopening).not.toBe(closedEnd);
    const poses = morphPosesAt(artifact, 1);
    const held = morphFrameState(artifact, { eyes: { state: "open", last: 1 } }).clips.get(clip);
    expect(held).toBe(morphFrameState(artifact, poses).clips.get(clip));
  });
});
