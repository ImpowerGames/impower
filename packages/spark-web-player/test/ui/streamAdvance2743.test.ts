import { describe, expect, test } from "vitest";
import { EventMessage } from "../../../spark-engine/src/game/core/classes/messages/EventMessage";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";

const STORY = `define RAFFLES as character with
  name = "RAFFLES"
end

define BUNNY as character with
  name = "BUNNY"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

stream phone {
  advance = auto
  pause = 0.6s
}

scene start
  [[open phone]]
  RAFFLES: slight problem
  RAFFLES: doors locked
  BUNNY: Anything you can do about it?
  RAFFLES: maybe
  BUNNY: You know how to pick locks??
end
`;

const LINES = [
  "slight problem",
  "doors locked",
  "Anything you can do about it?",
  "maybe",
  "You know how to pick locks??",
];

const coordinator = (h: DOMHarness): any => (h.game as any)._coordinator;

const shown = (h: DOMHarness): string =>
  (coordinator(h)?._instructions?.text?.["dialogue"] ?? [])
    .map((event: any) => event.text)
    .join("");

const entriesOf = (h: DOMHarness): HTMLElement[] => {
  const stream = h.overlay.querySelector<HTMLElement>(".phone > .thread > .stream");
  expect(stream, h.overlay.innerHTML).not.toBeNull();
  return [...stream!.children] as HTMLElement[];
};

const textOf = (entry: HTMLElement) =>
  entry.querySelector(":scope > .text")?.textContent ?? "";

const hidden = (h: DOMHarness) =>
  entriesOf(h).map((entry) => entry.style.visibility === "hidden");

async function tick(h: DOMHarness, ms: number) {
  coordinator(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(10);
  (h.ui as any).flushPendingBeat();
}

async function play(compose = false) {
  const h = createDOMHarness(STORY, 0, { reactive: true, autoOpenAll: false, compose });
  await h.ready;
  if (compose) {
    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(30);
  }
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(30);
  for (let i = 0; i < 10 && !shown(h); i += 1) {
    await tick(h, 0);
  }
  await settle(h);
  return h;
}

async function settle(h: DOMHarness) {
  for (let i = 0; i < 10; i += 1) {
    await tick(h, 0);
  }
  await flushMicrotasks(30);
}

async function tickUntil(h: DOMHarness, line: string) {
  for (let elapsed = 0; elapsed < 30000 && shown(h) !== line; elapsed += 20) {
    await tick(h, 20);
  }
  expect(shown(h)).toBe(line);
  await settle(h);
}

describe("the player makes room for a gathered run before its first line shows (I-2743)", () => {
  test("every gathered line has its entry from the first line on, and each shows when its line starts", async () => {
    const h = await play();
    expect(shown(h)).toBe(LINES[0]);
    const first = entriesOf(h);
    expect(first.map(textOf)).toEqual(LINES);
    expect(hidden(h)).toEqual([false, true, true, true, true]);
    expect(first.map((el) => el.hasAttribute("data-latest"))).toEqual([true, false, false, false, false]);

    await tickUntil(h, LINES[2]!);
    expect(entriesOf(h)).toEqual(first);
    expect(hidden(h)).toEqual([false, false, false, true, true]);
    expect(entriesOf(h).map((el) => el.hasAttribute("data-latest"))).toEqual([false, false, true, false, false]);

    await tickUntil(h, LINES[4]!);
    expect(entriesOf(h)).toEqual(first);
    expect(hidden(h)).toEqual([false, false, false, false, false]);
    expect(entriesOf(h).map(textOf)).toEqual(LINES);
  });

  test("with beats composed, a reserved entry shows when its line arrives", async () => {
    const h = await play(true);
    expect(hidden(h)).toEqual([false, true, true, true, true]);
    await tickUntil(h, LINES[1]!);
    expect(hidden(h)).toEqual([false, false, true, true, true]);
  });

  test("a click in the middle shows every line up to the wait in the same entries", async () => {
    const h = await play();
    const first = entriesOf(h);
    coordinator(h).onMessage(
      EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
    );
    await settle(h);
    expect(shown(h)).toBe(LINES[4]);
    expect(entriesOf(h)).toEqual(first);
    expect(hidden(h)).toEqual([false, false, false, false, false]);
  });
});
