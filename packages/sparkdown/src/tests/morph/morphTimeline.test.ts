import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { firstMorphEasingReach, parseMorphEasing } from "../../morph/easing";
import { morphFrameState, morphPosesAt, renderMorphAt, renderMorphFrame } from "../../morph/render";
import { MorphTimeline, morphRandom, morphReplayStretch } from "../../morph/timeline";
import { readMorphReplay } from "../../compiler/morph/morphSchema";
import type { MorphReplay, MorphTiming } from "../../morph/types";
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
    expect(timeline.at(0.5)).toEqual({ phase: "waiting", play: 0, offset: 0 });
    expect(timeline.at(0.7 + 0.125)).toEqual({ phase: "playing", play: 0, offset: 0.5 });
    expect(timeline.at(0.7 + 0.25 + 0.05)).toMatchObject({ phase: "playing", play: 1 });
    expect(timeline.at(5)).toEqual({ phase: "done", play: 1, offset: 1 });
  });

  test("while it waits for its first play, a morph shows the pose that play starts from", () => {
    expect(new MorphTimeline(timing({ delay: 1, direction: "reverse" }), morphRandom("a")).at(0.5)).toEqual({ phase: "waiting", play: 0, offset: 1 });
    expect(new MorphTimeline(timing({ delay: 1, direction: "alternate-reverse" }), morphRandom("a")).at(0)).toEqual({ phase: "waiting", play: 0, offset: 1 });
    expect(new MorphTimeline(timing({ delay: 1, direction: "alternate" }), morphRandom("a")).at(0)).toEqual({ phase: "waiting", play: 0, offset: 0 });
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
  const artifact = bakeMorphArtifact({ source: portrait({ dx: 0, dy: 0 }), selection: {}, recipes: [recipe], key: "k", variant: "bunny" });
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

describe("a speech morph's plays (#2111)", () => {
  const speech = (overrides: Partial<MorphTiming> = {}) =>
    new MorphTimeline(timing({ trigger: "speech", duration: 0.1, ...overrides }), () => 0.5);

  test("plays start only inside spans, wait out the drawn gap, and hold the last pose between plays", () => {
    const timeline = speech({ iteration_delay_min: 0.04, iteration_delay_max: 0.06, direction: "alternate" });
    timeline.speak([[0.2, 0.55]], 0);
    expect(timeline.at(0.1)).toEqual({ phase: "off" });
    expect(offsetAt(timeline, 0.25)).toBeCloseTo(0.5, 9);
    expect(timeline.at(0.32)).toEqual({ phase: "between", play: 0, offset: 1 });
    expect(offsetAt(timeline, 0.375)).toBeCloseTo(0.75, 9);
    expect(timeline.at(0.48)).toEqual({ phase: "between", play: 1, offset: 0 });
    expect(offsetAt(timeline, 0.52)).toBeCloseTo(0.2, 9);
    expect(offsetAt(timeline, 0.58)).toBeCloseTo(0.8, 9);
    expect(timeline.at(0.65)).toEqual({ phase: "off" });
    expect(timeline.at(5)).toEqual({ phase: "off" });
  });

  test("a break shorter than a play neither interrupts nor restarts the rhythm", () => {
    const timeline = speech({ duration: 0.16 });
    timeline.speak([[0, 0.1], [0.125, 0.4]], 0);
    expect(offsetAt(timeline, 0.11)).toBeCloseTo(0.11 / 0.16, 9);
    expect(offsetAt(timeline, 0.17)).toBeCloseTo(0.01 / 0.16, 9);
    expect(offsetAt(timeline, 0.33)).toBeCloseTo(0.01 / 0.16, 9);
    expect(offsetAt(timeline, 0.47)).toBeCloseTo(0.15 / 0.16, 9);
    expect(timeline.at(0.49)).toEqual({ phase: "off" });
  });

  test("new speech keeps the play in progress and replaces the plays still to come", () => {
    const timeline = speech();
    timeline.speak([[0, 1]], 0);
    expect(offsetAt(timeline, 0.05)).toBeCloseTo(0.5, 9);
    timeline.speak([[0.5, 0.6]], 0.05);
    expect(offsetAt(timeline, 0.08)).toBeCloseTo(0.8, 9);
    expect(timeline.at(0.2)).toEqual({ phase: "off" });
    expect(offsetAt(timeline, 0.55)).toBeCloseTo(0.5, 9);
    expect(timeline.at(0.7)).toEqual({ phase: "off" });
  });

  test("a morph that does not play on speech ignores speech", () => {
    const timeline = new MorphTimeline(timing({ iterations: 1 }), () => 0);
    timeline.speak([[1, 2]], 0);
    expect(offsetAt(timeline, 1.5)).toBe(1);
  });
});

describe("a play that replays part of its keyframes (#2580)", () => {
  const replay = (overrides: Partial<MorphReplay> = {}): MorphReplay[] => [{ from: 0, to: 1, chance: 1, count: 1, ...overrides }];
  const scripted = (values: number[]) => {
    const calls: number[] = [];
    const random = () => {
      const value = values[calls.length] ?? 0.5;
      calls.push(value);
      return value;
    };
    return { random, calls };
  };

  test("a replay runs to end, cuts back to start and runs on; the play lasts longer and the next one waits for its end", () => {
    const timeline = new MorphTimeline(
      timing({ duration: 0.35, replay: replay({ to: 2 / 3 }), iterations: 2, iteration_delay_min: 0.1, iteration_delay_max: 0.1 }),
      morphRandom("a"),
    );
    const length = 0.35 * (5 / 3);
    expect(offsetAt(timeline, 0.35 / 3)).toBeCloseTo(1 / 3, 9);
    expect(offsetAt(timeline, 0.35 * (2 / 3) - 0.001)).toBeCloseTo(2 / 3 - 0.001 / 0.35, 9);
    expect(offsetAt(timeline, 0.35 * (2 / 3) + 0.001)).toBeCloseTo(0.001 / 0.35, 9);
    expect(offsetAt(timeline, 0.35 * (2 / 3) + 0.35 / 2)).toBeCloseTo(0.5, 9);
    expect(offsetAt(timeline, length - 0.001)).toBeCloseTo(1 - 0.001 / 0.35, 9);
    expect(timeline.at(length + 0.05)).toEqual({ phase: "between", play: 0, offset: 1 });
    expect(timeline.at(length + 0.1 - 0.001)).toMatchObject({ phase: "between", play: 0 });
    expect(timeline.at(length + 0.1 + 0.001)).toMatchObject({ phase: "playing", play: 1 });
  });

  test("each replay is rolled for, and the first failure ends the rolls for that play", () => {
    const lengthOf = (values: number[]) => {
      const { random, calls } = scripted(values);
      const timeline = new MorphTimeline(timing({ duration: 0.3, replay: replay({ to: 0.5, chance: 0.5, count: 2 }) }), random);
      let t = 0;
      while (timeline.at(t).phase === "playing") t = Math.round((t + 0.001) * 1000) / 1000;
      return { length: Math.round(t * 100) / 100, calls: calls.length };
    };
    expect(lengthOf([0.1, 0.2])).toEqual({ length: 0.6, calls: 2 });
    expect(lengthOf([0.1, 0.9])).toEqual({ length: 0.45, calls: 2 });
    expect(lengthOf([0.9])).toEqual({ length: 0.3, calls: 1 });
  });

  test("a replay's pause holds the pose at end, still playing, before the play resumes from start", () => {
    const { random } = scripted([0.5]);
    const timeline = new MorphTimeline(
      timing({ duration: 0.3, replay: replay({ from: 0.25, to: 0.75, delay_min: 0.1, delay_max: 0.3 }) }),
      random,
    );
    expect(timeline.at(0.225 + 0.01)).toEqual({ phase: "playing", play: 0, offset: 0.75 });
    expect(timeline.at(0.225 + 0.19)).toEqual({ phase: "playing", play: 0, offset: 0.75 });
    expect(offsetAt(timeline, 0.225 + 0.2 + 0.03)).toBeCloseTo(0.25 + 0.1, 9);
    expect(timeline.at(0.3 + 0.15 + 0.2 + 0.001)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("under steps(3) a whole-play replay shows each drawn frame twice, each for its full time", () => {
    const timeline = new MorphTimeline(timing({ duration: 0.3, easing: "steps(3)", replay: replay() }), morphRandom("a"));
    const shown: { offset: number; from: number; to: number }[] = [];
    for (let ms = 0; ms <= 700; ms += 1) {
      const t = ms / 1000;
      const offset = offsetAt(timeline, t) as number;
      const last = shown[shown.length - 1];
      if (last && last.offset === offset) last.to = ms;
      else shown.push({ offset, from: ms, to: ms });
    }
    expect(shown.map((s) => s.offset)).toEqual([0, 1 / 3, 2 / 3, 0, 1 / 3, 2 / 3, 1]);
    for (const step of shown.slice(0, 6)) expect(step.to - step.from).toBeGreaterThanOrEqual(98);
    expect(shown[6]!.from).toBe(600);
  });

  test("a reversed play reads the forward play backwards in time, and alternate plays alternate", () => {
    const path = replay({ from: 0.2, to: 0.7, count: 2, delay_min: 0.05, delay_max: 0.05 });
    const forward = new MorphTimeline(timing({ duration: 0.4, replay: path }), () => 0.5);
    const reverse = new MorphTimeline(timing({ duration: 0.4, replay: path, direction: "reverse" }), () => 0.5);
    const length = 0.4 + 2 * (0.5 * 0.4 + 0.05);
    for (let ms = 2; ms < length * 1000; ms += 7) {
      const t = ms / 1000;
      expect(offsetAt(reverse, t)).toBeCloseTo(offsetAt(forward, length - t) as number, 9);
    }
    expect(reverse.at(length + 0.01)).toEqual({ phase: "done", play: 0, offset: 0 });
    const alternate = new MorphTimeline(timing({ duration: 0.4, replay: path, direction: "alternate", iterations: 2 }), () => 0.5);
    for (let ms = 2; ms < length * 1000; ms += 7) {
      const t = ms / 1000;
      expect(offsetAt(alternate, t)).toBeCloseTo(offsetAt(forward, t) as number, 9);
      expect(offsetAt(alternate, length + t)).toBeCloseTo(offsetAt(reverse, t) as number, 9);
    }
  });

  test("with one iteration the playhead is done after the lengthened play, on the pose the play ended on", () => {
    const timeline = new MorphTimeline(timing({ duration: 0.3, replay: replay({ to: 0.5 }) }), morphRandom("a"));
    expect(timeline.at(0.449)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.45)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("on a speech morph a replay is taken only when its turning point lies inside the speech", () => {
    const speech = () =>
      new MorphTimeline(timing({ trigger: "speech", duration: 0.3, replay: replay({ to: 0.5 }) }), () => 0.5);
    const inside = speech();
    inside.speak([[0, 1]], 0);
    expect(offsetAt(inside, 0.16)).toBeCloseTo(0.01 / 0.3, 9);
    expect(inside.at(0.44)).toMatchObject({ phase: "playing", play: 0 });
    const outside = speech();
    outside.speak([[0, 0.1]], 0);
    expect(offsetAt(outside, 0.2)).toBeCloseTo(0.2 / 0.3, 9);
    expect(outside.at(0.31)).toEqual({ phase: "off" });
    const ended = speech();
    ended.speak([[0, 1]], 0);
    expect(offsetAt(ended, 0.1)).toBeCloseTo(0.1 / 0.3, 9);
    ended.speak([[0, 0.12]], 0.1);
    expect(offsetAt(ended, 0.2)).toBeCloseTo(0.2 / 0.3, 9);
    expect(ended.at(0.31)).toEqual({ phase: "off" });
  });

  test("with sync = beep, beeps during the lengthened play start nothing and a beep at its end starts the next", () => {
    const timeline = new MorphTimeline(
      timing({ trigger: "speech", sync: "beep", duration: 0.3, replay: replay({ to: 0.5 }) }),
      () => 0.5,
    );
    timeline.speak([[0, 2]], 0, [0, 0.2, 0.4, 0.45]);
    expect(timeline.at(0.21)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.41)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.46)).toMatchObject({ phase: "playing", play: 1 });
    expect(offsetAt(timeline, 0.46)).toBeCloseTo(0.01 / 0.3, 9);
  });

  test("a reversed play meets its pauses in the reverse of the order a forward play meets them", () => {
    const path = replay({ from: 0.2, to: 0.7, count: 2, delay_min: 0.1, delay_max: 0.3 });
    const forward = new MorphTimeline(timing({ duration: 1, replay: path }), scripted([0.1, 0.9]).random);
    const reverse = new MorphTimeline(timing({ duration: 1, replay: path, direction: "reverse" }), scripted([0.1, 0.9]).random);
    const length = 1 + 2 * 0.5 + 0.12 + 0.28;
    expect(reverse.at(0.95)).toEqual({ phase: "playing", play: 0, offset: 0.7 });
    for (let ms = 3; ms < length * 1000; ms += 7) {
      expect(offsetAt(reverse, ms / 1000), `${ms} ms`).toBeCloseTo(offsetAt(forward, length - ms / 1000) as number, 9);
    }
    const speech = new MorphTimeline(timing({ trigger: "speech", duration: 1, replay: path, direction: "reverse" }), scripted([0.1, 0.9]).random);
    speech.speak([[0, 1.5]], 0);
    expect(speech.at(1)).toEqual({ phase: "playing", play: 0, offset: 0.7 });
    expect(offsetAt(speech, 1.6)).toBeCloseTo(0.18, 9);
    expect(offsetAt(speech, 1.75)).toBeCloseTo(0.03, 9);
    expect(speech.at(1.79)).toEqual({ phase: "off" });
  });

  test("the turning moments are the first the eased position reaches each position, however briefly", () => {
    const spike = "linear(0 0% 25%, 1 25.01%, 0 25.02%, 1 100%)";
    const found = morphReplayStretch(spike, 0.2, 0.8)!;
    expect(found.from).toBeCloseTo(0.25002, 9);
    expect(found.to).toBeCloseTo(0.25008, 9);
    const timeline = new MorphTimeline(timing({ duration: 1, easing: spike, replay: replay({ from: 0.2, to: 0.8, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(timeline.at(0.27)).toEqual({ phase: "playing", play: 0, offset: 0.8 });
    const drop = "linear(0 0%, 1 25%, 0 25%, 1 100%)";
    expect(morphReplayStretch(drop, 0.2, 0.8)).toEqual({ from: 0.05, to: 0.2 });
    const dropping = new MorphTimeline(timing({ duration: 1, easing: drop, replay: replay({ from: 0.2, to: 0.8 }) }), () => 0.5);
    expect(offsetAt(dropping, 0.21)).toBeCloseTo(0.24, 9);
    const rise = "linear(0 0%, 0 25%, 1 25%, 0 100%)";
    expect(firstMorphEasingReach(rise, 0.5)).toBe(0.25);
    const stationary = "cubic-bezier(1, 1.51, 0, 0.5)";
    const turn = firstMorphEasingReach(stationary, 0.878755);
    expect(Math.abs(turn - 0.5)).toBeLessThan(1e-6);
    const held = new MorphTimeline(timing({ duration: 1, easing: stationary, replay: replay({ from: 0.2, to: 0.878755, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(held.at(0.55)).toEqual({ phase: "playing", play: 0, offset: 0.878755 });
    const touching = "cubic-bezier(0.3333333333333333, 0.3333333333333333, 0.6666666666666666, -0.4)";
    const touch = firstMorphEasingReach(touching, 0.1);
    expect(Math.abs(touch - 0.25)).toBeLessThan(1e-6);
    const cube = "cubic-bezier(0.3333333333333333, 0, 0.6666666666666666, 0)";
    expect(parseMorphEasing(cube)!(firstMorphEasingReach(cube, 0.125))).toBeGreaterThanOrEqual(0.125);
    expect(firstMorphEasingReach(touching, 0.100000000000005)).toBeGreaterThan(0.4);
    const steep = "cubic-bezier(0.3333333333333333, 1, 0.6666666666666666, -100000000000000)";
    expect(firstMorphEasingReach(steep, 0.8)).toBeGreaterThan(0.99);
    expect(morphReplayStretch(steep, 0.2, 0.8)).toBeDefined();
    const steeply = new MorphTimeline(timing({ duration: 1, easing: steep, replay: replay({ to: 0.8, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(steeply.at(0.05)).toEqual({ phase: "playing", play: 0, offset: 0 });
    const peaked = new MorphTimeline(timing({ duration: 1, easing: touching, replay: replay({ to: 0.1, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(peaked.at(0.3)).toEqual({ phase: "playing", play: 0, offset: 0.1 });
    const edge = "linear(0.2 0%, 0.3 25%, 0 25%, 1 100%)";
    expect(firstMorphEasingReach(edge, 0.3)).toBe(0.24999999999999997);
    const edged = new MorphTimeline(timing({ duration: 1, easing: edge, replay: replay({ to: 0.3, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(edged.at(0.3)).toEqual({ phase: "playing", play: 0, offset: 0.3 });
    const controls = (easing: string): [number, number, number, number] | undefined => {
      if (easing === "ease-in-out") return [0.42, 0, 0.58, 1];
      const match = /^cubic-bezier\((.*)\)$/.exec(easing);
      return match ? (match[1]!.split(",").map(Number) as [number, number, number, number]) : undefined;
    };
    const bernstein = (a: number, b: number, t: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
    const bernsteinSlope = (a: number, b: number, t: number) => 3 * ((1 - t) * (1 - t) * a + 2 * (1 - t) * t * (b - a) + t * t * (1 - b));
    const parameterAt = ([x1, , x2]: [number, number, number, number], x: number) => {
      let lo = 0;
      let hi = 1;
      for (let n = 0; n < 200; n++) {
        const mid = (lo + hi) / 2;
        if (bernstein(x1, x2, mid) < x) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const oracle = ([x1, y1, x2, y2]: [number, number, number, number], position: number) => {
      const slope = (t: number) => bernsteinSlope(y1, y2, t);
      const grid = Array.from({ length: 20001 }, (_, i) => i / 20000);
      const extrema: number[] = [];
      for (let i = 1; i < grid.length; i++) {
        let lo = grid[i - 1]!;
        let hi = grid[i]!;
        if (Math.sign(slope(lo)) === Math.sign(slope(hi))) continue;
        for (let k = 0; k < 80; k++) {
          const mid = (lo + hi) / 2;
          if (Math.sign(slope(mid)) === Math.sign(slope(lo))) lo = mid;
          else hi = mid;
        }
        extrema.push(lo, hi);
      }
      const points = [...grid, ...extrema].sort((a, b) => a - b);
      const reaches = (t: number) => bernstein(y1, y2, t) >= position;
      const k = points.findIndex(reaches);
      if (k <= 0) return k === 0 ? 0 : 1;
      let lo = points[k - 1]!;
      let hi = points[k]!;
      for (let n = 0; n < 80; n++) {
        const mid = (lo + hi) / 2;
        if (reaches(mid)) hi = mid;
        else lo = mid;
      }
      return bernstein(x1, x2, hi);
    };
    const cubics: string[] = [touching];
    for (const x1 of [0, 0.3, 1]) for (const y1 of [-0.6, 0.5, 1.51]) for (const x2 of [0, 0.7, 1]) for (const y2 of [-0.8, 0.5, 1.6]) cubics.push(`cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`);
    const solverTolerance = 1e-6;
    const withinRounding: string[] = [];
    const scan = (easing: string, positions: number[], samples: number) => {
      const ease = parseMorphEasing(easing)!;
      const clamped = (x: number) => Math.max(0, Math.min(1, ease(x)));
      for (const position of positions) {
        const x = firstMorphEasingReach(easing, position);
        let scanned = 1;
        for (let i = 0; i <= samples; i++) {
          if (clamped(i / samples) >= position) {
            scanned = i / samples;
            break;
          }
        }
        const label = `${easing} @ ${position}`;
        expect(x, label).toBeLessThanOrEqual(scanned + solverTolerance);
        const curve = controls(easing);
        if (curve) {
          const expected = oracle(curve, position);
          if (Math.abs(x - expected) >= 2e-7) {
            const t = parameterAt(curve, Math.min(x, expected));
            expect(Math.abs(bernsteinSlope(curve[1], curve[3], t)), label).toBeLessThan(1e-6);
            expect(Math.abs(bernstein(curve[1], curve[3], t) - position), label).toBeLessThan(1e-14);
            withinRounding.push(label);
          }
        } else {
          expect(clamped(x), label).toBeGreaterThanOrEqual(position);
          expect(scanned - x, label).toBeLessThan(1 / samples);
        }
      }
    };
    for (const easing of ["cubic-bezier(0.3, 1.8, 0.7, -0.8)", "cubic-bezier(0.2, -0.6, 0.8, 1.6)", "ease-in-out", "steps(4, jump-both)", spike, drop, rise, stationary]) scan(easing, [0.1, 0.3, 0.35, 0.6, 0.878755, 0.9], 200000);
    for (const easing of cubics) scan(easing, [0.1, 0.35, 0.6, 0.878755, 0.9], 20000);
    expect(withinRounding).toEqual([]);
  });

  test("a stretch that takes no time under the easing makes no replay and draws nothing", () => {
    const { random, calls } = scripted([]);
    const timeline = new MorphTimeline(
      timing({ duration: 0.3, easing: "steps(3)", replay: replay({ from: 0.4, to: 0.6, chance: 0.5 }) }),
      random,
    );
    expect(timeline.at(0.31)).toEqual({ phase: "done", play: 0, offset: 1 });
    expect(calls).toEqual([]);
  });
});

describe("a play that replays several ranges (#2581)", () => {
  const range = (from: number, to: number, overrides: Partial<MorphReplay> = {}): MorphReplay => ({ from, to, chance: 1, count: 1, ...overrides });
  const scripted = (values: number[]) => {
    const calls: number[] = [];
    const random = () => {
      const value = values[calls.length] ?? 0.5;
      calls.push(value);
      return value;
    };
    return { random, calls };
  };
  const positions = (timeline: MorphTimeline, times: number[]) => times.map((t) => offsetAt(timeline, t) as number);
  const expectPositions = (timeline: MorphTimeline, expected: [number, number][]) => {
    for (const [t, offset] of expected) expect(offsetAt(timeline, t), `${t} s`).toBeCloseTo(offset, 9);
  };

  test("each entry replays its own stretch in turn, and the play's length adds every stretch it replays", () => {
    const timeline = new MorphTimeline(timing({ duration: 1, replay: [range(0, 0.4), range(0.4, 0.8, { count: 2 })] }), () => 0.5);
    expectPositions(timeline, [
      [0.2, 0.2],
      [0.39, 0.39],
      [0.41, 0.01],
      [0.8, 0.4],
      [1.19, 0.79],
      [1.21, 0.41],
      [1.59, 0.79],
      [1.61, 0.41],
      [2.19, 0.99],
    ]);
    expect(timeline.at(2.2 - 1e-9)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(2.2 + 1e-9)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("a nested entry replays when the play first reaches its end, and not when the outer entry carries the play back over it", () => {
    const timeline = new MorphTimeline(timing({ duration: 1, replay: [range(0, 0.8), range(0.2, 0.4)] }), () => 0.5);
    expectPositions(timeline, [
      [0.39, 0.39],
      [0.41, 0.21],
      [0.99, 0.79],
      [1.01, 0.01],
      [1.45, 0.45],
      [1.99, 0.99],
    ]);
    expect(timeline.at(2 + 1e-9)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("of two entries sharing an end, the first written makes all of its replays before the second makes any", () => {
    const timeline = new MorphTimeline(timing({ duration: 1, replay: [range(0, 0.5, { count: 2 }), range(0.25, 0.5)] }), () => 0.5);
    expectPositions(timeline, [
      [0.51, 0.01],
      [1.01, 0.01],
      [1.51, 0.26],
      [1.76, 0.51],
      [2.24, 0.99],
    ]);
    expect(timeline.at(2.25 + 1e-9)).toEqual({ phase: "done", play: 0, offset: 1 });
    const swapped = new MorphTimeline(timing({ duration: 1, replay: [range(0.25, 0.5), range(0, 0.5, { count: 2 })] }), () => 0.5);
    expectPositions(swapped, [
      [0.51, 0.26],
      [0.76, 0.01],
      [1.26, 0.01],
    ]);
  });

  test("each entry rolls its own chance, so one entry can replay while another does not", () => {
    const replay = [range(0, 0.4, { chance: 0.25 }), range(0.4, 0.8, { chance: 0.75 })];
    const { random, calls } = scripted([0.5, 0.5]);
    const timeline = new MorphTimeline(timing({ duration: 1, replay }), random);
    expectPositions(timeline, [
      [0.5, 0.5],
      [0.79, 0.79],
      [0.81, 0.41],
      [0.9, 0.5],
      [1.39, 0.99],
    ]);
    expect(timeline.at(1.4 + 1e-9)).toEqual({ phase: "done", play: 0, offset: 1 });
    expect(calls).toEqual([0.5, 0.5]);
  });

  test("entries draw in written order, each its rolls and pauses together, and the path holds each pause at that entry's end", () => {
    const replay = [
      range(0, 0.4, { chance: 0.25, delay_min: 0.1, delay_max: 0.3 }),
      range(0.4, 0.8, { chance: 0.75, count: 2, delay_min: 0.1, delay_max: 0.3 }),
    ];
    const { random, calls } = scripted([0.2, 0.5, 0.7, 0, 0.8]);
    const timeline = new MorphTimeline(timing({ duration: 1, replay }), random);
    expectPositions(timeline, [
      [0.39, 0.39],
      [0.5, 0.4],
      [0.7, 0.1],
      [1.39, 0.79],
      [1.45, 0.8],
      [1.6, 0.5],
      [2.09, 0.99],
    ]);
    expect(timeline.at(2.1 + 1e-9)).toEqual({ phase: "done", play: 0, offset: 1 });
    expect(calls).toEqual([0.2, 0.5, 0.7, 0, 0.8]);
  });

  test("under a stepped easing a single range lands on the same step as one range always did, at a reversed start and at a step boundary", () => {
    const replay = [range(0.2, 0.7, { count: 2 })];
    const reversed = new MorphTimeline(timing({ duration: 0.1, easing: "steps(7)", direction: "reverse", replay }), morphRandom("compat"));
    expect(reversed.at(0)).toEqual({ phase: "playing", play: 0, offset: 1 });
    const forward = new MorphTimeline(timing({ duration: 0.1, easing: "steps(4)", replay }), morphRandom("compat"));
    expect(forward.at(0.125)).toEqual({ phase: "playing", play: 0, offset: 0.5 });
  });

  test("a play with thousands of replays builds its path at once and ends after every stretch", () => {
    const began = performance.now();
    const timeline = new MorphTimeline(timing({ duration: 1, replay: [range(0.2, 0.7, { count: 4096 })] }), () => 0.5);
    expect(timeline.at(0)).toEqual({ phase: "playing", play: 0, offset: 0 });
    expect(performance.now() - began).toBeLessThan(1000);
    expect(offsetAt(timeline, 1 + 4096 * 0.5 - 0.25)).toBeCloseTo(0.75, 6);
    expect(timeline.at(1 + 4096 * 0.5 + 0.01)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("a block of one entry plays, and draws, exactly as the same fields written directly", () => {
    const fields = { from: "20%", to: "70%", chance: "50%", count: 3, delay_min: 0.05, delay_max: 0.2 };
    const values = [0.1, 0.4, 0.2, 0.8, 0.3, 0.6, 0.9, 0.2];
    const run = (replay: MorphReplay[] | undefined) => {
      const { random, calls } = scripted(values);
      const timeline = new MorphTimeline(
        timing({ duration: 0.5, iterations: 3, iteration_delay_min: 0.1, iteration_delay_max: 0.3, replay }),
        random,
      );
      const heads = Array.from({ length: 800 }, (_, ms) => timeline.at(ms * 0.005));
      return { heads, calls };
    };
    const direct = readMorphReplay(fields);
    const listed = readMorphReplay([fields]);
    expect(listed).toEqual(direct);
    expect(run(listed)).toEqual(run(direct));
    expect(run(direct).calls.length).toBeGreaterThan(3);
  });

  test("a range whose count is above 1000 reaches no player, and one of 1000 does", () => {
    expect(readMorphReplay({ chance: "100%", count: 1000 })).toEqual([{ from: 0, to: 1, chance: 1, count: 1000 }]);
    expect(readMorphReplay({ chance: "100%", count: 1001 })).toBeUndefined();
    expect(readMorphReplay({ chance: "100%", count: 100000000 })).toBeUndefined();
    expect(readMorphReplay([{ chance: "100%", count: 100000000 }, { chance: "50%", count: 2 }])).toEqual([
      { from: 0, to: 1, chance: 0.5, count: 2 },
    ]);
  });

  test("a reversed play runs the whole path backwards, pauses included", () => {
    const replay = [range(0, 0.4, { delay_min: 0.1, delay_max: 0.3 }), range(0.3, 0.8, { count: 2, delay_min: 0.1, delay_max: 0.3 })];
    const values = [0.1, 0.5, 0.9];
    const forward = new MorphTimeline(timing({ duration: 1, replay }), scripted(values).random);
    const reverse = new MorphTimeline(timing({ duration: 1, replay, direction: "reverse" }), scripted(values).random);
    const length = 1 + 0.4 + 2 * 0.5 + 0.12 + 0.2 + 0.28;
    expect(reverse.at(length - 1e-9)).toMatchObject({ phase: "playing" });
    expect(reverse.at(length + 1e-9)).toEqual({ phase: "done", play: 0, offset: 0 });
    for (let ms = 4; ms < length * 1000; ms += 7) {
      expect(offsetAt(reverse, ms / 1000), `${ms} ms`).toBeCloseTo(offsetAt(forward, length - ms / 1000) as number, 9);
    }
  });

  test("on a speech morph, replays of any entry whose turning points lie outside the speech are skipped, and one inside is taken", () => {
    const timeline = new MorphTimeline(
      timing({ trigger: "speech", duration: 1, replay: [range(0.3, 0.4), range(0.45, 0.5), range(0.8, 0.9)] }),
      () => 0.5,
    );
    timeline.speak([[0, 0.25], [0.85, 3]], 0);
    expect(positions(timeline, [0.41, 0.51, 0.89])).toEqual([0.41, 0.51, 0.89].map((t) => expect.closeTo(t, 9)));
    expectPositions(timeline, [
      [0.91, 0.81],
      [1.09, 0.99],
    ]);
    expect(timeline.at(1.09)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(1.11)).toMatchObject({ play: 1 });
  });

  test("on a reversed speech play, each replay outside the speech is skipped and spent, and another entry's replay inside resumed speech is still taken", () => {
    const resumed = new MorphTimeline(
      timing({ trigger: "speech", duration: 1, direction: "reverse", replay: [range(0.1, 0.2), range(0.6, 0.8)] }),
      () => 0.5,
    );
    resumed.speak([[0, 0.3], [0.8, 1.05]], 0);
    expectPositions(resumed, [
      [0.39, 0.61],
      [0.41, 0.59],
      [0.89, 0.11],
      [0.95, 0.15],
      [1.09, 0.01],
    ]);
    expect(resumed.at(1.11)).toEqual({ phase: "off" });
  });

  test("on a reversed speech play with speech throughout, the play is the forward play read backwards, and a skipped replay spends every replay due at that moment", () => {
    const replay = [range(0, 0.4), range(0.4, 0.8, { count: 2 })];
    const spoken = (spans: [number, number][]) => {
      const timeline = new MorphTimeline(timing({ trigger: "speech", duration: 1, direction: "reverse", replay }), () => 0.5);
      timeline.speak(spans, 0);
      return timeline;
    };
    const inside = spoken([[0, 5]]);
    const forward = new MorphTimeline(timing({ duration: 1, replay }), () => 0.5);
    for (let ms = 4; ms < 2200; ms += 7) {
      expect(offsetAt(inside, ms / 1000), `${ms} ms`).toBeCloseTo(offsetAt(forward, 2.2 - ms / 1000) as number, 9);
    }
    const ended = spoken([[0, 0.5], [1.5, 5]]);
    expectPositions(ended, [
      [0.59, 0.41],
      [0.7, 0.3],
      [0.99, 0.01],
    ]);
    expect(ended.at(1.01)).toEqual({ phase: "off" });
  });
});
