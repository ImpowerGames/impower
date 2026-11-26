import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WriteTextMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { AudioClock } from "../../src/app/AudioClock";
import UIManager from "../../src/app/managers/UIManager";
import { MorphPlayback } from "../../src/app/morph/MorphPlayback";
import { flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const LETTER_STEP = 0.1;
const TEXT = "abcdefghij";

const line = (options: { instant?: boolean; time?: number; held?: boolean } = {}) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [...TEXT].map((text, i) => ({
      text,
      after: i * LETTER_STEP,
      over: 0,
    })) as any,
    instant: options.instant ?? false,
    time: options.time ?? 0,
    ...(options.held ? { held: true } : {}),
  });

const makePage = () => {
  timeline.currentTime = 0;
  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="dialogue"><div class="text"></div></div>`;
  document.body.appendChild(overlay);
  const app: any = {
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const ui = new UIManager(app);
  const morphs = MorphPlayback.for(overlay);
  morphs.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  ui.onUpdate({ elapsedTime: 0 } as any);
  let elapsed = 0;
  const frame = (ms: number) => {
    timeline.currentTime += ms;
    elapsed += ms / 1000;
    ui.onUpdate({ elapsedTime: elapsed } as any);
    for (const animation of animations) {
      animation.update();
    }
  };
  const letters = () =>
    Array.from(overlay.querySelectorAll(".dialogue .text .text_letter"));
  const revealed = () =>
    letters().filter((letter) => {
      const reveal = (letter as any).__sdReveal as TimedAnimation | undefined;
      if (!reveal) {
        return (letter as HTMLElement).style.opacity === "1";
      }
      const time = reveal.currentTime;
      return time != null && time >= Number(reveal.effect.timing.delay ?? 0);
    }).length;
  const write = async (options: Parameters<typeof line>[0]) => {
    void ui.onReceiveRequest(line(options));
    await flushMicrotasks(10);
  };
  const box = () => overlay.querySelector(".dialogue") as any;
  return { box, letters, revealed, frame, write };
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
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: timeline,
  });
  g.CSS ??= {};
  g.CSS.escape ??= (value: string) => value;
});

afterEach(() => {
  const g = globalThis as any;
  g.Animation = previous.Animation;
  g.KeyframeEffect = previous.KeyframeEffect;
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: previous.timeline,
  });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("a line held while its box arrives (#2739)", () => {
  test("lays its letters out hidden, and types them from the time it is started", async () => {
    const page = makePage();
    await page.write({ held: true });
    expect(page.letters()).toHaveLength(TEXT.length);
    expect(page.box().__sdWait).toBeUndefined();
    page.frame(2_000);
    expect(page.revealed()).toBe(0);

    await page.write({ time: 2_000 });
    expect(page.letters()).toHaveLength(TEXT.length);
    page.frame(250);
    expect(page.revealed()).toBe(3);
    page.frame(1_000);
    expect(page.revealed()).toBe(TEXT.length);
  });

  test("shows every letter at once when the line is shown whole during the wait", async () => {
    const page = makePage();
    await page.write({ held: true });
    page.frame(500);
    expect(page.revealed()).toBe(0);

    await page.write({ instant: true });
    page.frame(0);
    expect(page.revealed()).toBe(TEXT.length);
  });
});
