import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AnimateElementsMessage } from "../../../spark-engine/src/game/modules/ui/classes/messages/AnimateElementsMessage";
import { AudioClock } from "../../src/app/AudioClock";
import UIManager from "../../src/app/managers/UIManager";

class FilledEffect {
  constructor(
    public target: HTMLElement,
    public keyframes: Keyframe[],
    public timing: EffectTiming = {},
  ) {}
  getKeyframes() {
    return this.keyframes.map((k, i, all) => ({
      ...k,
      offset: null,
      computedOffset: all.length === 1 ? 1 : i / (all.length - 1),
      easing: "linear",
      composite: "auto",
    }));
  }
  getTiming() {
    return this.timing;
  }
  getComputedTiming() {
    return { endTime: Number(this.timing.duration ?? 0) };
  }
}

const played: FilledAnimation[] = [];

class FilledAnimation {
  playState: AnimationPlayState = "idle";
  startTime: number | null = null;
  finished: Promise<FilledAnimation> = Promise.resolve(this);
  protected base: Record<string, string> = {};
  constructor(public effect: FilledEffect) {
    played.push(this);
  }
  protected apply() {
    const last = this.effect.keyframes[this.effect.keyframes.length - 1] ?? {};
    for (const [prop, value] of Object.entries(last)) {
      this.base[prop] ??= (this.effect.target.style as any)[prop];
      (this.effect.target.style as any)[prop] = String(value);
    }
    this.playState = "finished";
  }
  play() {
    this.apply();
  }
  finish() {
    this.apply();
  }
  cancel() {
    for (const [prop, value] of Object.entries(this.base)) {
      (this.effect.target.style as any)[prop] = value;
    }
    this.base = {};
    this.playState = "idle";
  }
}

const makePage = (previewing: boolean) => {
  const overlay = document.createElement("div");
  overlay.innerHTML = `<style>.layout_textbox { opacity: 1; }</style><div class="layout_textbox"></div>`;
  document.body.appendChild(overlay);
  const ui = new UIManager({
    previewing,
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  } as any);
  const box = overlay.querySelector(".layout_textbox") as HTMLElement;
  (ui as any)._elements.set("box", box);
  const animate = (keyframes: Record<string, unknown>[]) =>
    ui.onReceiveRequest(
      AnimateElementsMessage.type.request({
        effects: [
          {
            element: "box",
            animations: [{ keyframes, timing: { duration: 0, fill: "both" } } as any],
          },
        ],
      }),
    );
  return { box, animate };
};

let previous: { Animation: unknown; KeyframeEffect: unknown; timeline: unknown };

beforeEach(() => {
  const g = globalThis as any;
  previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: (document as any).timeline,
  };
  played.length = 0;
  g.Animation = FilledAnimation;
  g.KeyframeEffect = FilledEffect;
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: { currentTime: 0 },
  });
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
});

describe("a layout's enter animation once a played preview beat settles (#2419)", () => {
  test("leaves no finished animation on a layout it brought to the state the still mounts it in", async () => {
    const page = makePage(true);
    await page.animate([{ opacity: 1 }]);
    expect(played).toHaveLength(1);
    expect(played[0]!.startTime).toBe(0);
    expect(played[0]!.playState).toBe("idle");
    expect(page.box.style.opacity).toBe("");
  });

  test("keeps an animation whose end differs from the layout's own style", async () => {
    const page = makePage(true);
    await page.animate([{ opacity: 0 }]);
    expect(played[0]!.playState).toBe("finished");
    expect(page.box.style.opacity).toBe("0");
  });

});

describe("a layout's enter animation once PLAY's beat settles (#2420)", () => {
  test("leaves no finished animation on a layout it brought to the state the still mounts it in", async () => {
    const page = makePage(false);
    await page.animate([{ opacity: 1 }]);
    expect(played).toHaveLength(1);
    expect(played[0]!.playState).toBe("idle");
    expect(page.box.style.opacity).toBe("");
  });

  test("keeps an animation whose end differs from the layout's own style", async () => {
    const page = makePage(false);
    await page.animate([{ opacity: 0 }]);
    expect(played[0]!.playState).toBe("finished");
    expect(page.box.style.opacity).toBe("0");
  });
});
