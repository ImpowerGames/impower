import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../../spark-engine/src/game/core/classes/Coordinator";
import { EventMessage } from "../../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { advanceTo, timeline, useTimedAnimations } from "./timedAnimation";

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
  restore = useTimedAnimations(h);
}

const at = advanceTo;

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

  test("a box whose layout a screen branch rehosts keeps its line", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    text
  }`).replace(
        "layout main {",
        "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n\nlayout main in shell {",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    await toggle(h);
    expect(h.overlay.querySelector(".shell .panel.second .main .dialogue")).not.toBeNull();
    expect(texts(h)).toEqual(["first=slight problem"]);
  });

  test("a text slot a for loop adds receives the box's line, and a sibling with its own words keeps them", async () => {
    const h = createDOMHarness(
      source(`dialogue {
    for row in rows do
      text
    end
    if expanded then
      text "NOTE"
    end
  }`).replace("store expanded = true", "store expanded = false\n\nstore rows = { 1 }\n\nfunction grow()\n  rows = { 1, 2 }\nend"),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    expect(texts(h)).toEqual(["first=slight problem"]);
    h.game.story.EvaluateFunction("grow", []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(40);
    expect(texts(h)).toEqual(["first=slight problem", "first=slight problem"]);
    await toggle(h);
    expect(texts(h)).toEqual(["first=slight problem", "first=slight problem", "first=NOTE"]);
  });

  test("a line appended after a restore is kept once across a remount", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true });
    await h.ready;
    const ui = h.game.module.ui;
    await ui.text.write("dialogue", [{ text: "A" }], true);
    await ui.onRestore();
    await ui.text.write("dialogue", [{ text: "B" }], true);
    expect(texts(h)).toEqual(["first=AB"]);
    await toggle(h);
    expect(texts(h)).toEqual(["second=AB"]);
  });

  test("a write that repeats everything the box shows is appended", async () => {
    const h = createDOMHarness(source(BOX), 0, { reactive: true });
    await h.ready;
    const ui = h.game.module.ui;
    const a = { text: "A", style: { color: "red" } };
    const b = { text: "B" };
    await ui.text.write("dialogue", [a], true);
    await ui.text.write("dialogue", [b], true);
    expect(texts(h)).toEqual(["first=AB"]);
    await ui.text.write("dialogue", [a, b], true);
    expect(texts(h)).toEqual(["first=ABAB"]);
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
