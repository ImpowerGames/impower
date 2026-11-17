import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WriteTextMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteTextMessage";
import { AudioClock } from "../../app/AudioClock";
import UIManager from "../../app/managers/UIManager";
import { flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const LETTER_STEP = 0.1;
const TEXT = "ab cd";

const line = (instant: boolean) =>
  WriteTextMessage.type.request({
    target: "dialogue",
    instructions: [...TEXT].map((text, i) => ({
      text,
      after: i * LETTER_STEP,
      over: 0,
    })) as any,
    instant,
    time: 0,
  });

const makePage = () => {
  timeline.currentTime = 0;
  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="dialogue"><div class="text"></div></div>`;
  document.body.appendChild(overlay);
  const ui = new UIManager({
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  } as any);
  ui.onUpdate({ elapsedTime: 0 } as any);
  let elapsed = 0;
  let paused = false;
  const frame = async (ms: number) => {
    timeline.currentTime += ms;
    if (!paused) {
      elapsed += ms / 1000;
    }
    ui.onUpdate({ elapsedTime: elapsed } as any);
    for (const animation of animations) {
      animation.update();
    }
    await flushMicrotasks(10);
  };
  const letters = () =>
    Array.from(
      overlay.querySelectorAll(".dialogue .text .text_letter"),
    ) as HTMLElement[];
  const reveals = () =>
    animations.filter((animation) =>
      letters().includes(animation.effect.target as HTMLElement),
    );
  return {
    letters,
    reveals,
    frame,
    pause() {
      paused = true;
      ui.onPause();
    },
    unpause() {
      paused = false;
      ui.onUnpause();
    },
    async write(instant: boolean) {
      void ui.onReceiveRequest(line(instant));
      await flushMicrotasks(10);
    },
  };
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
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
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

const expectSettled = (page: ReturnType<typeof makePage>) => {
  expect(page.letters()).toHaveLength(TEXT.length);
  expect(page.reveals()).toHaveLength(TEXT.length);
  for (const reveal of page.reveals()) {
    expect(reveal.playState).toBe("idle");
  }
  for (const letter of page.letters()) {
    expect(letter.style.opacity).toBe("1");
    expect((letter as any).__sdReveal).toBeUndefined();
  }
};

describe("a revealed letter holds no finished animation (#2427)", () => {
  test("a still written at once leaves its letters shown by their own style", async () => {
    const page = makePage();
    await page.write(true);
    expectSettled(page);
  });

  test("a typed line leaves each letter shown by its own style once its reveal ends", async () => {
    const page = makePage();
    await page.write(false);
    await page.frame(150);
    const [first, second, third] = page.letters();
    expect(first!.style.opacity).toBe("1");
    expect(second!.style.opacity).toBe("1");
    expect(third!.style.opacity).toBe("0");
    expect((third as any).__sdReveal.playState).toBe("running");
    await page.frame(1_000);
    expectSettled(page);
  });

  test("a still written while paused leaves its letters shown by their own style before the game resumes", async () => {
    const page = makePage();
    page.pause();
    await page.write(true);
    expectSettled(page);
  });

  test("a typed line written while paused settles the letters already due and holds the rest", async () => {
    const page = makePage();
    await page.frame(150);
    page.pause();
    await page.write(false);
    const [first, second, third] = page.letters();
    expect(first!.style.opacity).toBe("1");
    expect((first as any).__sdReveal).toBeUndefined();
    expect(second!.style.opacity).toBe("1");
    expect((second as any).__sdReveal).toBeUndefined();
    expect(third!.style.opacity).toBe("0");
    expect((third as any).__sdReveal.playState).toBe("paused");
    page.unpause();
    await page.frame(1_000);
    expectSettled(page);
  });

  test("a reveal held by a pause keeps its animation until it ends after the pause", async () => {
    const page = makePage();
    await page.write(false);
    await page.frame(150);
    page.pause();
    await page.frame(1_000);
    const held = page.letters()[2]!;
    expect(held.style.opacity).toBe("0");
    expect((held as any).__sdReveal.playState).toBe("paused");
    page.unpause();
    await page.frame(1_000);
    expectSettled(page);
  });
});
