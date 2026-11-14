import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BeatMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeatMessage";
import { BeginReconcileMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/BeginReconcileMessage";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { AudioClock } from "../../app/AudioClock";
import UIManager from "../../app/managers/UIManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const LETTER_STEP = 0.1;
const PREVIEW = true;
const PLAY = false;
const TEXT = "abcdefghij";

const clear = () =>
  WriteTextMessage.type.request({ target: "dialogue", instructions: [], instant: true });

const line = (instant: boolean, time?: number) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [...TEXT].map((text, i) => ({
      text,
      after: i * LETTER_STEP,
      over: 0,
    })) as any,
    instant,
    ...(time != null ? { time } : {}),
  });

const beat = (instant: boolean, time?: number) =>
  BeatMessage.type.notification({
    messages: [BeginReconcileMessage.type.notification({}), clear(), line(instant, time)],
    ...(time != null ? { time } : {}),
    sweep: true,
  } as any);

const makePage = (previewing: boolean) => {
  timeline.currentTime = 0;
  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="dialogue"><div class="text"></div></div>`;
  document.body.appendChild(overlay);
  const app: any = {
    previewing,
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const ui = new UIManager(app);
  MorphPlayback.for(overlay).configure({ requestFrame: () => 0, cancelFrame: () => {} });
  ui.onUpdate({ elapsedTime: 0 } as any);
  let elapsed = 0;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
  const frame = (ms: number) => {
    timeline.currentTime += ms;
    for (const cb of frames.splice(0)) {
      cb(timeline.currentTime);
    }
    elapsed += ms / 1000;
    ui.onUpdate({ elapsedTime: elapsed } as any);
    for (const animation of animations) {
      animation.update();
    }
  };
  const letters = () => Array.from(overlay.querySelectorAll(".dialogue .text .text_letter"));
  const revealed = () =>
    letters().filter((letter) => {
      const reveal = (letter as any).__sdReveal as TimedAnimation | undefined;
      const time = reveal?.currentTime;
      return time != null && time >= Number(reveal!.effect.timing.delay ?? 0) - 1e-6;
    }).length;
  const send = async (message: unknown) => {
    ui.onReceiveNotification(message as any);
    await flushMicrotasks(20);
    frame(0);
    await flushMicrotasks(20);
  };
  return { letters, revealed, frame, send, now: () => timeline.currentTime };
};

let previous: { Animation: unknown; KeyframeEffect: unknown; timeline: unknown };

beforeEach(() => {
  const g = globalThis as any;
  previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: (document as any).timeline,
  };
  animations.length = 0;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: timeline });
  g.CSS ??= {};
  g.CSS.escape ??= (value: string) => value;
});

afterEach(() => {
  const g = globalThis as any;
  g.Animation = previous.Animation;
  g.KeyframeEffect = previous.KeyframeEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: previous.timeline });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("a played preview beat over the same still (#2257, correcting #2256)", () => {
  test("types its letters out over the beat, though the still already shows the same text, and ends with every letter shown", async () => {
    const page = makePage(PREVIEW);
    await page.send(beat(true));
    expect(page.letters()).toHaveLength(TEXT.length);
    expect(page.revealed()).toBe(TEXT.length);
    page.frame(1_000);
    await page.send(beat(false, page.now()));
    expect(page.letters()).toHaveLength(TEXT.length);
    expect(page.revealed()).toBeLessThanOrEqual(1);
    page.frame(450);
    const midway = page.revealed();
    expect(midway).toBeGreaterThan(1);
    expect(midway).toBeLessThan(TEXT.length);
    page.frame(1_000);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test("types out again on the next play, after the beat settles back to its still", async () => {
    const page = makePage(PREVIEW);
    await page.send(beat(true));
    page.frame(1_000);
    await page.send(beat(false, page.now()));
    page.frame(2_000);
    await page.send(beat(true));
    expect(page.revealed()).toBe(TEXT.length);
    page.frame(1_000);
    await page.send(beat(false, page.now()));
    expect(page.revealed()).toBeLessThanOrEqual(1);
    page.frame(450);
    expect(page.revealed()).toBeLessThan(TEXT.length);
  });
});

describe("writes the replay leaves alone (#2257)", () => {
  test("leaves a line drawn at once alone when PLAY writes the same line timed", async () => {
    const page = makePage(PLAY);
    await page.send(beat(true));
    expect(page.revealed()).toBe(TEXT.length);
    const before = page.letters();
    page.frame(1_000);
    await page.send(beat(false, page.now()));
    expect(page.letters()).toEqual(before);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test("leaves a line PLAY typed and a click finished at once alone when the same line comes again", async () => {
    const page = makePage(PLAY);
    await page.send(beat(false, page.now()));
    page.frame(250);
    expect(page.revealed()).toBeLessThan(TEXT.length);
    await page.send(beat(true));
    expect(page.revealed()).toBe(TEXT.length);
    const before = page.letters();
    page.frame(1_000);
    await page.send(beat(false, page.now()));
    expect(page.letters()).toEqual(before);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test.each([
    ["PLAY", false],
    ["the preview", true],
  ])("leaves a line %s has already typed alone when the same line is reconciled again", async (_app, previewing) => {
    const page = makePage(previewing);
    await page.send(beat(false, page.now()));
    page.frame(2_000);
    expect(page.revealed()).toBe(TEXT.length);
    const before = page.letters();
    await page.send(beat(false, page.now()));
    expect(page.letters()).toEqual(before);
    expect(page.revealed()).toBe(TEXT.length);
  });
});
