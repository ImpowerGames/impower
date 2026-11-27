import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const source = `define P as image with
  src = "https://example.com/p.png"
end
layout main {
  stage {
    portrait { image }
  }
  screen { animation }
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

async function play(line: string) {
  const h = await setup();
  const beat = h.game.module.interpreter.parse(line, "main", {} as any);
  void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    (h.ui as any).flushPendingBeat();
  }
  const moving = (selector: string) =>
    animations
      .filter((a) => a.effect.target === h.overlay.querySelector(selector) && Number(a.effect.timing.duration) > 0)
      .map((a) => ({ start: a.startTime, duration: a.effect.timing.duration }));
  return { layer: moving(".portrait"), arm: moving(".screen") };
}

describe("a transition's other arms start with the other `with` clauses on an `animate` line (I-2853)", () => {
  test.each(["", " P"])("`[[animate portrait%s with screenflash over 1s with shake over 2s]]`", async (picture) => {
    const { layer, arm } = await play(`[[animate portrait${picture} with screenflash over 1s with shake over 2s once]]`);
    expect(layer).toContainEqual({ start: 100, duration: 2000 });
    expect(layer.every((motion) => motion.start === 100)).toBe(true);
    expect(arm).toEqual([{ start: 100, duration: 1000 }]);
  });

  test.each(["", " P"])("a lone transition arm still starts with the line: `[[animate portrait%s with screenflash over 1s]]`", async (picture) => {
    const { arm } = await play(`[[animate portrait${picture} with screenflash over 1s]]`);
    expect(arm).toEqual([{ start: 100, duration: 1000 }]);
  });
});
