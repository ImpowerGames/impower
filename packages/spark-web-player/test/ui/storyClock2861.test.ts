import { afterEach, describe, expect, test, vi } from "vitest";
import type { Clock } from "../../../spark-engine/src/game/core/classes/Clock";
import { Coordinator } from "../../../spark-engine/src/game/core/classes/Coordinator";
import { createDOMHarness, flushMicrotasks, type DOMHarness } from "./domTestHarness";
import { BEAT_LEAD_MS } from "../../../spark-engine/src/game/core/utils/sharedClock";
import { advanceTo, timeline, useTimedAnimations } from "./timedAnimation";

const SOURCE = `define RAFFLES as character with
  name = "RAFFLES"
end

store expanded = true

function toggle()
  expanded = not expanded
end

layout main {
  dialogue {
    if expanded then
      text.first
    else
      text.second
    end
  }
}

scene start
  [[open main]] RAFFLES: slight problem
  RAFFLES: doors locked
  RAFFLES: lights out
  RAFFLES: never mind
end
`;

const LINES = ["slight problem", "doors locked", "lights out", "never mind"];

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.useRealTimers();
});

const at = advanceTo;

function harness(source = SOURCE) {
  const h = createDOMHarness(source, 0, { reactive: true, autoOpenAll: false });
  restore?.();
  restore = useTimedAnimations(h);
  h.game.context.system.now = () => timeline.currentTime;
  h.game.context.system.previewing = undefined;
  return h;
}

async function tick(h: DOMHarness) {
  for (let i = 0; i < 12; i += 1) {
    await flushMicrotasks(15);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 0 });
  }
}

const hold = (h: DOMHarness) => {
  h.game.pause();
  h.ui.onPause();
};

const release = (h: DOMHarness) => {
  h.game.unpause();
  h.ui.onUnpause();
};

async function pause(h: DOMHarness, from: number, to: number) {
  await at(from);
  hold(h);
  await at(to);
  release(h);
}

const text = (h: DOMHarness) =>
  h.overlay.querySelector<HTMLElement>(".main .dialogue .text")?.textContent ?? "";

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

async function toggle(h: DOMHarness) {
  h.game.story.EvaluateFunction("toggle", []);
  h.game.module.ui.refreshLayouts();
  await flushMicrotasks(40);
}

async function started(h: DOMHarness) {
  await h.ready;
  h.game.start();
  await tick(h);
  expect(text(h)).toBe(LINES[0]);
}

async function continueTo(h: DOMHarness, line: string) {
  await at(timeline.currentTime + 2000);
  for (let i = 0; i < 3 && text(h) !== line; i += 1) {
    h.game.clickedToContinue();
    await tick(h);
  }
  expect(text(h)).toBe(line);
}

async function sameAcrossRemount(h: DOMHarness) {
  const live = visible(h);
  expect(live).toBeGreaterThan(0);
  expect(live).toBeLessThan(letters(h).length);
  await toggle(h);
  expect(visible(h)).toBe(live);
}

async function pausedLineReplays(h: DOMHarness, line: string) {
  const from = timeline.currentTime + 2000;
  await at(from);
  for (let i = 0; i < 3 && text(h) !== line; i += 1) {
    h.game.clickedToContinue();
    await tick(h);
  }
  expect(text(h)).toBe(line);
  await pause(h, from + BEAT_LEAD_MS / 2, from + 500);
  await at(from + 600);
  await sameAcrossRemount(h);
}

async function pausesWhileTyping(h: DOMHarness) {
  const start = timeline.currentTime;
  await pause(h, start + 40, start + 300);
  await pause(h, start + 340, start + 700);
  await at(start + 760);
}

describe("a remounted line replays on the story clock (#2861)", () => {
  test("a pause that begins before the game's first beat", async () => {
    const h = harness();
    await h.ready;
    await at(50);
    hold(h);
    await at(100);
    h.game.start();
    await tick(h);
    expect(text(h)).toBe(LINES[0]);
    await at(400);
    release(h);
    await at(500);
    await sameAcrossRemount(h);
    await pausedLineReplays(h, LINES[1]!);
  });

  test("a save taken after pauses and loaded into a new game, whose paused time starts at zero", async () => {
    const h = harness();
    await started(h);
    await pausesWhileTyping(h);
    const save = h.game.saveHere();
    expect(save).not.toBeNull();
    const loaded = harness();
    await loaded.ready;
    expect(loaded.game.storyLag()).toBe(0);
    expect(loaded.game.loadToResume(save!.data)).toBe(true);
    await loaded.game.restore();
    loaded.game.start();
    await tick(loaded);
    expect(text(loaded)).toBe(LINES[0]);
    await pause(loaded, BEAT_LEAD_MS / 2, 500);
    await at(600);
    await sameAcrossRemount(loaded);
    await pausedLineReplays(loaded, LINES[1]!);
  });

  test("a checkpoint taken after pauses and loaded", async () => {
    const h = harness();
    await started(h);
    await pausesWhileTyping(h);
    await continueTo(h, LINES[1]!);
    const checkpoint = h.game.newestCheckpoint();
    expect(checkpoint).not.toBeNull();
    await pausedLineReplays(h, LINES[2]!);
    expect(h.game.loadCheckpoint(checkpoint!)).toBe(true);
    await h.game.restore();
    await tick(h);
    await pausedLineReplays(h, LINES[2]!);
  });

  test("a step back after pauses", async () => {
    const h = harness();
    await started(h);
    await pausesWhileTyping(h);
    await continueTo(h, LINES[1]!);
    await pausesWhileTyping(h);
    await continueTo(h, LINES[2]!);
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await tick(h);
    expect(text(h)).toBe(LINES[1]);
    await continueTo(h, LINES[2]!);
    await pausedLineReplays(h, LINES[3]!);
  });

  test("a preview scrub after pauses shows each scrubbed line whole across a remount", async () => {
    const h = harness();
    await h.ready;
    const lineOf = (line: string) => SOURCE.split("\n").findIndex((l) => l.includes(line));
    for (const line of [LINES[1]!, LINES[3]!, LINES[2]!]) {
      await pause(h, timeline.currentTime + 10, timeline.currentTime + 400);
      await h.preview(lineOf(line));
      await flushMicrotasks(40);
      expect(text(h)).toBe(line);
      await at(timeline.currentTime + 1);
      expect(visible(h)).toBe(letters(h).length);
      await toggle(h);
      await at(timeline.currentTime + 1);
      expect(visible(h)).toBe(letters(h).length);
    }
  });

  test("a first delivery keeps the beat's own time after the game has spent time paused", async () => {
    const writes: { time?: number }[] = [];
    const h = createDOMHarness(SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      afterEachMessage: (m: any) => {
        const all = (ms: any[]): any[] =>
          ms.flatMap((x) => (x?.params?.messages ? all(x.params.messages) : [x]));
        for (const message of all([m])) {
          if (message?.method === "ui/write-text" && message.params.instructions.length > 0) {
            writes.push(message.params);
          }
        }
      },
    });
    restore = useTimedAnimations(h);
    h.game.context.system.now = () => timeline.currentTime;
    h.game.context.system.previewing = undefined;
    await started(h);
    await pausesWhileTyping(h);
    expect(h.game.storyLag()).toBeGreaterThan(0);
    writes.length = 0;
    await continueTo(h, LINES[1]!);
    const clicked = timeline.currentTime;
    const first = writes.find((w) => w.time != null);
    expect(first?.time).toBe(clicked + BEAT_LEAD_MS);
  });
});

describe("a remounted line replays on the story clock, whatever path writes it (#2861)", () => {
  const sourceWith = (layout: string, open: string) =>
    SOURCE.replace(/layout main \{[\s\S]*?\n\}\n/, `${layout}\n`).replace("[[open main]]", `[[open ${open}]]`);

  async function opened(source: string, compose = false) {
    const h = harness(source);
    await h.ready;
    h.jumpTo("start");
    (h.game.context.system as any).composeBeats = compose;
    return h;
  }

  async function beat(h: DOMHarness) {
    const instructions = h.nextBeat();
    expect(instructions).toBeDefined();
    const coordinator = new Coordinator(h.game, instructions!);
    for (let i = 0; i < 10; i += 1) {
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
      await flushMicrotasks(40);
    }
  }

  const shown = (h: DOMHarness, selector: string) =>
    [...h.overlay.querySelectorAll<HTMLElement>(`${selector} .text_letter`)].filter((el) => {
      const reveal = (el as any).__sdReveal;
      return reveal
        ? reveal.currentTime != null &&
            reveal.currentTime >= Number(reveal.effect.timing.delay ?? 0)
        : el.style.opacity === "1";
    }).length;

  test.each([false, true])(
    "a first line presented during a pause that began before it (beats composed: %s)",
    async (compose) => {
      const h = await opened(SOURCE, compose);
      await at(50);
      hold(h);
      await at(100);
      await beat(h);
      await at(400);
      release(h);
      await at(550);
      await sameAcrossRemount(h);
    },
  );

  test("the textstream page reopened while its line types, after a pause", async () => {
    const h = await opened(
      sourceWith("layout textstream {\n  textstream.paper.ink {\n    textstream_column\n  }\n}", "textstream"),
    );
    await at(100);
    await beat(h);
    await pause(h, 200, 600);
    await at(650);
    const column = h.overlay.querySelector(".textstream_column");
    const live = shown(h, ".textstream_column");
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(LINES[0]!.length);
    const ui = h.game.module.ui;
    await ui.applyLayoutInstructions([{ control: "close", name: "textstream" }], true);
    await flushMicrotasks(40);
    await ui.applyLayoutInstructions([{ control: "open", name: "textstream" }], true);
    await flushMicrotasks(40);
    expect(h.overlay.querySelector(".textstream_column")).not.toBe(column);
    expect(h.overlay.querySelector(".textstream_column")?.textContent).toContain(LINES[0]);
    expect(shown(h, ".textstream_column")).toBe(live);
  });

  test.each([0, 50])(
    "a replay sent during a pause and received %s ms later",
    async (delay) => {
      const h = await opened(SOURCE);
      await beat(h);
      await at(100);
      hold(h);
      const live = visible(h);
      expect(live).toBeGreaterThan(0);
      expect(live).toBeLessThan(letters(h).length);
      const receive = h.router.receive.bind(h.router);
      const queued: any[] = [];
      (h.router as any).receive = (message: any) => {
        if (message.method === "ui/write-text" && message.params.instructions.length > 0) {
          queued.push(message);
        } else {
          receive(message);
        }
      };
      await at(400);
      await toggle(h);
      expect(queued.length).toBeGreaterThan(0);
      await at(400 + delay);
      (h.router as any).receive = receive;
      for (const message of queued) {
        receive(message);
      }
      await flushMicrotasks(40);
      expect(visible(h)).toBe(live);
      release(h);
      await at(500 + delay);
      expect(visible(h)).toBeGreaterThan(live);
    },
  );
});
