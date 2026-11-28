import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import type { Game } from "../../src/game/core/classes/Game";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import type { Instructions } from "../../src/game/core/types/Instructions";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const ASSETS = [
  {
    uri: "inmemory:///raffles@happy.png",
    type: "image",
    name: "raffles@happy",
    ext: "png",
    src: "https://example.com/raffles@happy.png",
  },
] as never;

const story = (phone: string, lines: string, log = "  advance = auto\n  pause = 0s") => `define raffles as character with
  name = "RAFFLES"
end

layout main {
  cast { actor { portrait #clear { image } } }
}

layout phone {
  stream {
    dialogue.bubble { text }
  }
}

layout log {
  stream {
    dialogue.line { text }
  }
}

stream phone {
${phone}
}

stream log {
${log}
}

scene start
  [[open phone]]
  [[open log]]
${lines}
end
`;

const AUTO_RUN = "  advance = auto\n  pause = 0s\n  clear = run\n  carry = 1";
const AUTO_NEVER = "  advance = auto\n  pause = 0s\n  carry = 1";

type Harness = ReturnType<typeof createHarness>;

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const lineText = (beat: Instructions | undefined): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => target !== "character_name")
    .flatMap(([, events]) => events.map((event) => event.text))
    .join("");

const shown = (h: Harness): string => lineText(coordinator(h)?._instructions);

const said = (entry: StreamEntry): string =>
  (entry.text["dialogue"] ?? []).map((event) => event.text).join("");

const entriesOf = (h: Harness, layout: string): StreamEntry[] =>
  h.game.module.ui.streams.entries(layout) as StreamEntry[];

const stream = (h: Harness, layout: string): any =>
  (h.game.module.ui as any)._state.streams?.[`${layout}/0`];

const written = (h: Harness, layout: string): string[] =>
  entriesOf(h, layout).map((entry) => `${said(entry)}${entry.carried ? "*" : ""}`);

const portraits = (h: Harness): string[] =>
  h.game.module.ui.casts
    .entries("main")
    .flatMap((entry: any) => (entry.image?.portrait ?? []).flatMap((event: any) => event.assets ?? []));

interface Seen {
  line: string;
  phone: string[];
  reserved: number;
  log: string[];
  portraits: string[];
  waits: boolean;
}

const snapshot = (h: Harness): Seen => ({
  line: shown(h),
  phone: written(h, "phone"),
  reserved: stream(h, "phone")?.reserved ?? 0,
  log: written(h, "log"),
  portraits: portraits(h),
  waits: !coordinator(h)?._instructions?.auto,
});

async function tick(h: Harness, ms: number) {
  coordinator(h)?.onUpdate({ deltaMS: ms });
  await flushMicrotasks(5);
}

async function typed(h: Harness) {
  for (let i = 0; i < 100 && coordinator(h) && !coordinator(h)._finishedExecution; i += 1) {
    await tick(h, 100);
  }
}

async function press(h: Harness) {
  coordinator(h)?.onMessage(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await tick(h, 0);
}

async function start(source: string, line = 0) {
  const h = createHarness(source, line, { autoOpenAll: false, assets: ASSETS });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await flushMicrotasks(10);
  for (let i = 0; i < 20 && !shown(h); i += 1) {
    await tick(h, 0);
  }
  return h;
}

async function step(h: Harness) {
  const before = coordinator(h);
  if (before?._instructions?.auto) {
    for (let i = 0; i < 400 && coordinator(h) === before; i += 1) {
      await tick(h, 50);
    }
  } else {
    await typed(h);
    await press(h);
  }
  for (let i = 0; i < 20 && coordinator(h) && !shown(h); i += 1) {
    await typed(h);
    await press(h);
  }
}

async function walk(source: string, limit = 20): Promise<Seen[]> {
  const h = await start(source);
  const seen: Seen[] = [];
  for (let i = 0; i < limit && coordinator(h) && shown(h); i += 1) {
    seen.push(snapshot(h));
    await step(h);
  }
  return seen;
}

const brief = (seen: Seen[]) =>
  seen.map((s) => `${s.line} | phone ${s.phone.join(",")}${s.reserved ? ` (${s.reserved} reserved)` : ""} | log ${s.log.join(",")} | cast ${s.portraits.join(",") || "-"} | ${s.waits ? "waits" : "auto"}`);

describe("a clear in each position, beside a second layout receiving the same run (I-2745)", () => {
  test("on the first line of a run", async () => {
    const seen = await walk(
      story(AUTO_RUN, "  [[raffles@happy]]\n  RAFFLES: one\n  RAFFLES: two >\n  RAFFLES: three\n  RAFFLES: four >"),
    );
    expect(brief(seen)).toEqual([
      "one | phone one,two (1 reserved) | log one,two | cast raffles@happy | auto",
      "two | phone one,two | log one,two | cast raffles@happy | waits",
      "three | phone two*,three,four (1 reserved) | log one,two,three,four | cast raffles@happy | auto",
      "four | phone two*,three,four | log one,two,three,four | cast raffles@happy | waits",
    ]);
  });

  test("on the first line of a run, with no second layout keeping the picture's line", async () => {
    const seen = await walk(
      story(
        AUTO_RUN,
        "  [[raffles@happy]]\n  RAFFLES: one\n  RAFFLES: two >\n  RAFFLES: three\n  RAFFLES: four >\n  RAFFLES: five >",
        "  advance = auto\n  pause = 0s\n  clear = run",
      ),
    );
    expect(brief(seen)).toEqual([
      "one | phone one,two (1 reserved) | log one,two | cast raffles@happy | auto",
      "two | phone one,two | log one,two | cast raffles@happy | waits",
      "three | phone two*,three,four (1 reserved) | log three,four | cast - | auto",
      "four | phone two*,three,four | log three,four | cast - | waits",
      "five | phone four*,five | log five | cast - | waits",
    ]);
  });

  test("in the middle of a run", async () => {
    const seen = await walk(
      story(AUTO_NEVER, "  RAFFLES: one\n  RAFFLES: two\n  [[clear phone]] RAFFLES: three\n  RAFFLES: four >"),
    );
    expect(brief(seen)).toEqual([
      "one | phone one,two (1 reserved) | log one,two,three,four | cast - | auto",
      "two | phone one,two | log one,two,three,four | cast - | waits",
      "three | phone two*,three,four (1 reserved) | log one,two,three,four | cast - | auto",
      "four | phone two*,three,four | log one,two,three,four | cast - | waits",
    ]);
  });

  test("on the hundredth line of a run", async () => {
    const lines = Array.from(
      { length: 101 },
      (_, i) => `  ${i === 99 ? "[[clear phone]] " : ""}RAFFLES: l${i + 1}`,
    ).join("\n");
    const seen = await walk(story(AUTO_NEVER, lines), 105);
    const at = (line: string) => brief(seen.filter((s) => s.line === line));
    expect(at("l99")).toEqual([
      `l99 | phone ${Array.from({ length: 99 }, (_, i) => `l${i + 1}`).join(",")} | log ${Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join(",")} | cast - | waits`,
    ]);
    expect(at("l100")).toEqual([
      `l100 | phone l99*,l100,l101 (1 reserved) | log ${Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join(",")} | cast - | waits`,
    ]);
    expect(at("l101")).toEqual([
      `l101 | phone l99*,l100,l101 | log ${Array.from({ length: 101 }, (_, i) => `l${i + 1}`).join(",")} | cast - | waits`,
    ]);
  });

  test("on a line that extends the entry before it", async () => {
    const seen = await walk(
      story(AUTO_NEVER, "  [[raffles@happy]]\n  RAFFLES: one .. >\n  [[clear phone]] RAFFLES: .. two\n  RAFFLES: three >"),
    );
    expect(brief(seen)).toEqual([
      "one | phone one | log one | cast raffles@happy | waits",
      "one two | phone one two*,three (1 reserved) | log one two,three | cast raffles@happy | auto",
      "three | phone one two*,three | log one two,three | cast raffles@happy | waits",
    ]);
  });

  test("on a line that also starts a gathered run", async () => {
    const seen = await walk(
      story(AUTO_NEVER, "  RAFFLES: one >\n  [[clear phone]] RAFFLES: two\n  RAFFLES: three >"),
    );
    expect(brief(seen)).toEqual([
      "one | phone one | log one | cast - | waits",
      "two | phone one*,two,three (1 reserved) | log one,two,three | cast - | auto",
      "three | phone one*,two,three | log one,two,three | cast - | waits",
    ]);
  });

  test("two clears with no stream line between them", async () => {
    const seen = await walk(
      story(
        AUTO_NEVER,
        "  RAFFLES: one\n  RAFFLES: two >\n  [[clear phone]] The street is empty.\n  [[clear phone]] RAFFLES: three >",
      ),
    );
    expect(brief(seen)).toEqual([
      "one | phone one,two (1 reserved) | log one,two | cast - | auto",
      "two | phone one,two | log one,two | cast - | waits",
      "The street is empty. | phone two* | log one,two | cast - | waits",
      "three | phone two*,three | log one,two,three | cast - | waits",
    ]);
  });

  test("two clears on one line clear once", async () => {
    const seen = await walk(
      story(AUTO_RUN, "  RAFFLES: one\n  RAFFLES: two >\n  [[clear phone]] [[clear phone]] RAFFLES: three >"),
    );
    expect(brief(seen)).toEqual([
      "one | phone one,two (1 reserved) | log one,two | cast - | auto",
      "two | phone one,two | log one,two | cast - | waits",
      "three | phone two*,three | log one,two,three | cast - | waits",
    ]);
  });
});

describe("saves, step back and the preview before a clear, on it and after it (I-2745)", () => {
  const SOURCE = story(
    AUTO_RUN,
    "  [[raffles@happy]]\n  RAFFLES: one\n  RAFFLES: two >\n  RAFFLES: three\n  RAFFLES: four >\n  RAFFLES: five >",
    "  advance = auto\n  pause = 0s\n  clear = run",
  );

  const POSITIONS: [line: string, phone: string[], log: string[], cast: string[]][] = [
    ["two", ["one", "two"], ["one", "two"], ["raffles@happy"]],
    ["three", ["two*", "three", "four"], ["three", "four"], []],
    ["four", ["two*", "three", "four"], ["three", "four"], []],
    ["five", ["four*", "five"], ["five"], []],
  ];

  const WAITS = POSITIONS.filter(([line]) => line !== "three");

  async function reach(h: Harness, line: string) {
    for (let i = 0; i < 20 && shown(h) !== line; i += 1) {
      await step(h);
    }
    expect(shown(h)).toBe(line);
  }

  test.each(WAITS)("a save at the wait on %s loads with the same entries", async (line, phone, log, cast) => {
    const h = await start(SOURCE);
    await reach(h, line);
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();
    const loaded = createHarness(SOURCE, 0, { autoOpenAll: false, assets: ASSETS });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe(line);
    expect(written(loaded, "phone")).toEqual(phone);
    expect(written(loaded, "log")).toEqual(log);
    expect(portraits(loaded)).toEqual(cast);
  });

  test("a save taken inside the run a clear starts loads where the game resumes it, with the entries the game had there", async () => {
    for (const source of [SOURCE, story(AUTO_RUN, "  RAFFLES: one\n  RAFFLES: two >\n  RAFFLES: three\n  RAFFLES: four >")]) {
      const played = new Map((await walk(source)).map((s) => [s.line, s] as const));
      const h = await start(source);
      await reach(h, "three");
      const saved = h.game.saveHere();
      expect(saved).not.toBeNull();
      const loaded = createHarness(source, 0, { autoOpenAll: false, assets: ASSETS });
      await loaded.ready;
      loaded.game.context.system.previewing = undefined;
      expect(loaded.game.loadToResume(saved!.data)).toBe(true);
      loaded.game.start();
      await flushMicrotasks(10);
      const at = played.get(shown(loaded));
      expect(["three", "four"]).toContain(shown(loaded));
      expect(written(loaded, "phone")).toEqual(at!.phone);
      expect(written(loaded, "log")).toEqual(at!.log);
      expect(portraits(loaded)).toEqual(at!.portraits);
    }
  });

  test("a step back returns through each wait with its entries", async () => {
    const h = await start(SOURCE);
    await reach(h, "five");
    const back: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const moved = await h.game.rollBack("beat");
      await flushMicrotasks(20);
      if (!moved.moved || !shown(h)) {
        break;
      }
      back.push(`${shown(h)} | phone ${written(h, "phone").join(",")} | log ${written(h, "log").join(",")} | cast ${portraits(h).join(",") || "-"}`);
    }
    expect(back).toEqual([
      "four | phone two*,three,four | log three,four | cast -",
      "two | phone one,two | log one,two | cast raffles@happy",
    ]);
  });

  test.each(POSITIONS)("the preview on %s shows the entries the game has there", async (line, phone, log) => {
    const at = SOURCE.split("\n").findIndex((text) => text.trim() === `RAFFLES: ${line}${line === "two" || line === "four" || line === "five" ? " >" : ""}`);
    expect(at).toBeGreaterThan(0);
    const h = createHarness(SOURCE, at, { reactive: true, autoOpenAll: false, connect: false, assets: ASSETS });
    h.game.setStartFrom({ file: MAIN_URI, line: at });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(at);
    await flushMicrotasks(30);
    expect(written(h, "phone")).toEqual(phone);
    expect(written(h, "log")).toEqual(log);
  });
});

describe("a mounted stream that missed two clears (I-2745)", () => {
  const LAYOUT = `define RAFFLES as character with
  name = "RAFFLES"
end

layout phone {
  stream {
    dialogue.bubble { text }
  }
}

stream phone {
  carry = 1
}

scene start
  RAFFLES: one
end
`;

  const line = (text: string, clear = false) => ({
    text: { character_name: [{ text: "RAFFLES" }], dialogue: [{ text }] },
    ...(clear ? { layout: { phone: [{ control: "clear", name: "phone" }] } } : {}),
  });

  async function show(h: Harness, beat: Record<string, unknown>) {
    const c = new Coordinator(h.game, { end: 0, ...beat } as never);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
      (c as any)._onTick?.(100);
    }
    await flushMicrotasks(20);
  }

  const views = (h: Harness): any[] =>
    (h.game.module.ui.streams as any)._mounted.get("phone/0")?.[0]?.entries ?? [];

  const ids = (h: Harness) =>
    views(h).map((view) => (h.game.module.ui as any).collectNodes(view.group)[0]?.id as string);

  const carriedMark = (h: Harness, id: string) => {
    let value: string | null | undefined;
    for (const m of flattenMessages(h.messages) as any[]) {
      if (
        (m?.method === "ui/create" || m?.method === "ui/update") &&
        m.params?.element === id &&
        m.params.attributes &&
        "data-carried" in m.params.attributes
      ) {
        value = m.params.attributes["data-carried"];
      }
    }
    return value != null;
  };

  const styleOf = (h: Harness, id: string, property: string) => {
    let value: string | null | undefined;
    for (const m of flattenMessages(h.messages) as any[]) {
      if (
        (m?.method === "ui/create" || m?.method === "ui/update") &&
        m.params?.element === id &&
        m.params.style &&
        property in m.params.style
      ) {
        value = m.params.style[property];
      }
    }
    return value;
  };

  test("does not reuse a discarded entry's view for a new entry with the same text", async () => {
    const h = createHarness(LAYOUT, 0, {
      reactive: true,
      autoOpenAll: false,
      beforeConnect: (game: Game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    expect(h.errors).toEqual([]);
    const streams = h.game.module.ui.streams;
    await show(h, { ...line("same"), layout: { phone: [{ control: "open", name: "phone" }] } } as never);
    streams.saveEntryStyle("dialogue", { opacity: "0.2" }, true);
    await show(h, line("middle") as never);
    const [discarded] = ids(h);
    const mounted = (streams as any)._mounted as Map<string, unknown>;
    const held = new Map(mounted);
    mounted.clear();
    await show(h, line("same", true) as never);
    streams.saveEntryStyle("dialogue", { opacity: "0.8" }, true);
    await show(h, line("after", true) as never);
    for (const [key, value] of held) {
      mounted.set(key, value);
    }
    await show(h, line("last") as never);
    expect(written(h, "phone")).toEqual(["same*", "after", "last"]);
    const [carried] = ids(h);
    expect(carried).not.toBe(discarded);
    const opacity = (views(h)[0] ? (h.game.module.ui as any).collectNodes(views(h)[0].group) : [])
      .flatMap((root: any) => [root, ...(h.game.module.ui as any).searchForAll(root, "dialogue")])
      .map((el: any) => styleOf(h, el.id, "opacity"))
      .filter((value: unknown) => value != null);
    expect(opacity).toEqual(["0.8"]);
  });

  test("rebuilds the carried entry once it renders again, with no stale or doubled entry", async () => {
    const h = createHarness(LAYOUT, 0, {
      reactive: true,
      autoOpenAll: false,
      beforeConnect: (game: Game) => {
        game.context.system.previewing = undefined;
      },
    });
    await h.ready;
    expect(h.errors).toEqual([]);
    await show(h, { ...line("one"), layout: { phone: [{ control: "open", name: "phone" }] } } as never);
    await show(h, line("two") as never);
    expect(views(h)).toHaveLength(2);
    const mounted = (h.game.module.ui.streams as any)._mounted as Map<string, unknown>;
    const held = new Map(mounted);
    mounted.clear();
    await show(h, line("three", true) as never);
    await show(h, line("four", true) as never);
    for (const [key, value] of held) {
      mounted.set(key, value);
    }
    await show(h, line("five") as never);
    expect(written(h, "phone")).toEqual(["three*", "four", "five"]);
    expect(views(h)).toHaveLength(3);
    expect(new Set(ids(h)).size).toBe(3);
    expect(ids(h).map((id) => carriedMark(h, id))).toEqual([true, false, false]);
  });
});
