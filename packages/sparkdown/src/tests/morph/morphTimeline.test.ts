import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import { firstMorphEasingReach, parseMorphEasing } from "../../morph/easing";
import { morphFrameState, morphPosesAt, renderMorphAt, renderMorphFrame } from "../../morph/render";
import { MorphTimeline, morphRandom, morphReplayStretch } from "../../morph/timeline";
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
  const replay = (overrides: Partial<MorphReplay> = {}): MorphReplay[] => [{ start: 0, end: 1, chance: 1, count: 1, ...overrides }];
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
      timing({ duration: 0.35, replay: replay({ end: 2 / 3 }), iterations: 2, iteration_delay_min: 0.1, iteration_delay_max: 0.1 }),
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
      const timeline = new MorphTimeline(timing({ duration: 0.3, replay: replay({ end: 0.5, chance: 0.5, count: 2 }) }), random);
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
      timing({ duration: 0.3, replay: replay({ start: 0.25, end: 0.75, delay_min: 0.1, delay_max: 0.3 }) }),
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
    const path = replay({ start: 0.2, end: 0.7, count: 2, delay_min: 0.05, delay_max: 0.05 });
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
    const timeline = new MorphTimeline(timing({ duration: 0.3, replay: replay({ end: 0.5 }) }), morphRandom("a"));
    expect(timeline.at(0.449)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.45)).toEqual({ phase: "done", play: 0, offset: 1 });
  });

  test("on a speech morph a replay is taken only when its turning point lies inside the speech", () => {
    const speech = () =>
      new MorphTimeline(timing({ trigger: "speech", duration: 0.3, replay: replay({ end: 0.5 }) }), () => 0.5);
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
      timing({ trigger: "speech", sync: "beep", duration: 0.3, replay: replay({ end: 0.5 }) }),
      () => 0.5,
    );
    timeline.speak([[0, 2]], 0, [0, 0.2, 0.4, 0.45]);
    expect(timeline.at(0.21)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.41)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.46)).toMatchObject({ phase: "playing", play: 1 });
    expect(offsetAt(timeline, 0.46)).toBeCloseTo(0.01 / 0.3, 9);
  });

  test("a reversed play meets its pauses in the reverse of the order a forward play meets them", () => {
    const path = replay({ start: 0.2, end: 0.7, count: 2, delay_min: 0.1, delay_max: 0.3 });
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
    const timeline = new MorphTimeline(timing({ duration: 1, easing: spike, replay: replay({ start: 0.2, end: 0.8, delay_min: 0.1, delay_max: 0.1 }) }), () => 0.5);
    expect(timeline.at(0.27)).toEqual({ phase: "playing", play: 0, offset: 0.8 });
    const drop = "linear(0 0%, 1 25%, 0 25%, 1 100%)";
    expect(morphReplayStretch(drop, 0.2, 0.8)).toEqual({ from: 0.05, to: 0.2 });
    const dropping = new MorphTimeline(timing({ duration: 1, easing: drop, replay: replay({ start: 0.2, end: 0.8 }) }), () => 0.5);
    expect(offsetAt(dropping, 0.21)).toBeCloseTo(0.24, 9);
    const rise = "linear(0 0%, 0 25%, 1 25%, 0 100%)";
    expect(firstMorphEasingReach(rise, 0.5)).toBe(0.25);
    for (const easing of ["cubic-bezier(0.3, 1.8, 0.7, -0.8)", "cubic-bezier(0.2, -0.6, 0.8, 1.6)", "ease-in-out", "steps(4, jump-both)", spike, drop, rise]) {
      const ease = parseMorphEasing(easing)!;
      const clamped = (x: number) => Math.max(0, Math.min(1, ease(x)));
      for (const position of [0.1, 0.35, 0.6, 0.9]) {
        const x = firstMorphEasingReach(easing, position);
        let scanned = 1;
        for (let i = 0; i <= 200000; i++) {
          if (clamped(i / 200000) >= position) {
            scanned = i / 200000;
            break;
          }
        }
        expect(clamped(x), `${easing} @ ${position}`).toBeGreaterThanOrEqual(position);
        expect(x, `${easing} @ ${position}`).toBeLessThanOrEqual(scanned);
        expect(scanned - x, `${easing} @ ${position}`).toBeLessThan(1 / 200000);
      }
    }
  });

  test("a stretch that takes no time under the easing makes no replay and draws nothing", () => {
    const { random, calls } = scripted([]);
    const timeline = new MorphTimeline(
      timing({ duration: 0.3, easing: "steps(3)", replay: replay({ start: 0.4, end: 0.6, chance: 0.5 }) }),
      random,
    );
    expect(timeline.at(0.31)).toEqual({ phase: "done", play: 0, offset: 1 });
    expect(calls).toEqual([]);
  });
});
