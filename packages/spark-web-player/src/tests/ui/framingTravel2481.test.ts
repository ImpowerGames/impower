import { afterEach, describe, expect, test } from "vitest";
import { writeBeatText } from "@impower/spark-engine/src/game/core/classes/presenters/VisualNovelPresenter";
import { writeStage } from "@impower/spark-engine/src/game/core/classes/presenters/stage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

define SKY as image with
  src = "https://example.com/sky.png"
end

define P as image with
  src = "https://example.com/p.png"
end

framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}

layout main {
  stage {
    backdrop {
      image
    }
    portrait {
      mask.shade
      image
    }
  }
  textbox {
    dialogue {
      text
    }
    action {
      text
    }
  }
  screen {
    animation
  }
}



scene start
  [[show backdrop BG at right]]
  [[show portrait P]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  [[animate portrait to sofa over 2s]]
  Travelling.
  [[animate backdrop to sofa over 2s ease linear]]
  Redirected.
  [[show backdrop SKY]]
  A new picture.
end

scene hidden
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[hide backdrop]]
  Hidden.
end

scene reshown
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[show backdrop]]
  Shown while it travels.
end

scene repeated
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[animate backdrop to left over 4s ease linear]]
  The same travel again.
end

scene same_beat
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  [[show backdrop]]
  Travelling and shown.
  [[animate backdrop to right over 2s ease linear]]
  Redirected.
end

scene twice
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  [[animate backdrop to sofa over 2s ease linear]]
  Two travels on one line.
end

scene flash
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s with screenflash]]
  Travelling in a flash.
end

scene replaced_later
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[show backdrop SKY after 2s]]
  Replaced in two seconds.
end

scene hidden_later
  [[show backdrop BG at right]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[hide backdrop after 2s]]
  Hidden in two seconds.
end

scene later
  [[show backdrop BG at right]]
  [[show portrait P]]
  Placed.
  [[animate backdrop to left over 4s ease linear]]
  Travelling.
  [[show portrait P at sofa]]
  A later line.
  Another later line.
end
`;

const RIGHT = { translate: "calc(100cqw - 100%) calc(50cqh - 50%)", scale: "1" };
const LEFT = { translate: "0px calc(50cqh - 50%)", scale: "1" };
const SOFA = { translate: "calc(60cqw - 62%) calc(100cqh - 110%)", scale: "1.2" };
const QUARTER_TO_LEFT = { translate: "calc(75cqw - 75%) calc(50cqh - 50%)", scale: "1" };
const THREE_QUARTERS_TO_LEFT = { translate: "calc(25cqw - 25%) calc(50cqh - 50%)", scale: "1" };

const pictureEls = (overlay: HTMLElement, layer: string) =>
  Array.from(
    overlay.querySelectorAll(`.${layer} > .image > .instance, .${layer} > .mask > .instance`),
  ) as HTMLElement[];

const placed = (el: HTMLElement) => ({
  translate: el.style.getPropertyValue("translate"),
  scale: el.style.getPropertyValue("scale") || "1",
});

const travelsOf = (el: Element) =>
  animations.filter(
    (animation) => animation.effect.target === el && "translate" in (animation.effect.getKeyframes()[0] ?? {}),
  );

const keyframesOf = (animation: TimedAnimation) =>
  animation.effect.getKeyframes() as Record<string, unknown>[];

const frames: FrameRequestCallback[] = [];

const advance = async (ms: number) => {
  timeline.currentTime += ms;
  for (const animation of animations) {
    animation.update();
  }
  for (const frame of frames.splice(0)) {
    frame(timeline.currentTime);
  }
  await flushMicrotasks(10);
};

let restore: (() => void) | undefined;

const installTimedAnimations = () => {
  const g = globalThis as any;
  const view = document.defaultView as any;
  const previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: (document as any).timeline,
    requestAnimationFrame: view.requestAnimationFrame,
  };
  animations.length = 0;
  frames.length = 0;
  view.requestAnimationFrame = (callback: FrameRequestCallback) => frames.push(callback);
  timeline.currentTime = 0;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: timeline });
  restore = () => {
    g.Animation = previous.Animation;
    g.KeyframeEffect = previous.KeyframeEffect;
    Object.defineProperty(document, "timeline", { configurable: true, value: previous.timeline });
    view.requestAnimationFrame = previous.requestAnimationFrame;
  };
};

afterEach(() => {
  restore?.();
  restore = undefined;
});

async function start(scene = "start") {
  const h = createDOMHarness(SOURCE);
  await h.ready;
  installTimedAnimations();
  h.jumpTo(scene);
  return h;
}

async function play(h: DOMHarness, instant: boolean) {
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  void writeBeatText(h.game.module.ui, beat!, instant);
  writeStage(h.game, beat!, instant);
  await flushMicrotasks(20);
}

describe("a layer's picture travels to a framing (I-2481)", () => {
  test("to creates no picture element, animates translate and scale only, and rests at the framing", async () => {
    const h = await start();
    await play(h, true);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    expect(placed(backdrop!)).toEqual(RIGHT);
    const portrait = pictureEls(h.overlay, "portrait");
    expect(portrait.map((el) => el.parentElement!.classList.contains("mask"))).toEqual([true, false]);
    await play(h, false);
    expect(pictureEls(h.overlay, "backdrop")).toEqual([backdrop]);
    expect(pictureEls(h.overlay, "portrait")).toEqual(portrait);
    for (const el of [backdrop!, ...portrait]) {
      expect(travelsOf(el)).toHaveLength(1);
      const [travel, ...more] = travelsOf(el);
      expect(more).toEqual([]);
      for (const keyframe of keyframesOf(travel!)) {
        expect(Object.keys(keyframe).sort()).toEqual(["scale", "translate"]);
      }
    }
    expect(keyframesOf(travelsOf(backdrop!)[0]!)).toEqual([RIGHT, LEFT]);
    await advance(4000);
    expect(travelsOf(backdrop!)[0]!.playState).toBe("finished");
    expect(placed(backdrop!)).toEqual(LEFT);
    for (const el of portrait) {
      expect(placed(el)).toEqual(SOFA);
      expect(el.classList.contains("framed")).toBe(true);
    }
  });

  test("a second to during a travel starts from the view in flight", async () => {
    const h = await start();
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [first] = travelsOf(backdrop!);
    expect(first).toBeDefined();
    await advance(1000);
    await play(h, false);
    expect(first!.playState).toBe("idle");
    const [, second] = travelsOf(backdrop!);
    expect(keyframesOf(second!)).toEqual([QUARTER_TO_LEFT, SOFA]);
    await advance(2000);
    expect(placed(backdrop!)).toEqual(SOFA);
  });

  test("a travel keeps going while later lines write text and other layers", async () => {
    const h = await start("later");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    expect(h.overlay.textContent).toContain("A later line.");
    expect(pictureEls(h.overlay, "portrait").map(placed)).toContainEqual(SOFA);
    await advance(500);
    await play(h, false);
    expect(h.overlay.textContent).toContain("Another later line.");
    await advance(500);
    expect(travel!.playState).toBe("running");
    expect(travel!.currentTime).toBe(2000);
    await advance(2000);
    expect(travel!.playState).toBe("finished");
    expect(placed(backdrop!)).toEqual(LEFT);
  });

  test("the same to written again during a travel starts a new travel from the view in flight", async () => {
    const h = await start("repeated");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [first] = travelsOf(backdrop!);
    expect(first).toBeDefined();
    await advance(1000);
    await play(h, false);
    const [, second] = travelsOf(backdrop!);
    expect(second).toBeDefined();
    expect(first!.playState).toBe("idle");
    expect(keyframesOf(second!)).toEqual([QUARTER_TO_LEFT, LEFT]);
    await advance(3000);
    expect(second!.playState).toBe("running");
    await advance(1000);
    expect(second!.playState).toBe("finished");
  });

  test("a show on the same line as a to keeps the travel, so a later to starts from the view in flight", async () => {
    const h = await start("same_beat");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [first] = travelsOf(backdrop!);
    expect(first).toBeDefined();
    expect(first!.playState).toBe("running");
    await advance(1000);
    await play(h, false);
    expect(first!.playState).toBe("idle");
    const running = travelsOf(backdrop!).filter((a) => a.playState === "running");
    expect(running).toHaveLength(1);
    expect(keyframesOf(running[0]!)).toEqual([QUARTER_TO_LEFT, RIGHT]);
  });

  test("a transition on the same line as a to plays with the travel, not after it", async () => {
    const h = await start("flash");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    const screen = h.overlay.querySelector(".screen");
    const flashes = animations.filter((a) => a.effect.target === screen);
    expect(flashes.length).toBeGreaterThan(0);
    for (const flash of flashes) {
      expect(flash.startTime).toBe(travel!.startTime);
    }
  });

  test("two travels on one line run only the last, from the view on screen", async () => {
    const h = await start("twice");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const all = travelsOf(backdrop!);
    expect(all.filter((a) => a.playState === "running")).toHaveLength(1);
    const running = all.find((a) => a.playState === "running")!;
    expect(keyframesOf(running)).toEqual([RIGHT, SOFA]);
    await advance(2000);
    expect(placed(backdrop!)).toEqual(SOFA);
    expect(all.filter((a) => a.playState === "running")).toHaveLength(0);
  });

  test("pausing the game pauses a travel and resuming continues it", async () => {
    const h = await start();
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    h.ui.onPause();
    await advance(2000);
    expect(travel!.playState).toBe("paused");
    expect(travel!.currentTime).toBe(1000);
    h.ui.onUnpause();
    await advance(1000);
    expect(travel!.playState).toBe("running");
    expect(travel!.currentTime).toBe(2000);
    await advance(2000);
    expect(travel!.playState).toBe("finished");
    expect(placed(backdrop!)).toEqual(LEFT);
  });

  test("a beat presented at once shows the picture arrived, with no travel", async () => {
    const h = await start();
    await play(h, true);
    await play(h, true);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    expect(travelsOf(backdrop!)).toEqual([]);
    expect(placed(backdrop!)).toEqual(LEFT);
    for (const el of pictureEls(h.overlay, "portrait")) {
      expect(placed(el)).toEqual(SOFA);
    }
  });

  test("a new picture ends the travel where it is", async () => {
    const h = await start();
    await play(h, true);
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    expect(travel!.playState).toBe("idle");
    expect(placed(backdrop!)).toEqual({
      translate: "calc(30cqw - 31%) calc(75cqh - 80%)",
      scale: "1.1",
    });
    const shown = pictureEls(h.overlay, "backdrop").at(-1)!;
    expect(shown).not.toBe(backdrop);
    expect(travelsOf(shown)).toEqual([]);
  });

  test("hiding the layer ends the travel where it is", async () => {
    const h = await start("hidden");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    expect(travel!.playState).toBe("idle");
    expect(placed(backdrop!)).toEqual(QUARTER_TO_LEFT);
  });

  test("a new picture shown after a delay lets the old picture travel until it starts to go", async () => {
    const h = await start("replaced_later");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    await advance(1000);
    expect(travel!.playState).toBe("running");
    expect(travel!.currentTime).toBe(2000);
    await advance(1000);
    expect(travel!.playState).toBe("idle");
    expect(placed(backdrop!)).toEqual(THREE_QUARTERS_TO_LEFT);
  });

  test("hiding the layer after a delay lets the picture travel until the hide starts", async () => {
    const h = await start("hidden_later");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    await advance(1000);
    expect(travel!.playState).toBe("running");
    await advance(1000);
    expect(travel!.playState).toBe("idle");
    expect(placed(backdrop!)).toEqual(THREE_QUARTERS_TO_LEFT);
  });

  test("clearing the layer ends its travel, running or paused", async () => {
    for (const paused of [false, true]) {
      const h = await start();
      await play(h, true);
      await play(h, false);
      const [backdrop] = pictureEls(h.overlay, "backdrop");
      const [travel] = travelsOf(backdrop!);
      expect(travel).toBeDefined();
      await advance(1000);
      if (paused) {
        h.ui.onPause();
      }
      void h.game.module.ui.image.clear("backdrop");
      await flushMicrotasks(20);
      expect(backdrop!.isConnected).toBe(false);
      expect(travel!.playState).toBe("idle");
      if (paused) {
        h.ui.onUnpause();
      }
      restore?.();
    }
  });

  test("showing the layer while its picture travels lets the travel go on", async () => {
    const h = await start("reshown");
    await play(h, true);
    await play(h, false);
    const [backdrop] = pictureEls(h.overlay, "backdrop");
    const [travel] = travelsOf(backdrop!);
    expect(travel).toBeDefined();
    await advance(1000);
    await play(h, false);
    expect(travel!.playState).toBe("running");
    expect(travel!.currentTime).toBe(1000);
    await advance(3000);
    expect(placed(backdrop!)).toEqual(LEFT);
  });
});
