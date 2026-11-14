import { describe, expect, test } from "vitest";
import { MorphTimeline } from "../../morph/timeline";
import type { MorphTiming } from "../../morph/types";

const beepSynced = (overrides: Partial<MorphTiming> = {}) =>
  new MorphTimeline(
    { trigger: "speech", sync: "beep", duration: 0.16, delay: 0, easing: "linear", iterations: 1, direction: "normal", ...overrides },
    () => 0.5,
  );

const startsOf = (timeline: MorphTimeline, until: number, step = 0.005) => {
  const starts: number[] = [];
  let last = -1;
  for (let i = 0; i * step <= until + 1e-9; i += 1) {
    const t = i * step;
    const head = timeline.at(t);
    if (head.phase === "playing" && head.play !== last) {
      starts.push(Math.round((t - head.offset * 0.16) * 1000) / 1000);
      last = head.play;
    }
  }
  return starts;
};

const BEEPS = [0, 0.075, 0.15, 0.225, 0.3, 0.375];

describe("a beep-synced speech morph's plays (#2261)", () => {
  test("a play starts on a beep, beeps during a play are skipped, and the next starts on the first beep after the play ends", () => {
    const timeline = beepSynced();
    timeline.speak([[0, 0.45]], 0, BEEPS);
    expect(startsOf(timeline, 1)).toEqual([0, 0.225]);
  });

  test("a beep at the moment a play ends starts the next play", () => {
    const timeline = beepSynced({ duration: 0.15 });
    timeline.speak([[0, 0.6]], 0, [0, 0.15, 0.4]);
    const offsets = [0.149, 0.15, 0.151].map((t) => timeline.at(t));
    expect(offsets[0]).toMatchObject({ phase: "playing", play: 0 });
    expect(offsets[1]).toEqual({ phase: "playing", play: 1, offset: 0 });
    expect(offsets[2]).toMatchObject({ phase: "playing", play: 1 });
    expect(timeline.at(0.35)).toEqual({ phase: "between", play: 1, offset: 1 });
    expect(timeline.at(0.4)).toEqual({ phase: "playing", play: 2, offset: 0 });
  });

  test("the first play waits for the first beep, not the first span", () => {
    const timeline = beepSynced();
    timeline.speak([[0, 0.45]], 0, [0.1, 0.2]);
    expect(timeline.at(0.05)).toEqual({ phase: "off" });
    expect(timeline.at(0.1)).toEqual({ phase: "playing", play: 0, offset: 0 });
  });

  test("the play in progress after the last beep finishes, and none starts after it", () => {
    const timeline = beepSynced();
    timeline.speak([[0, 0.45]], 0, BEEPS);
    expect(timeline.at(0.38)).toMatchObject({ phase: "playing", play: 1 });
    expect(timeline.at(0.5)).toEqual({ phase: "off" });
    expect(timeline.at(2)).toEqual({ phase: "off" });
  });

  test("speech that skips to the whole line keeps the play in progress and starts none after it", () => {
    const timeline = beepSynced();
    timeline.speak([[0, 0.45]], 0, BEEPS);
    expect(timeline.at(0.05)).toMatchObject({ phase: "playing", play: 0 });
    timeline.speak([], 0.05, []);
    expect(timeline.at(0.1)).toMatchObject({ phase: "playing", play: 0 });
    expect(timeline.at(0.17)).toEqual({ phase: "off" });
    expect(startsOf(timeline, 1)).toEqual([0]);
  });

  test("speech with no beep schedule, as a voice clip gives, flaps back to back for its spans", () => {
    const timeline = beepSynced();
    timeline.speak([[0, 0.5]], 0);
    expect(startsOf(timeline, 1)).toEqual([0, 0.16, 0.32, 0.48]);
  });

  test("a play shorter than the beep tolerance never starts twice on one beep", () => {
    const timeline = beepSynced({ duration: 0.0000000005 });
    timeline.speak([[0, 0.5]], 0, [0, 0.075]);
    expect(timeline.at(0.075)).toEqual({ phase: "playing", play: 1, offset: 0 });
    expect(timeline.at(0.1)).toEqual({ phase: "between", play: 1, offset: 1 });
    expect(timeline.at(1)).toEqual({ phase: "off" });
  });

  test("a play too short to move the clock past its own start ends the loop instead of repeating", () => {
    const timeline = beepSynced({ sync: "none", duration: 1e-15 });
    timeline.speak([[100, 101]], 0);
    expect(timeline.at(100.5)).toEqual({ phase: "between", play: 0, offset: 1 });
  });

  test("a `sync = none` speech morph loops inside the spans and ignores the beeps", () => {
    const timeline = beepSynced({ sync: "none" });
    timeline.speak([[0, 0.5]], 0, [0.1, 0.4]);
    expect(startsOf(timeline, 1)).toEqual([0, 0.16, 0.32, 0.48]);
  });
});
