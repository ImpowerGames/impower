import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const SOURCE = `define ui as config with
  layouts_initial = { }
end

layout main {
  action #clear { text }
}

layout menu {
  panel { text "Menu" }
}
`;

const typed = [..."A typed line."].map((text, i) => ({ text, after: i * 0.05 }));

let previous: { Animation: unknown; KeyframeEffect: unknown; timeline: unknown };

beforeEach(() => {
  const g = globalThis as any;
  previous = {
    Animation: g.Animation,
    KeyframeEffect: g.KeyframeEffect,
    timeline: (document as any).timeline,
  };
});

afterEach(() => {
  const g = globalThis as any;
  g.Animation = previous.Animation;
  g.KeyframeEffect = previous.KeyframeEffect;
  Object.defineProperty(document, "timeline", {
    configurable: true,
    value: previous.timeline,
  });
});

async function setup() {
  const h = createDOMHarness(SOURCE, 0, { reactive: true, compose: true, autoOpenAll: false });
  await h.ready;
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(30);
  h.game.context.system.previewing = undefined;
  timeline.currentTime = 0;
  animations.length = 0;
  (globalThis as any).Animation = TimedAnimation;
  (globalThis as any).KeyframeEffect = TimedEffect;
  Object.defineProperty(document, "timeline", { configurable: true, value: timeline });
  h.ui.morphs?.configure({ requestFrame: () => 0, cancelFrame: () => {} });
  return h;
}

async function pump(h: Awaited<ReturnType<typeof setup>>, c?: Coordinator<any>) {
  for (let i = 0; i < 20; i += 1) {
    await flushMicrotasks(10);
    (c as any)?._onTick?.(0);
    (h.ui as any).flushPendingBeat();
  }
  await flushMicrotasks(30);
}

const click = (c: Coordinator<any>) => {
  c.onMessage({
    jsonrpc: "2.0",
    method: "event",
    params: { type: "pointerdown", button: 0 },
  } as any);
  c.shouldContinue();
};

describe("one click during a layout's with-clause motion on the line (#2739)", () => {
  test("finishes the layout's entrance as well as showing the whole line", async () => {
    const h = await setup();
    const c = new Coordinator(h.game, {
      end: 1,
      text: { action: typed },
      layout: { menu: [{ control: "open", name: "menu", with: [{ name: "fadein", over: 5 }], over: 5 }] },
    } as any);
    await pump(h, c);
    const menu = h.overlay.querySelector(".menu, .layout_menu");
    expect(menu).not.toBeNull();
    const motion = animations.find((a) => a.effect.target === menu)!;
    expect(motion).toBeDefined();
    expect(motion.playState).toBe("running");
    expect(c.shouldContinue()).toBe(0);
    timeline.currentTime = 250;
    for (const a of animations) {
      a.update();
    }
    click(c);
    await pump(h);
    const letters = [...h.overlay.querySelectorAll(".action .text_letter")] as HTMLElement[];
    expect(letters.length).toBe(typed.length);
    expect(letters.every((letter) => letter.style.opacity === "1")).toBe(true);
    expect(motion.playState).not.toBe("running");
  });

  test("removes a layout that leaves with a with clause", async () => {
    const h = await setup();
    await h.game.module.ui.openLayout("menu", undefined, true);
    await pump(h);
    const menu = h.overlay.querySelector(".menu, .layout_menu")!;
    expect(menu).not.toBeNull();
    const c = new Coordinator(h.game, {
      end: 1,
      text: { action: typed },
      layout: { menu: [{ control: "close", name: "menu", with: [{ name: "fadeout", over: 5 }], over: 5 }] },
    } as any);
    await pump(h, c);
    expect(animations.find((a) => a.effect.target === menu)).toBeDefined();
    expect(c.shouldContinue()).toBe(0);
    click(c);
    await pump(h);
    expect(menu.isConnected).toBe(false);
  });
});
