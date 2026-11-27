import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import { createHarness, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

const story = (count: number) => {
  const lines = Array.from(
    { length: count },
    (_, i) => `  RAFFLES: l${i + 1}${i === count - 1 ? " >" : ""}`,
  ).join("\n");
  return `define RAFFLES as character with
  name = "RAFFLES"
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
  pause = 0
}

scene start
  [[open phone]]
${lines}
end
`;
};

type Harness = ReturnType<typeof createHarness>;

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const shown = (h: Harness): string =>
  (coordinator(h)?._instructions?.text?.["dialogue"] ?? [])
    .map((event: any) => event.text)
    .join("");

const entries = (h: Harness): number =>
  (h.game.module.ui.streams.entries("phone") as StreamEntry[]).length;

const reserved = (h: Harness): number =>
  (h.game.module.ui as any)._state.streams?.["phone/0"]?.reserved ?? 0;

async function tick(h: Harness, ms: number) {
  coordinator(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}

async function press(h: Harness) {
  coordinator(h)?.onMessage(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await tick(h, 0);
}

async function play(source: string) {
  const h = createHarness(source, 0, { autoOpenAll: false });
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

interface Seen {
  line: string;
  entries: number;
  waits: boolean;
}

async function walk(h: Harness, last: string): Promise<Seen[]> {
  const seen: Seen[] = [];
  for (let i = 0; i < 20000; i += 1) {
    const line = shown(h);
    const current = coordinator(h);
    if (seen.at(-1)?.line !== line) {
      seen.push({ line, entries: entries(h), waits: !current._instructions.auto });
    }
    if (line === last && current._finishedExecution) {
      break;
    }
    if (!current._instructions.auto && current._finishedExecution) {
      await press(h);
      continue;
    }
    await tick(h, 200);
  }
  expect(seen.at(-1)?.line).toBe(last);
  return seen;
}

const waitsOf = (seen: Seen[]) => seen.filter((s) => s.waits).map((s) => s.line);

const sizesOf = (seen: Seen[]) => [...new Set(seen.map((s) => s.entries))];

const runOf = (seen: Seen[], from: number, to: number) =>
  seen.slice(from - 1, to).map((s) => s.entries);

describe("a stream run longer than 100 lines (I-2743)", () => {
  test("a run of exactly 100 lines is one run sized once, waiting only at its last line", async () => {
    const h = await play(story(100));
    const seen = await walk(h, "l100");
    expect(seen).toHaveLength(100);
    expect(waitsOf(seen)).toEqual(["l100"]);
    expect(sizesOf(seen)).toEqual([100]);
  });

  test("a run of 101 lines waits at the 100th and its last, sized 100 then 101", async () => {
    const h = await play(story(101));
    const seen = await walk(h, "l101");
    expect(waitsOf(seen)).toEqual(["l100", "l101"]);
    expect(sizesOf(runOf(seen, 1, 100).map((entries) => ({ entries } as Seen)))).toEqual([100]);
    expect(seen[100]!.entries).toBe(101);
  });

  test("a run of 250 lines waits at the 100th, the 200th and its last, sized once for each part", async () => {
    const h = await play(story(250));
    const seen = await walk(h, "l250");
    expect(waitsOf(seen)).toEqual(["l100", "l200", "l250"]);
    expect([...new Set(runOf(seen, 1, 100))]).toEqual([100]);
    expect([...new Set(runOf(seen, 101, 200))]).toEqual([200]);
    expect([...new Set(runOf(seen, 201, 250))]).toEqual([250]);
  });
});

describe("the 100th line of a long run (I-2743)", () => {
  test("a save at the 100th line loads with 100 lines shown and the 101st still to read", async () => {
    const source = story(101);
    const h = await play(source);
    await walk(h, "l100");
    expect(coordinator(h)._instructions.auto).toBeUndefined();
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const loaded = createHarness(source, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("l100");
    expect(entries(loaded)).toBe(100);
    expect(reserved(loaded)).toBe(0);
    await walk(loaded, "l101");
    expect(entries(loaded)).toBe(101);
  });

  test("a step back from the 101st line returns to the 100th with 100 lines", async () => {
    const h = await play(story(101));
    await walk(h, "l101");
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(h)).toBe("l100");
    expect(entries(h)).toBe(100);
    expect(reserved(h)).toBe(0);
  });

  test.each([
    [50, 100, 50],
    [100, 100, 0],
    [101, 101, 0],
  ])("the preview of line %i shows the room the game has there", async (line, total, room) => {
    const source = story(101);
    const at = source.split("\n").findIndex((text) => text.trim().startsWith(`RAFFLES: l${line}`));
    const h = createHarness(source, at, { autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line: at });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(at);
    await flushMicrotasks(30);
    expect([entries(h), reserved(h)]).toEqual([total, room]);
  });
});

const TWO_STREAMS = `define RAFFLES as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream { dialogue.bubble { text } }
    stream { action.memo { text } }
  }
}

stream phone {
  advance = auto
  pause = 0
}
`;

const alternating = (count: number) =>
  `${TWO_STREAMS}
scene start
  [[open phone]]
${Array.from(
  { length: count },
  (_, i) => `  ${i % 2 ? "" : "RAFFLES: "}l${i + 1}${i === count - 1 ? " >" : ""}`,
).join("\n")}
end
`;

const lineOf = (h: Harness): string =>
  Object.entries(coordinator(h)?._instructions?.text ?? {})
    .filter(([target]) => target === "dialogue" || target === "action")
    .flatMap(([, events]: [string, any]) => events.map((event: any) => event.text))
    .join("");

const sizes = (h: Harness) =>
  [0, 1].map((index) => h.game.module.ui.streams.entries("phone", index).length);

describe("a run across the streams of one layout (I-2743)", () => {
  test("every stream reserves the lines it takes, whichever stream the current line goes to", async () => {
    const h = await play(alternating(101));
    for (let i = 0; i < 10 && !lineOf(h); i += 1) {
      await tick(h, 0);
    }
    expect(lineOf(h)).toBe("l1");
    expect(sizes(h)).toEqual([50, 50]);
    for (let i = 0; i < 50 && lineOf(h) !== "l2"; i += 1) {
      await tick(h, 200);
    }
    expect(lineOf(h)).toBe("l2");
    expect(sizes(h)).toEqual([50, 50]);
  });

  test("the hundredth line of the layout's run waits when its lines alternate between streams", async () => {
    const h = await play(alternating(101));
    const waits: string[] = [];
    let last = "";
    for (let i = 0; i < 5000; i += 1) {
      const line = lineOf(h);
      const current = coordinator(h);
      if (line !== last) {
        last = line;
        if (!current._instructions.auto) {
          waits.push(line);
        }
        expect(sizes(h).reduce((a, b) => a + b, 0)).toBe(line === "l101" ? 101 : 100);
      }
      if (line === "l101" && current._finishedExecution) {
        break;
      }
      if (!current._instructions.auto && current._finishedExecution) {
        await press(h);
      } else {
        await tick(h, 200);
      }
    }
    expect(waits).toEqual(["l100", "l101"]);
  });

  test("a clear starts a fresh run rather than counting on from the run before it", async () => {
    const h = await play(`define RAFFLES as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream { dialogue.bubble { text } }
  }
}

stream phone {
  advance = auto
  pause = 0
}

scene start
  [[open phone]]
${Array.from({ length: 99 }, (_, i) => `  RAFFLES: l${i + 1}`).join("\n")}
  [[clear phone]]
  RAFFLES: new1
  RAFFLES: new2
  RAFFLES: new3 >
end
`);
    await press(h);
    expect(shown(h)).toBe("l99");
    for (let i = 0; i < 10 && !coordinator(h)._finishedExecution; i += 1) {
      await tick(h, 200);
    }
    await press(h);
    expect(shown(h)).toBe("new1");
    expect(coordinator(h)._instructions.auto).toBe(true);
    expect([entries(h), reserved(h)]).toEqual([3, 2]);
  });
});
