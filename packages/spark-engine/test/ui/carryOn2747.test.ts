import { describe, expect, test } from "vitest";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import type { Instructions } from "../../src/game/core/types/Instructions";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import { createHarness, flattenMessages, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

const DEFS = `define RAFFLES as character with
  name = "RAFFLES"
end

define BUNNY as character with
  name = "BUNNY"
end

layout main {
  textbox {
    character_info {
      character_name #clear {
        text
      }
    }
    dialogue #clear {
      text
    }
    action #clear {
      text
    }
  }
}

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

const story = (body: string, settings = "") =>
  `${DEFS}\n${settings}\nscene start\n${body}\nend\n`;

type Harness = ReturnType<typeof createHarness>;

const lineText = (beat: Instructions | undefined): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events.map((event) => event.text ?? ""))
    .join("");

const said = (entry: StreamEntry): string =>
  [...(entry.text["dialogue"] ?? []), ...(entry.text["note"] ?? [])]
    .map((event) => event.text)
    .join("");

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const beat = (h: Harness): Instructions | undefined => coordinator(h)?._instructions;

const shown = (h: Harness): string => lineText(beat(h));

const finished = (h: Harness): boolean => Boolean(coordinator(h)?._finishedExecution);

const entries = (h: Harness, layout = "phone"): string[] =>
  (h.game.module.ui.streams.entries(layout) as StreamEntry[]).map(said);

const reserved = (h: Harness, layout = "phone"): number =>
  (h.game.module.ui as any)._state.streams?.[`${layout}/0`]?.reserved ?? 0;

async function begin(source: string): Promise<Harness> {
  const h = createHarness(source, 0, { autoOpenAll: false });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(10);
  return h;
}

async function play(source: string): Promise<Harness> {
  const h = await begin(source);
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
  for (let i = 0; i < 100 && !finished(h); i += 1) {
    await tick(h, 100);
  }
  expect(finished(h)).toBe(true);
}

async function press(h: Harness) {
  coordinator(h)?.onMessage(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await tick(h, 0);
}

async function waits(h: Harness, ms = 5000) {
  const line = shown(h);
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await tick(h, 100);
  }
  expect(shown(h)).toBe(line);
}

interface Seen {
  line: string;
  startedAt: number;
  typedAt?: number;
}

async function timeline(h: Harness, until: number, step = 10): Promise<Seen[]> {
  const seen: Seen[] = [];
  let current: unknown;
  const note = (at: number) => {
    if (coordinator(h) !== current) {
      current = coordinator(h);
      seen.push({ line: shown(h), startedAt: at });
    }
    const last = seen.at(-1)!;
    if (last.typedAt === undefined && finished(h)) {
      last.typedAt = at;
    }
  };
  note(0);
  for (let at = step; at <= until; at += step) {
    await tick(h, step);
    note(at);
  }
  return seen;
}

describe("a line that ends with `>>` carries on without a click (I-2747)", () => {
  test("in a box, the next line starts when its typing ends", async () => {
    const h = await play(story("  RAFFLES: one >>\n  RAFFLES: two"));
    expect(shown(h)).toBe("one");
    expect(beat(h)?.auto).toBe(true);
    expect(beat(h)?.pause).toBe(0);
    await typed(h);
    await tick(h, 0);
    expect(shown(h)).toBe("two");
    expect(beat(h)?.auto).toBeUndefined();
    await waits(h);
  });

  test("a line that is only a conditional interpolation carries on too", async () => {
    const h = await play(story('  {if true then "First" else "Other"} >>\n  Second.'));
    expect(shown(h)).toBe("First");
    expect(beat(h)?.auto).toBe(true);
    await typed(h);
    await tick(h, 0);
    expect(shown(h)).toBe("Second.");
  });

  test("a `>>` followed only by block comments carries on", async () => {
    const h = await play(story("  First >> /* one */ /* two */\n  Second."));
    expect(shown(h)).toBe("First");
    expect(beat(h)?.auto).toBe(true);
    await typed(h);
    await tick(h, 0);
    expect(shown(h)).toBe("Second.");
  });

  test("a `>>` before a block comment with text after it waits for a click at each break", async () => {
    const h = await play(story("  First >> /* aside */ middle\n  Second."));
    expect(shown(h)).toBe("First");
    expect(beat(h)?.auto).toBeUndefined();
    await waits(h);
  });

  test.each(["", " >>"])(
    "a line with only a sound, written with %j, leaves the text line after it waiting for a click",
    async (mark) => {
      const h = await play(
        story(
          `  ((play sound beep))${mark}\n  Wait here.\n  Next line.`,
          'define beep as audio with\n  src = "https://example.com/beep.wav"\nend\n',
        ),
      );
      expect(shown(h)).toBe("Wait here.");
      expect(beat(h)?.onward).toBeUndefined();
      await waits(h, 3000);
    },
  );

  test("a `<wait=0.6>` before `>>` delays the next line by that time", async () => {
    const gap = async (line: string) => {
      const h = await play(story(`  RAFFLES: ${line}\n  RAFFLES: two`));
      const seen = await timeline(h, 3000);
      expect(seen.map((s) => s.line.trim())).toEqual(["one", "two"]);
      return seen[1]!.startedAt - seen[0]!.startedAt;
    };
    const plain = await gap("one >>");
    const waited = await gap("one <wait=0.6> >>");
    expect(waited - plain).toBeGreaterThanOrEqual(600 - 10);
    expect(waited - plain).toBeLessThanOrEqual(600 + 50);
  });

  test("a click while the line types finishes it, and the story carries on with no other click", async () => {
    const h = await play(
      story("  RAFFLES: a line long enough to still be typing after a moment >>\n  RAFFLES: two"),
    );
    await tick(h, 10);
    expect(finished(h)).toBe(false);
    await press(h);
    expect(shown(h)).toBe("a line long enough to still be typing after a moment");
    expect(finished(h)).toBe(true);
    await tick(h, 0);
    expect(shown(h)).toBe("two");
    expect(finished(h)).toBe(false);
  });
});

describe("`>>` beside a `..` (I-2747)", () => {
  test("the next line that begins with `..` carries on in the same box with no click", async () => {
    const h = await play(story("  RAFFLES: Hold on .. >>\n  .. tight."));
    expect(shown(h)).toBe("Hold on");
    expect(beat(h)?.auto).toBe(true);
    await typed(h);
    await tick(h, 0);
    expect(shown(h)).toBe("Hold on tight.");
    expect(beat(h)?.extended?.["dialogue"]).toBeGreaterThan(0);
  });
});

describe("`>>` in a stream (I-2747)", () => {
  test("in a stream that advances by itself, the next line follows at once with no `pause`, and the run is gathered through it", async () => {
    const h = await play(
      story(
        "  [[open phone]]\n  RAFFLES: one >>\n  RAFFLES: two\n  RAFFLES: three >\n  BUNNY: four",
        AUTO,
      ),
    );
    expect(shown(h)).toBe("one");
    expect(entries(h)).toEqual(["one", "two", "three"]);
    expect(reserved(h)).toBe(2);
    expect(beat(h)?.pause).toBe(0);
    const seen = await timeline(h, 8000);
    expect(seen.map((s) => s.line)).toEqual(["one", "two", "three"]);
    expect(seen[1]!.startedAt - (seen[0]!.typedAt ?? seen[1]!.startedAt)).toBeLessThanOrEqual(10);
    expect(seen[2]!.startedAt - seen[1]!.typedAt!).toBeGreaterThanOrEqual(600);
    await waits(h);
  });

  test.each(["", " >>"])(
    "the hundredth line of an automatic run, written with %j, still waits for a click",
    async (mark) => {
      const lines = Array.from({ length: 101 }, (_, i) => {
        const n = i + 1;
        if (n < 100) return `  RAFFLES: <speed=0>line${n} >>`;
        return n === 100 ? `  RAFFLES: line100${mark}` : "  RAFFLES: line101";
      }).join("\n");
      const h = await play(story(`  [[open phone]]\n${lines}`, AUTO));
      for (let i = 0; i < 200 && shown(h) !== "line100"; i += 1) {
        await tick(h, 100);
      }
      expect(shown(h)).toBe("line100");
      await waits(h, 3000);
      expect(entries(h)).toHaveLength(100);
    },
  );

  test("in a stream that waits for a click, the run is gathered through it to the next line", async () => {
    const h = await play(
      story("  [[open phone]]\n  RAFFLES: one >>\n  RAFFLES: two\n  RAFFLES: three"),
    );
    expect(shown(h)).toBe("one");
    expect(entries(h)).toEqual(["one", "two"]);
    expect(reserved(h)).toBe(1);
    await typed(h);
    await tick(h, 0);
    expect(shown(h)).toBe("two");
    expect(reserved(h)).toBe(0);
    await waits(h);
  });

  test("two `<speed=0>` lines ending in `>>` are both present in the frame the layout that holds them appears in", async () => {
    const h = createHarness(
      story("  @note: <speed=0>first >>\n  @note: <speed=0>second >>\n  @note: third"),
      0,
      { autoOpenAll: false },
    );
    await h.ready;
    expect(h.errors).toEqual([]);
    h.game.context.system.previewing = undefined;
    const frames: string[] = [];
    let read = 0;
    const frame = () => {
      const all = flattenMessages(h.messages);
      frames.push(JSON.stringify(all.slice(read)));
      read = all.length;
    };
    h.game.start();
    await flushMicrotasks(10);
    frame();
    for (let i = 0; i < 10 && !frames.some((f) => f.includes("memo")); i += 1) {
      await tick(h, 0);
      frame();
    }
    const appears = frames.findIndex((f) => f.includes("memo"));
    expect(appears).toBeGreaterThanOrEqual(0);
    expect(frames[appears]).toContain('"first"');
    expect(frames[appears]).toContain('"second"');
    expect(shown(h)).toBe("third");
    expect(entries(h, "note")).toEqual(["first", "second", "third"]);
  });
});

describe("the preview of a `>>` line (I-2747)", () => {
  test("shows that line, as the preview of a line without the mark does", async () => {
    const preview = async (mark: string) => {
      const source = story(`  RAFFLES: one${mark}\n  RAFFLES: two`);
      const line = source.split("\n").findIndex((text) => text.includes("RAFFLES: one"));
      const h = createHarness(source, line, { reactive: true, autoOpenAll: false, connect: false });
      h.game.setStartFrom({ file: MAIN_URI, line });
      h.game.simulate();
      expect(h.game.simulation).toBe("success");
      await h.reconnect();
      await flushMicrotasks(10);
      await h.preview(line);
      await flushMicrotasks(30);
      return ((h.game.module.ui as any)._state.text?.["dialogue"] ?? [])
        .map((event: any) => event.text ?? "")
        .join("");
    };
    expect(await preview("")).toBe("one");
    expect(await preview(" >>")).toBe("one");
  });
});
