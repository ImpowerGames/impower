import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { stubMedia } from "./mediaStubs";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const source = `define P as image with
  src = "https://example.com/p.png"
end
define movie as video with
  src = "/file:/proj/movie.webm?v=1"
end
define Q as image with
  src = "https://example.com/q.png"
end
define uneven as transition with
  on_hide = animation.shake
  on_show = animation.fadein
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

async function setup(shown = "P") {
  const h = createDOMHarness(source.replace("[[show portrait P]]", `[[show portrait ${shown}]]`), 0, { reactive: true });
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

  test("a replaced picture is removed when its own exits end, while a transition's screen arm still runs", async () => {
    const { h, before, on } = await play("[[show portrait Q with screenfade over 1s with shake over 0.1s]]");
    const screen = h.overlay.querySelector(".screen");
    const longestExit = Math.max(...on(before).map((exit) => exit.duration));
    const arm = animations.filter((a) => a.effect.target === screen && Number(a.effect.timing.duration) > 0);
    expect(arm.map((a) => Number(a.effect.timing.duration))).toEqual([1000]);
    expect(longestExit).toBeLessThan(1000);
    await advanceTo(h, 100 + longestExit + 50);
    expect(before.some((el) => el.isConnected)).toBe(false);
    expect(arm[0]!.playState).toBe("running");
  });

  test("a replaced picture is removed when its own exits end, while the arriving picture's entrance still runs", async () => {
    const { h, before, after, on } = await play("[[show portrait Q with uneven over 2s with spin over 0.1s once]]");
    const arriving = after.filter((el) => !before.includes(el));
    const longestExit = Math.max(...on(before).map((exit) => exit.duration));
    const longestEntrance = Math.max(...on(arriving).map((enter) => enter.duration));
    expect(longestExit).toBeLessThan(longestEntrance);
    await advanceTo(h, 100 + longestExit + 50);
    expect(before.some((el) => el.isConnected)).toBe(false);
    expect(arriving[0]!.isConnected).toBe(true);
  });

  test("a replaced picture whose longest exit plays on an element inside it stays until that exit ends", async () => {
    const h = await setup();
    const ui = h.ui as any;
    const write = ui.writeImage.bind(ui);
    ui.writeImage = (target: string, instructions: any[], ...rest: unknown[]) => {
      for (const instruction of instructions) {
        for (const exit of instruction.content?.previousHideAnimations ?? []) {
          if (exit.$name === "shake") {
            exit.target = { $type: "layer", $name: "object" };
          }
        }
      }
      return write(target, instructions, ...rest);
    };
    const before = Array.from(h.overlay.querySelectorAll<HTMLElement>(".portrait .image > *"));
    const inner = before[0]!.querySelector(".object");
    expect(inner).toBeTruthy();
    const beat = h.game.module.interpreter.parse("[[show portrait Q with shake over 2s with fade over 0.5s]]", "main", {} as any);
    void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
    await settle(h);
    const innerExits = animations.filter((a) => a.effect.target === inner).map((a) => Number(a.effect.timing.duration));
    expect(innerExits).toEqual([2000]);
    await advanceTo(h, 700);
    expect(before[0]!.isConnected).toBe(true);
    await advanceTo(h, 2200);
    expect(before[0]!.isConnected).toBe(false);
  });

  test("a replaced picture whose exit is cancelled is still removed once the write settles", async () => {
    const { h, before, after } = await play("[[show portrait Q with shake over 2s with fade over 0.5s]]");
    const arriving = after.filter((el) => !before.includes(el));
    const exits = animations.filter((a) => a.effect.target === before[0] && Number(a.effect.timing.duration) === 2000);
    expect(exits).toHaveLength(1);
    exits[0]!.cancel();
    await advanceTo(h, 700);
    expect(before[0]!.isConnected).toBe(true);
    await advanceTo(h, 2200);
    expect(before[0]!.isConnected).toBe(false);
    expect(arriving[0]!.isConnected).toBe(true);
  });

  test("a movie hidden by a bare `hide` is removed when the layer's exits end, while a transition's screen arm still runs", async () => {
    const h = await setup("movie");
    const movie = h.overlay.querySelector(".portrait .image video");
    expect(movie).toBeTruthy();
    const beat = h.game.module.interpreter.parse("[[hide portrait with screenfade over 1s with shake over 0.1s]]", "main", {} as any);
    void h.game.module.ui.image.write("portrait", beat.image!["portrait"]!, false);
    await settle(h);
    const layer = h.overlay.querySelector(".portrait");
    const screen = h.overlay.querySelector(".screen");
    const exitsEnd = Math.max(...animations.filter((a) => a.effect.target === layer).map((a) => Number(a.startTime) + a.end));
    const arm = animations.filter((a) => a.effect.target === screen && Number(a.effect.timing.duration) > 0);
    expect(arm.map((a) => Number(a.effect.timing.duration))).toEqual([1000]);
    expect(exitsEnd).toBeLessThan(1100);
    await advanceTo(h, exitsEnd + 50);
    expect(arm[0]!.playState).toBe("running");
    expect(movie!.isConnected).toBe(false);
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
