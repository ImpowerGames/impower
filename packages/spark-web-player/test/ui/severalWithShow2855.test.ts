import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const source = `define P as image with
  src = "https://example.com/p.png"
end
define Q as image with
  src = "https://example.com/q.png"
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

async function settle(h: Awaited<ReturnType<typeof setup>>) {
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(10);
    (h.ui as any).flushPendingBeat();
  }
}

async function play(line: string) {
  const h = await setup();
  const before = Array.from(h.overlay.querySelectorAll<HTMLElement>(".portrait .image > *"));
  const beat = h.game.module.interpreter.parse(line, "main", {} as any);
  void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
  await settle(h);
  const after = Array.from(h.overlay.querySelectorAll<HTMLElement>(".portrait .image > *"));
  const on = (pictures: HTMLElement[]) =>
    animations
      .filter((a) => pictures.some((picture) => picture === a.effect.target || picture.contains(a.effect.target)))
      .filter((a) => Number(a.effect.timing.duration) > 0)
      .map((a) => ({ start: a.startTime, duration: Number(a.effect.timing.duration) }))
      .sort((x, y) => x.duration - y.duration);
  return { h, before, after, on };
}

async function advanceTo(h: Awaited<ReturnType<typeof setup>>, time: number) {
  timeline.currentTime = time;
  for (const animation of animations) {
    animation.update();
  }
  await settle(h);
}

describe("every `with` on a `show` or `hide` line plays on its picture (I-2855)", () => {
  test("`[[show portrait Q with fade over 0.5s with shake over 2s]]` plays both on the arriving and on the replaced picture", async () => {
    const { before, after, on } = await play("[[show portrait Q with fade over 0.5s with shake over 2s]]");
    const arriving = after.filter((el) => !before.includes(el));
    expect(arriving).toHaveLength(1);
    expect(on(arriving)).toEqual([
      { start: 100, duration: 500 },
      { start: 100, duration: 2000 },
    ]);
    expect(on(before)).toEqual([
      { start: 100, duration: 500 },
      { start: 100, duration: 2000 },
    ]);
  });

  test("the replaced picture is removed only once the longest of its exits has ended", async () => {
    const { h, before } = await play("[[show portrait Q with shake over 2s with fade over 0.5s]]");
    expect(before.every((el) => el.isConnected)).toBe(true);
    await advanceTo(h, 700);
    expect(before.every((el) => el.isConnected)).toBe(true);
    await advanceTo(h, 2200);
    expect(before.some((el) => el.isConnected)).toBe(false);
  });

  test("`[[hide portrait P with fade over 0.5s with spin over 2s once]]` plays both exits and removes the picture after the longer", async () => {
    const { h, before, after, on } = await play("[[hide portrait P with fade over 0.5s with spin over 2s once]]");
    const leaving = after.filter((el) => !before.includes(el));
    expect(leaving).toHaveLength(1);
    expect(on(leaving)).toEqual([
      { start: 100, duration: 500 },
      { start: 100, duration: 2000 },
    ]);
    await advanceTo(h, 700);
    expect(leaving[0]!.isConnected).toBe(true);
    await advanceTo(h, 2200);
    expect(leaving[0]!.isConnected).toBe(false);
  });

  test("`[[hide portrait with fade over 0.5s with spin over 2s once]]` plays both exits on the layer", async () => {
    const { h } = await play("[[hide portrait with fade over 0.5s with spin over 2s once]]");
    const layer = h.overlay.querySelector(".portrait");
    const exits = animations
      .filter((a) => a.effect.target === layer && Number(a.effect.timing.duration) > 0)
      .map((a) => ({ start: a.startTime, duration: Number(a.effect.timing.duration) }));
    expect(exits).toEqual([
      { start: 100, duration: 500 },
      { start: 100, duration: 2000 },
    ]);
  });
});
