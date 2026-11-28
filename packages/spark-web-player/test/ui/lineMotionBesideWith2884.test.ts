import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { stubMedia } from "./mediaStubs";
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
}
scene start
  [[show portrait P]]
  Ready.
end
`;

async function setup() {
  const h = createDOMHarness(source, 0, { reactive: true });
  stubMedia(h.overlay);
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
  return { h, before, arriving: after.filter((el) => !before.includes(el)) };
}

function seek(time: number) {
  timeline.currentTime = time;
  for (const animation of animations) {
    animation.update();
  }
}

function opacity(el: HTMLElement): number {
  let value = 1;
  for (const animation of animations) {
    if (animation.effect.target !== el || animation.playState === "idle") continue;
    const progress = animation.effect.getComputedTiming().progress;
    if (progress == null) continue;
    const frames = animation.effect.getKeyframes().filter((frame: any) => frame.opacity != null);
    if (frames.length === 0) continue;
    const from = frames.length > 1 ? Number((frames[0] as any).opacity) : value;
    const to = Number((frames.at(-1) as any).opacity);
    value = from + (to - from) * progress;
  }
  return value;
}

describe("a picture line's own show or hide plays beside every `with` (I-2884)", () => {
  test("after `[[show portrait Q with shake]]` the replaced picture is not visible from the first frame, and the new one is", async () => {
    const { h, before, arriving } = await play("[[show portrait Q with shake]]");
    expect(before).toHaveLength(1);
    expect(arriving).toHaveLength(1);
    seek(100);
    expect(opacity(before[0]!)).toBe(0);
    expect(opacity(arriving[0]!)).toBe(1);
    seek(250);
    await settle(h);
    expect(!before[0]!.isConnected || opacity(before[0]!) === 0).toBe(true);
    expect(opacity(arriving[0]!)).toBe(1);
  });

  test("on opacity a `with` wins over the line's own `show` while both run", async () => {
    const { arriving } = await play("[[show portrait Q over 2s with fadein over 0.5s]]");
    const el = arriving[0]!;
    const own = animations.find((a) => a.effect.target === el && Number(a.effect.timing.duration) === 2000);
    const added = animations.find((a) => a.effect.target === el && Number(a.effect.timing.duration) === 500);
    expect(own && added).toBeTruthy();
    expect(animations.indexOf(own!)).toBeLessThan(animations.indexOf(added!));
    seek(100 + 250);
    expect(opacity(el)).toBeCloseTo(0.5);
    seek(100 + 1000);
    expect(opacity(el)).toBe(1);
  });

  test("`[[show portrait Q over 2s]]` fades the new picture in from transparent", async () => {
    const { arriving } = await play("[[show portrait Q over 2s]]");
    seek(100);
    expect(opacity(arriving[0]!)).toBe(0);
    seek(100 + 1000);
    expect(opacity(arriving[0]!)).toBeCloseTo(0.5);
    seek(100 + 2000);
    expect(opacity(arriving[0]!)).toBe(1);
  });

  test("`[[show portrait Q after 1s over 1s with shake]]` keeps the layer and the shown picture visible until the show starts", async () => {
    const { before, arriving } = await play("[[show portrait Q after 1s over 1s with shake]]");
    const layer = before[0]!.closest<HTMLElement>(".portrait")!;
    seek(100 + 500);
    expect(opacity(layer)).toBe(1);
    expect(opacity(before[0]!)).toBe(1);
    expect(opacity(arriving[0]!)).toBe(0);
    seek(100 + 1500);
    expect(opacity(layer)).toBe(1);
    expect(opacity(arriving[0]!)).toBeCloseTo(0.5);
  });

  test("`[[show portrait Q with fade]]` still fades the replaced picture out", async () => {
    const { before } = await play("[[show portrait Q with fade]]");
    seek(100 + 250);
    expect(opacity(before[0]!)).toBeCloseTo(0.5);
  });
});
