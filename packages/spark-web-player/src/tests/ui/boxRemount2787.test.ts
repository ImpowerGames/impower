import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { EventMessage } from "../../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const source = (body: string) => `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

layout main {
  ${body}
}

scene start
  [[open main]] RAFFLES: slight problem
  RAFFLES: doors locked
end
`;

const BOX = `dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }`;

async function next(h: DOMHarness) {
  const beat = h.nextBeat();
  expect(beat).toBeDefined();
  const coordinator = new Coordinator(h.game, beat!);
  for (let i = 0; i < 10; i += 1) {
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
  }
  return coordinator;
}

const texts = (h: DOMHarness) =>
  [...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text")].map(
    (el) => `${el.classList.contains("second") ? "second" : "first"}=${el.textContent ?? ""}`,
  );

async function toggle(h: DOMHarness) {
  h.game.story.EvaluateFunction("toggle", []);
  h.game.module.ui.refreshLayouts();
  await flushMicrotasks(40);
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.useRealTimers();
});

function timed(h: DOMHarness) {
  const g = globalThis as any;
  const saved = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    getComputedStyle: g.getComputedStyle,
  };
  const win = h.overlay.ownerDocument.defaultView!;
  g.Animation = TimedAnimation;
  g.KeyframeEffect = TimedEffect;
  g.getComputedStyle = win.getComputedStyle.bind(win);
  Object.defineProperty(h.overlay.ownerDocument, "timeline", {
    configurable: true,
    value: timeline,
  });
  timeline.currentTime = 0;
  animations.length = 0;
  restore = () => {
    Object.assign(g, saved);
    animations.length = 0;
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  (h.game.context.system as any).previewing = undefined;
  h.ui.onUpdate({ elapsedTime: 0 } as never);
}

async function at(time: number) {
  const delta = time - timeline.currentTime;
  timeline.currentTime = time;
  vi.advanceTimersByTime(delta);
  for (const animation of animations) {
    animation.update();
  }
  await flushMicrotasks(40);
}

const letters = (h: DOMHarness) => [
  ...h.overlay.querySelectorAll<HTMLElement>(".main .dialogue .text .text_letter"),
];

const visible = (h: DOMHarness) =>
  letters(h).filter((el) => {
    const reveal = (el as any).__sdReveal;
    return reveal
      ? reveal.currentTime != null &&
          reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
      : el.style.opacity === "1";
  }).length;

describe("a box's text across a remount of its content (#2787)", () => {
  test("the branch an if change mounts shows the line the box was showing", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await next(h);
    expect(texts(h)).toEqual(["first=doors locked"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=doors locked"]);
  });

  test("a box nested under a remounted branch receives its line", async () => {
    const h = createDOMHarness(
      source(`if expanded then
    wrapper.first {
      dialogue { text }
    }
  else
    wrapper.second {
      dialogue { text }
    }
  end`),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(h.overlay.querySelector(".main .wrapper.second .dialogue")).not.toBeNull();
    expect(texts(h)).toEqual(["first=slight problem"]);
  });

  test("the line being typed keeps its reveal across a remount and a click then finishes it", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    const coordinator = await next(h);
    await at(100);
    const before = visible(h);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(letters(h).length);
    await toggle(h);
    expect(texts(h)).toEqual(["second=slight problem"]);
    expect(visible(h)).toBe(before);
    coordinator.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
    expect(visible(h)).toBe(letters(h).length);
  });

  test("a line finished by a click stays finished across a remount", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    const coordinator = await next(h);
    await at(100);
    coordinator.onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    coordinator.onUpdate({ deltaMS: 0 } as Clock);
    await flushMicrotasks(40);
    expect(visible(h)).toBe(letters(h).length);
    await toggle(h);
    await at(timeline.currentTime);
    expect(texts(h)).toEqual(["second=slight problem"]);
    expect(visible(h)).toBe(letters(h).length);
  });
});
