import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../spark-engine/src/game/core/classes/Coordinator";
import { EventMessage } from "../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { advanceTo, timeline, useTimedAnimations } from "./timedAnimation";

const source = (
  body: string,
  scene = "[[open phone]] RAFFLES: first message\n  RAFFLES: second message",
  frame = false,
) => `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

${frame ? "screen shell {\n  if expanded then\n    panel.first { slot }\n  else\n    panel.second { slot }\n  end\n}\n" : ""}
layout phone${frame ? " in shell" : ""} {
  stream.feed {
    dialogue.bubble {
      ${body}
    }
  }
}

scene start
  ${scene}
end
`;

const BRANCH = `if expanded then
        text.first
      else
        text.second
      end`;

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

const entries = (h: DOMHarness) => [
  ...h.overlay.querySelectorAll<HTMLElement>(".phone .stream > .bubble"),
];

const texts = (h: DOMHarness) =>
  entries(h).map((el) => el.querySelector(".text")?.textContent ?? "");

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

const letters = (h: DOMHarness, index: number) => [
  ...entries(h)[index]!.querySelectorAll<HTMLElement>(".text_letter"),
];

const visible = (h: DOMHarness, index: number) =>
  letters(h, index).filter((el) => {
    const reveal = (el as any).__sdReveal;
    return reveal
      ? reveal.currentTime != null &&
          reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
      : el.style.opacity === "1";
  }).length;

describe("a stream is named like any element (#2738)", () => {
  test("a stream whose class matches its layout's name is styled by that name, not the layout root", async () => {
    const h = createDOMHarness(source("text").replace("stream.feed", "stream.phone"), 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    h.game.module.ui.style.update("phone", { opacity: "0.25" });
    await flushMicrotasks(40);
    const stream = h.overlay.querySelector<HTMLElement>(".stream.phone")!;
    expect(stream).not.toBeNull();
    expect(stream.style.opacity).toBe("0.25");
    expect(stream.parentElement!.style.opacity).toBe("");
  });
});

describe("stream entries across remounts (#2738)", () => {
  test("a stream rebuilt by its screen's slot writes each entry once", async () => {
    const messages: any[] = [];
    const h = createDOMHarness(source("text", undefined, true), 0, {
      reactive: true,
      autoOpenAll: false,
      afterEachMessage: (m) => messages.push(m),
    });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    await next(h);
    const flatten = (ms: any[]): any[] =>
      ms.flatMap((m) => (m?.params?.messages ? flatten(m.params.messages) : [m]));
    messages.length = 0;
    await toggle(h);
    expect(texts(h)).toEqual(["first message", "second message"]);
    const writes = flatten(messages).filter(
      (m) => m?.method === "ui/write-text" && m.params.instructions.length > 0,
    );
    expect(writes.map((m) => m.params.instructions.map((e: any) => e.text).join(""))).toEqual([
      "first message",
      "second message",
    ]);
  });

  test("a layout moved by its screen's slot keeps its entries and the latest", async () => {
    const h = createDOMHarness(source("text", undefined, true), 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    await next(h);
    expect(texts(h)).toEqual(["first message", "second message"]);
    await toggle(h);
    expect(h.overlay.querySelector(".shell > .panel.second > .phone .stream")).not.toBeNull();
    expect(texts(h)).toEqual(["first message", "second message"]);
    expect(entries(h).map((el) => el.hasAttribute("data-latest"))).toEqual([false, true]);
  });

  test("a nested target's remounted content receives its own saved line", async () => {
    const h = createDOMHarness(
      source(`wrapper {
        dialogue {
          if expanded then
            text.first
          else
            text.second
          end
        }
      }`),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    await next(h);
    expect(texts(h)).toEqual(["first message", "second message"]);
    await toggle(h);
    expect(h.overlay.querySelectorAll(".phone .second")).toHaveLength(2);
    expect(texts(h)).toEqual(["first message", "second message"]);
  });

  test.each([false, true])(
    "the entry being typed keeps its reveal across a remount and a click then finishes it (beats composed: %s)",
    async (composed) => {
      const h = createDOMHarness(source(BRANCH), 0, { reactive: true, autoOpenAll: false });
      await h.ready;
      h.jumpTo("start");
      await next(h);
      timed(h);
      (h.game.context.system as any).composeBeats = composed;
      const coordinator = await next(h);
      await at(100);
      const before = visible(h, 1);
      expect(before).toBeGreaterThan(0);
      expect(before).toBeLessThan(letters(h, 1).length);
      await toggle(h);
      expect(visible(h, 1)).toBe(before);
      coordinator.onMessage(
        EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
      );
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
      await flushMicrotasks(40);
      expect(visible(h, 1)).toBe(letters(h, 1).length);
      expect(entries(h)).toHaveLength(2);
    },
  );

  test("a text slot a for loop adds to an entry receives that entry's line", async () => {
    const h = createDOMHarness(
      source(`for row in rows do
        text
      end`).replace(
        "store expanded = true",
        "store expanded = true\n\nstore rows = { 1 }\n\nfunction grow()\n  rows = { 1, 2 }\nend",
      ),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    await next(h);
    h.game.story.EvaluateFunction("grow", []);
    h.game.module.ui.refreshLayouts();
    await flushMicrotasks(40);
    expect(
      entries(h).map((el) =>
        [...el.querySelectorAll(".text")].map((text) => text.textContent ?? ""),
      ),
    ).toEqual([
      ["first message", "first message"],
      ["second message", "second message"],
    ]);
  });

  test("an entry still typing when the next line arrives keeps its reveal across a remount", async () => {
    const h = createDOMHarness(source(BRANCH), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    timed(h);
    await next(h);
    await at(100);
    const before = visible(h, 0);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(letters(h, 0).length);
    await next(h);
    expect(entries(h)).toHaveLength(2);
    expect(visible(h, 0)).toBe(before);
    await toggle(h);
    expect(texts(h)).toEqual(["first message", "second message"]);
    expect(h.overlay.querySelectorAll(".phone .second")).toHaveLength(2);
    expect(visible(h, 0)).toBe(before);
  });

  test("a remount inside a composed beat that writes no stream text keeps the typing entry's reveal", async () => {
    const h = createDOMHarness(source(BRANCH), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    timed(h);
    (h.game.context.system as any).composeBeats = true;
    await next(h);
    await at(100);
    const before = visible(h, 1);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(letters(h, 1).length);
    expect(h.game.module.ui.beginCompose()).toBe(true);
    await toggle(h);
    void h.game.module.ui.endCompose({});
    await flushMicrotasks(40);
    expect(visible(h, 1)).toBe(before);
  });

  test("an entry whose start a pause spans within the lead shows the letters of an entry never replayed after a remount (#2861)", async () => {
    const h = createDOMHarness(source(BRANCH), 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    timed(h);
    h.game.context.system.now = () => timeline.currentTime;
    await at(100);
    await next(h);
    await at(110);
    h.game.pause();
    h.ui.onPause();
    await at(600);
    h.game.unpause();
    h.ui.onUnpause();
    await at(700);
    const live = visible(h, 1);
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(letters(h, 1).length);
    await toggle(h);
    expect(visible(h, 1)).toBe(live);
  });

  test("an unchanged text target keeps its letter nodes when a nested label remounts", async () => {
    const h = createDOMHarness(
      source(`text
      wrapper {
        if expanded then
          label.first "first"
        else
          label.second "second"
        end
      }`),
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    await next(h);
    timed(h);
    await next(h);
    await at(100);
    const nodes = letters(h, 1);
    const count = visible(h, 1);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(nodes.length);
    await toggle(h);
    expect(h.overlay.querySelectorAll(".phone .wrapper .second")).toHaveLength(2);
    expect(letters(h, 1)).toEqual(nodes);
    expect(visible(h, 1)).toBe(count);
  });

  test.each([false, true])(
    "a save taken while a line types loads with that entry complete, and a remount keeps it complete (in a screen frame: %s)",
    async (frame) => {
      const story = source(BRANCH, undefined, frame);
      const h = createDOMHarness(story, 0, { reactive: true, autoOpenAll: false });
      await h.ready;
      timed(h);
      h.game.start();
      for (let i = 0; i < 10; i += 1) {
        h.game.update({ deltaMS: 0, elapsedTime: 0 } as any);
        await flushMicrotasks(40);
      }
      await at(100);
      expect(visible(h, 0)).toBeGreaterThan(0);
      expect(visible(h, 0)).toBeLessThan(letters(h, 0).length);
      const save = h.game.saveHere();
      expect(save).not.toBeNull();
      restore?.();
      const loaded = createDOMHarness(story, 0, { reactive: true, autoOpenAll: false });
      await loaded.ready;
      timed(loaded);
      expect(loaded.game.loadToResume(save!.data)).toBe(true);
      await loaded.game.restore();
      loaded.game.start();
      for (let i = 0; i < 10; i += 1) {
        loaded.game.update({ deltaMS: 0, elapsedTime: 0 } as any);
        await flushMicrotasks(40);
      }
      expect(texts(loaded)).toEqual(["first message"]);
      expect(visible(loaded, 0)).toBe(letters(loaded, 0).length);
      await toggle(loaded);
      await at(timeline.currentTime);
      expect(texts(loaded)).toEqual(["first message"]);
      expect(visible(loaded, 0)).toBe(letters(loaded, 0).length);
    },
  );

  test("a completed, restored entry stays complete when a screen branch remounts the whole stream", async () => {
    const h = createDOMHarness(source("text", undefined, true), 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.jumpTo("start");
    await next(h);
    timed(h);
    await next(h);
    await at(100);
    h.game.module.ui.streams.restore();
    h.game.module.ui.streams.show(false, 0);
    await flushMicrotasks(40);
    expect(visible(h, 1)).toBe(letters(h, 1).length);
    await toggle(h);
    await at(timeline.currentTime);
    expect(visible(h, 1)).toBe(letters(h, 1).length);
  });
});
