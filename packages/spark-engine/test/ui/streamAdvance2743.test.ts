import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import { streamSettings } from "../../src/game/core/classes/presenters/streamRuns";
import type { Instructions } from "../../src/game/core/types/Instructions";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const DEFS = `define RAFFLES as character with
  name = "RAFFLES"
end

define BUNNY as character with
  name = "BUNNY"
end

define sky as image with
  src = "https://example.com/sky.png"
end

define beep as audio with
  src = "https://example.com/beep.wav"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}

layout note {
  stream {
    note.memo { text }
  }
}
`;

const AUTO = `stream phone {
  advance = auto
  pause = 0.6s
}
`;

const THREAD = `${DEFS}
${AUTO}
scene start
  [[open phone]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three >
  BUNNY: four
  BUNNY: five
  choose
    * Reply
      RAFFLES: done
  end
end
`;

type Harness = ReturnType<typeof createHarness>;

const lineText = (beat: Instructions | undefined): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => target === "dialogue" || target === "note")
    .flatMap(([, events]) => events.map((event) => event.text))
    .join("");

const said = (entry: StreamEntry): string =>
  [...(entry.text["dialogue"] ?? []), ...(entry.text["note"] ?? [])]
    .map((event) => event.text)
    .join("");

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const shown = (h: Harness): string => lineText(coordinator(h)?._instructions);

const stream = (h: Harness, layout = "phone"): any =>
  (h.game.module.ui as any)._state.streams?.[`${layout}/0`];

const entries = (h: Harness, layout = "phone"): string[] =>
  (h.game.module.ui.streams.entries(layout) as StreamEntry[]).map(said);

const reserved = (h: Harness, layout = "phone"): number =>
  stream(h, layout)?.reserved ?? 0;

const queued = (h: Harness): string[] =>
  h.game.module.interpreter.queuedBeats.map(lineText).filter(Boolean);

async function play(source: string, opts?: Parameters<typeof createHarness>[2]) {
  const h = createHarness(source, 0, { autoOpenAll: false, ...opts });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(10);
  for (let i = 0; i < 10 && !shown(h); i += 1) {
    await tick(h, 0);
  }
  return h;
}

async function tick(h: Harness, ms: number) {
  coordinator(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}

async function typed(h: Harness) {
  for (let i = 0; i < 100 && !coordinator(h)?._finishedExecution; i += 1) {
    await tick(h, 100);
  }
  expect(coordinator(h)?._finishedExecution).toBe(true);
}

async function press(h: Harness) {
  coordinator(h)?.onMessage(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await tick(h, 0);
}

async function click(h: Harness) {
  await typed(h);
  await press(h);
}

async function tickUntil(h: Harness, line: string, limit = 20000, step = 10) {
  for (let elapsed = 0; elapsed < limit && shown(h) !== line; elapsed += step) {
    await tick(h, step);
  }
  expect(shown(h)).toBe(line);
}

async function waits(h: Harness, ms = 5000) {
  const line = shown(h);
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await tick(h, 100);
  }
  expect(shown(h)).toBe(line);
}

describe("a stream that advances by itself gathers its run before showing it (I-2743)", () => {
  test("three lines are gathered into one run, a `>` ends it, and a menu ends the next", async () => {
    const h = await play(THREAD);
    expect(shown(h)).toBe("one");
    expect(queued(h)).toEqual(["two", "three"]);
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(reserved(h)).toBe(2);
    expect(coordinator(h)._instructions.auto).toBe(true);

    await tickUntil(h, "three");
    expect(coordinator(h)._instructions.auto).toBeUndefined();
    expect(reserved(h)).toBe(0);
    await waits(h);

    await click(h);
    expect(shown(h)).toBe("four");
    expect(queued(h)).toEqual(["five"]);
    expect(h.game.module.interpreter.queuedBeats.at(-1)?.choices).toHaveLength(1);
    expect(entries(h)).toEqual(["one", "two", "three", "four", "five"]);
    expect(reserved(h)).toBe(1);

    await tickUntil(h, "five");
    expect(coordinator(h)._instructions.auto).toBeUndefined();
    await waits(h);
  });

  test("each line starts `pause` after the one before it finishes typing, and the last waits for a click", async () => {
    const h = await play(THREAD);
    interface Seen {
      beat: object;
      startedAt: number;
      typedAt?: number;
    }
    const seen: Seen[] = [];
    const note = (at: number) => {
      const current = coordinator(h);
      const previous = seen.at(-1);
      const last: Seen =
        previous && previous.beat === current ? previous : { beat: current, startedAt: at };
      if (last !== previous) {
        seen.push(last);
      }
      if (last.typedAt === undefined && current._finishedExecution) {
        last.typedAt = at;
      }
    };
    const step = 10;
    note(0);
    for (let at = step; at <= 8000; at += step) {
      await tick(h, step);
      note(at);
    }
    expect(seen.map((s) => lineText((s.beat as any)._instructions))).toEqual([
      "one",
      "two",
      "three",
    ]);
    for (let i = 1; i < seen.length; i += 1) {
      const gap = seen[i]!.startedAt - seen[i - 1]!.typedAt!;
      expect(gap).toBeGreaterThanOrEqual(600);
      expect(gap).toBeLessThanOrEqual(600 + step);
    }
    expect(seen.at(-1)!.typedAt).toBeDefined();
  });

  test("a click in the middle of a run shows every line up to its wait at once", async () => {
    const h = await play(THREAD);
    await tick(h, 10);
    expect(shown(h)).toBe("one");
    expect(coordinator(h)._finishedExecution).toBe(false);
    await press(h);
    expect(shown(h)).toBe("three");
    expect(coordinator(h)._finishedExecution).toBe(true);
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(reserved(h)).toBe(0);
    const views = (h.game.module.ui.streams as any)._mounted.get("phone/0")[0].entries;
    expect(views.map((view: any) => Boolean(view.reserved))).toEqual([false, false, false]);
    await waits(h);
    await click(h);
    expect(shown(h)).toBe("four");
  });

  test("a picture and a sound written on the second line happen when the second line starts", async () => {
    const h = await play(`${DEFS}
${AUTO}
scene start
  [[open phone]]
  RAFFLES: one
  [[show backdrop sky]]
  ((play sound beep))
  RAFFLES: two
end
`);
    const sky = () =>
      flattenMessages(h.messages).filter(
        (m: any) =>
          (m.method === "ui/write-image" && m.params.target === "backdrop") ||
          (m.method === "assets/load" && JSON.stringify(m.params).includes("sky.png")),
      ).length;
    const drawn = () =>
      flattenMessages(h.messages).filter(
        (m: any) => m.method === "ui/write-image" && m.params.target === "backdrop",
      ).length;
    const beep = () =>
      flattenMessages(h.messages).filter(
        (m: any) => m.method.startsWith("audio/") && JSON.stringify(m.params).includes("beep"),
      ).length;
    expect(shown(h)).toBe("one");
    expect(entries(h)).toEqual(["one", "two"]);
    expect(Object.keys(h.game.module.interpreter.queuedBeats[0]?.image ?? {})).toEqual(["backdrop"]);
    expect(sky()).toBe(0);
    expect(beep()).toBe(0);

    await tickUntil(h, "two");
    await flushMicrotasks(10);
    expect(sky()).toBeGreaterThan(0);
    expect(beep()).toBeGreaterThan(0);
    h.releaseAssets();
    for (let i = 0; i < 5; i += 1) {
      await tick(h, 10);
    }
    expect(drawn()).toBeGreaterThan(0);
  });
});

describe("how far a stream's lines are gathered (I-2743)", () => {
  const NOTE = `${DEFS}
scene start
  @note: first
  @note: second >
  @note: third
  The door creaks.
end
`;

  test("a stream in a layout that opened by itself is gathered to its close, across a `>`", async () => {
    const h = await play(NOTE);
    expect(shown(h)).toBe("first");
    expect(entries(h, "note")).toEqual(["first", "second", "third"]);
    expect(reserved(h, "note")).toBe(2);
    await waits(h);
    await click(h);
    expect(shown(h)).toBe("second");
    expect(reserved(h, "note")).toBe(1);
    await click(h);
    expect(shown(h)).toBe("third");
    expect(reserved(h, "note")).toBe(0);
    await click(h);
    expect(stream(h, "note")).toBeUndefined();
  });

  test("with `advance = auto` in a layout that opened by itself, the run still waits at the `>`", async () => {
    const h = await play(NOTE.replace("scene start", "stream note {\n  advance = auto\n}\n\nscene start"));
    expect(entries(h, "note")).toEqual(["first", "second", "third"]);
    await tickUntil(h, "second");
    expect(reserved(h, "note")).toBe(1);
    await waits(h);
    await click(h);
    expect(shown(h)).toBe("third");
    await waits(h);
  });

  test("a stream in a layout the author opened is gathered to the next wait", async () => {
    const h = await play(THREAD);
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(queued(h)).not.toContain("four");
  });

  test("with `advance = click` in a layout the author opened, each line is a run of its own", async () => {
    const h = await play(THREAD.replace(AUTO, ""));
    expect(shown(h)).toBe("one");
    expect(entries(h)).toEqual(["one"]);
    expect(queued(h)).toEqual([]);
    await waits(h);
  });
});

describe("each wait is one step for stepping back and for saves (I-2743)", () => {
  test("a step back from after a run returns to the wait before it", async () => {
    const h = await play(THREAD);
    await tickUntil(h, "three");
    await click(h);
    await tickUntil(h, "five");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(h)).toBe("three");
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(reserved(h)).toBe(0);
  });

  test("a step back while a run's lines are still advancing returns to the wait before the run", async () => {
    const h = await play(THREAD);
    await tickUntil(h, "three");
    await click(h);
    expect(shown(h)).toBe("four");
    expect(coordinator(h)._instructions.auto).toBe(true);
    expect(h.game.history.canRollBack).toBe(true);
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(h)).toBe("three");
    expect(entries(h)).toEqual(["one", "two", "three"]);
    await h.game.rollBack("beat");
    await flushMicrotasks(10);
    expect(["one", "two"]).not.toContain(shown(h));
  });

  test("a save taken at a wait loads with the lines shown up to it", async () => {
    const h = await play(THREAD);
    await tickUntil(h, "three");
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();

    const loaded = createHarness(THREAD, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("three");
    expect(entries(loaded)).toEqual(["one", "two", "three"]);
    expect(reserved(loaded)).toBe(0);
    await waits(loaded);
    await click(loaded);
    expect(shown(loaded)).toBe("four");
  });

  test("a save taken at a `>` inside a layout that opened by itself loads with the rest still gathered", async () => {
    const source = `${DEFS}
scene start
  @note: first
  @note: second >
  @note: third
  The door creaks.
end
`;
    const h = await play(source);
    await click(h);
    expect(shown(h)).toBe("second");
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();

    const loaded = createHarness(source, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("second");
    expect(entries(loaded, "note")).toEqual(["first", "second", "third"]);
    expect(reserved(loaded, "note")).toBe(1);
    await click(loaded);
    expect(shown(loaded)).toBe("third");
  });
});

describe("the preview of a line inside a run (I-2743)", () => {
  test("makes room for every gathered line and shows the lines up to the cursor's", async () => {
    const line = THREAD.split("\n").findIndex((text) => text.includes("RAFFLES: two"));
    const h = createHarness(THREAD, line, {
      reactive: true,
      autoOpenAll: false,
      connect: false,
    });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(reserved(h)).toBe(1);
    const views = (h.game.module.ui.streams as any)._mounted.get("phone/0")[0].entries;
    expect(views.map((view: any) => Boolean(view.reserved))).toEqual([false, false, true]);
  });
});

describe("the game reads every pause the compiler accepts as written (I-2743)", () => {
  test.each([
    ["0.6s", 0.6],
    ["600ms", 0.6],
    [".5s", 0.5],
    ["2.5s", 2.5],
    ["1", 1],
    ["0", 0],
  ])("pause = %s waits %d seconds", async (pause, seconds) => {
    const h = createHarness(
      `${DEFS}\nstream phone {\n  advance = auto\n  pause = ${pause}\n}\n\nscene start\n  RAFFLES: one\nend\n`,
      0,
      { autoOpenAll: false },
    );
    await h.ready;
    expect(h.errors).toEqual([]);
    expect(streamSettings(h.game, "phone")).toEqual({ advance: "auto", pause: seconds });
  });
});

describe("a stream whose lines never reach a wait (I-2743)", () => {
  test("a layout that opened by itself and is written to in an endless loop reads at most 100 lines ahead", async () => {
    const h = await play(`${DEFS}
scene start
  @note: tick
  -> start
end
`);
    expect(h.errors).toEqual([]);
    expect(shown(h)).toBe("tick");
    expect(entries(h, "note")).toHaveLength(100);
    expect(reserved(h, "note")).toBe(99);
    await click(h);
    expect(shown(h)).toBe("tick");
    expect(entries(h, "note")).toHaveLength(101);
    expect(reserved(h, "note")).toBe(99);
  });
});
