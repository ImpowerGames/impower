import { describe, expect, test } from "vitest";
import { resolveAnimationTargets } from "../../../spark-dom/src/utils/resolveAnimationTargets";
import { keyframeScale } from "../../src/app/utils/keyframeScale";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const source = `define P as image with
  src = "https://example.com/p.png"
end
layout main {
  stage {
    portrait { image }
  }
}
scene start
  [[show portrait P]]
  Ready.
end
`;

async function setup() {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  h.jumpTo("start");
  await h.display(h.nextBeat()!, true);
  await flushMicrotasks(30);
  h.game.context.system.previewing = undefined;
  timeline.currentTime = 100;
  animations.length = 0;
  (globalThis as any).Animation = TimedAnimation;
  (globalThis as any).KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: timeline });
  h.ui.morphs?.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  return h;
}

const SETS = (keyframes: unknown) =>
  [
    ...new Set(
      (keyframes as Record<string, unknown>[]).flatMap((frame) =>
        Object.keys(frame).filter((prop) => !["offset", "easing", "composite"].includes(prop)),
      ),
    ),
  ].sort();

async function play(line: string) {
  const h = await setup();
  const beat = h.game.module.interpreter.parse(line, "main", {} as any);
  void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    (h.ui as any).flushPendingBeat();
  }
  const layer = h.overlay.querySelector(".portrait");
  const effects = animations
    .filter((a) => a.effect.target === layer && Number(a.effect.timing.duration) > 0)
    .map((a) => ({
      animation: a,
      sets: SETS(a.effect.keyframes),
      keyframes: a.effect.keyframes,
      composite: (a.effect.timing as { composite?: string }).composite ?? "replace",
      duration: a.effect.timing.duration,
      start: a.startTime,
    }));
  return { h, effects };
}

describe("the movement of one line's animations on one element adds up (I-2854)", () => {
  test("`with shake with spin`: the spin's transform adds to the shake's, and the shake replaces", async () => {
    const { effects } = await play("[[animate portrait with shake over 2s with spin over 2s]]");
    expect(effects.map(({ sets, composite, duration, start }) => ({ sets, composite, duration, start }))).toEqual([
      { sets: ["transform"], composite: "replace", duration: 2000, start: 100 },
      { sets: ["transform"], composite: "add", duration: 2000, start: 100 },
    ]);
    expect(JSON.stringify(effects[1]!.keyframes)).toContain("rotate(360deg)");
    expect(JSON.stringify(effects[0]!.keyframes)).toContain("translate(");
  });

  test("`with shake with ping`: the ping's transform adds and its opacity replaces", async () => {
    const { effects } = await play("[[animate portrait with shake over 2s with ping over 1s]]");
    expect(effects.map(({ sets, composite, duration }) => ({ sets, composite, duration }))).toEqual([
      { sets: ["transform"], composite: "replace", duration: 2000 },
      { sets: ["opacity"], composite: "replace", duration: 1000 },
      { sets: ["transform"], composite: "add", duration: 1000 },
    ]);
    expect(effects[1]!.keyframes).toEqual([
      { offset: "0.75", opacity: "0" },
      { offset: "1", opacity: "0" },
    ]);
    expect(effects[2]!.keyframes).toEqual([
      { offset: "0.75", transform: "scale(2)" },
      { offset: "1", transform: "scale(2)" },
    ]);
  });

  test("`with fadein with pulse`: neither moves, so the pulse's opacity replaces the fade's", async () => {
    const { effects } = await play("[[animate portrait with fadein over 2s with pulse over 2s]]");
    expect(effects.map(({ sets, composite }) => ({ sets, composite }))).toEqual([
      { sets: ["opacity"], composite: "replace" },
      { sets: ["opacity"], composite: "replace" },
    ]);
  });

  test("`with fadein with shake`: the first movement on the element replaces", async () => {
    const { effects } = await play("[[animate portrait with fadein over 2s with shake over 2s]]");
    expect(effects.map(({ sets, composite }) => ({ sets, composite }))).toEqual([
      { sets: ["opacity"], composite: "replace" },
      { sets: ["transform"], composite: "replace" },
    ]);
  });

  test("pausing freezes both combined animations and resuming continues both", async () => {
    const { h, effects } = await play("[[animate portrait with shake over 2s with spin over 2s]]");
    timeline.currentTime = 600;
    h.ui.onPause();
    timeline.currentTime = 5000;
    expect(effects.map(({ animation }) => animation.currentTime)).toEqual([500, 500]);
    h.ui.onUnpause();
    timeline.currentTime = 5300;
    expect(effects.map(({ animation }) => animation.currentTime)).toEqual([800, 800]);
  });
});

describe("a line with one `with` creates the effects it created before (I-2854)", () => {
  test.each([
    ["shake over 2s", ["transform"], 2000],
    ["ping over 1s", ["opacity", "transform"], 1000],
    ["fadein over 2s", ["opacity"], 2000],
  ])("`[[animate portrait with %s]]`", async (clause, sets, duration) => {
    const { effects } = await play(`[[animate portrait with ${clause}]]`);
    expect(effects.map((e) => ({ sets: e.sets, composite: e.composite, duration: e.duration, start: e.start }))).toEqual([
      { sets, composite: "replace", duration, start: 100 },
    ]);
    expect("composite" in effects[0]!.animation.effect.timing).toBe(false);
  });

  test("`[[animate portrait with ping over 1s]]` keeps the ping's keyframes and timing whole", async () => {
    const { effects } = await play("[[animate portrait with ping over 1s]]");
    expect(effects[0]!.keyframes).toEqual([
      { offset: "0.75", transform: "scale(2)", opacity: "0" },
      { offset: "1", transform: "scale(2)", opacity: "0" },
    ]);
    expect(effects[0]!.animation.effect.timing).toEqual({
      delay: 0,
      duration: 1000,
      iterations: 1,
      direction: "normal",
      easing: "ease",
      fill: "both",
    });
  });
});

describe("a layer is sized for the product of the animations that enlarge it (I-2854)", () => {
  const grow = (transform: string, target?: string) =>
    ({
      ...(target ? { target: { $name: target } } : {}),
      keyframes: [{ transform: "none" }, { transform }],
      timing: {},
    }) as any;

  test("two animations on one target multiply", () => {
    expect(keyframeScale([grow("scale(2)"), grow("scale(1.5)")])).toBe(3);
  });

  test("an animation with no target counts as one on `self`", () => {
    expect(keyframeScale([grow("scale(2)"), grow("scale(1.5)", "self")])).toBe(3);
  });

  test("`self` and the layer's own name resolve to one element, so they multiply", () => {
    const layer = document.createElement("div");
    layer.className = "portrait";
    const child = document.createElement("div");
    child.className = "image";
    layer.append(child);
    const resolve = (name: string | undefined) => resolveAnimationTargets(layer, name);
    expect(keyframeScale([grow("scale(2)", "self"), grow("scale(2)", "portrait")], resolve)).toBe(4);
    expect(keyframeScale([grow("scale(2)", "self"), grow("scale(1.5)", "image")], resolve)).toBe(2);
    expect(keyframeScale([grow("scale(2)", "missing")], resolve)).toBe(1);
  });

  test("animations on different targets do not", () => {
    expect(keyframeScale([grow("scale(2)", "a"), grow("scale(1.5)", "b")])).toBe(2);
  });

  test("one animation keeps its own reach", () => {
    expect(keyframeScale([grow("scale(2)")])).toBe(2);
    expect(keyframeScale([])).toBe(1);
  });
});
