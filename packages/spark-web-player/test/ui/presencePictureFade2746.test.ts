import { describe, expect, test } from "vitest";
import PresencePlayer from "../../../spark-dom/src/classes/PresencePlayer";

const PRESENCE = "data-presence";

class FakeAnimation {
  playState: AnimationPlayState;
  cancelled = false;
  effect: {
    target: Element;
    getTiming: () => { duration: number; fill: FillMode };
    getComputedTiming: () => { endTime: number };
  };
  constructor(target: Element, duration: number, fill: FillMode, playState: AnimationPlayState) {
    this.playState = playState;
    this.effect = {
      target,
      getTiming: () => ({ duration, fill }),
      getComputedTiming: () => ({ endTime: duration }),
    };
  }
  cancel() {
    this.cancelled = true;
  }
}

function element(animations: FakeAnimation[]) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  (el as any).getAnimations = (options?: { subtree?: boolean }) =>
    options?.subtree ? [] : animations.filter((a) => !a.cancelled);
  return el;
}

const hold = { add: () => Promise.resolve() } as never;

describe("an arriving picture takes its @initial look (#2746)", () => {
  test("an arrival drops the finished zero-length picture show the element holds, and keeps any other animation", async () => {
    const pins: FakeAnimation[] = [];
    const el = element(pins);
    const pin = new FakeAnimation(el, 0, "both", "finished");
    const running = new FakeAnimation(el, 300, "both", "running");
    const timed = new FakeAnimation(el, 300, "both", "finished");
    pins.push(pin, running, timed);
    el.setAttribute(PRESENCE, "initial");
    await new PresencePlayer(hold, () => false).play(el, "show");
    expect(pin.cancelled).toBe(true);
    expect(running.cancelled).toBe(false);
    expect(timed.cancelled).toBe(false);
  });

  test("a leave keeps the element's zero-length picture animations", async () => {
    const pins: FakeAnimation[] = [];
    const el = element(pins);
    const pin = new FakeAnimation(el, 0, "both", "finished");
    pins.push(pin);
    await new PresencePlayer(hold, () => false).play(el, "hide");
    expect(pin.cancelled).toBe(false);
  });
});
