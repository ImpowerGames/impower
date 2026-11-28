import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { Game } from "../../src/game/core/classes/Game";
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

const MAIN = "file:///local/main.sd";

const settings = (lines: string) => `stream phone {\n${lines}\n}\n`;

const thread = (block: string) => `${DEFS}
${block}
scene start
  [[open phone]]
  RAFFLES: one
  RAFFLES: two >
  BUNNY: three
  BUNNY: four >
  The street is empty.
end
`;

const AUTO = "  advance = auto\n  pause = 0.2s";

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

const streamOf = (h: Harness, layout = "phone"): any =>
  (h.game.module.ui as any)._state.streams?.[`${layout}/0`];

const entriesOf = (h: Harness, layout = "phone"): StreamEntry[] =>
  h.game.module.ui.streams.entries(layout) as StreamEntry[];

const entries = (h: Harness, layout = "phone"): string[] => entriesOf(h, layout).map(said);

const carried = (h: Harness, layout = "phone"): string[] =>
  entriesOf(h, layout)
    .filter((entry) => entry.carried)
    .map(said);

const reserved = (h: Harness, layout = "phone"): number => streamOf(h, layout)?.reserved ?? 0;

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

async function click(h: Harness) {
  await typed(h);
  coordinator(h)?.onMessage(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await tick(h, 0);
}

function stepped(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ] as never,
    seedBuiltinsIntoStory: true,
  });
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program as SparkProgram;
  const game = new Game({
    now: () => 0,
    setTimeout: (() => 0) as never,
    resolve: (path: string) => path,
    fetch: async () => "",
    log: () => {},
    program,
  } as never);
  game.start();
  const text = () => (game.story.currentText ?? "").trim();
  const tapTo = (line: string) => {
    for (let i = 0; i < 12 && text() !== line; i += 1) {
      game.clickedToContinue();
    }
    expect(text()).toBe(line);
  };
  return { entries: () => game.module.ui.streams.entries("phone") as StreamEntry[], tapTo };
}

async function tickUntil(h: Harness, line: string, limit = 20000, step = 50) {
  for (let elapsed = 0; elapsed < limit && shown(h) !== line; elapsed += step) {
    await tick(h, step);
  }
  expect(shown(h)).toBe(line);
}

const views = (h: Harness, layout = "phone"): any[] =>
  (h.game.module.ui.streams as any)._mounted.get(`${layout}/0`)?.[0]?.entries ?? [];

const rootIds = (h: Harness, view: any): string[] =>
  (h.game.module.ui as any).collectNodes(view.group).map((el: any) => el.id);

const attributeOf = (h: Harness, id: string, attribute: string) => {
  let value: string | null | undefined;
  for (const m of flattenMessages(h.messages) as any[]) {
    if (
      (m?.method === "ui/create" || m?.method === "ui/update") &&
      m.params?.element === id &&
      m.params.attributes &&
      attribute in m.params.attributes
    ) {
      value = m.params.attributes[attribute];
    }
  }
  return value;
};

const marked = (h: Harness, attribute: string): boolean[] =>
  views(h).map((view) =>
    rootIds(h, view).some((id) => attributeOf(h, id, attribute) != null),
  );

describe("the stream settings `clear` and `carry` (I-2745)", () => {
  test("the game reads both settings, with `never` and `0` where they are left out", async () => {
    const h = createHarness(
      `${DEFS}\n${settings("  clear = run\n  carry = 2")}\nscene start\n  RAFFLES: one\nend\n`,
      0,
      { autoOpenAll: false },
    );
    await h.ready;
    expect(h.errors).toEqual([]);
    expect(streamSettings(h.game, "phone")).toEqual({
      advance: "click",
      pause: 0.4,
      clear: "run",
      carry: 2,
    });
    expect(streamSettings(h.game, "note")).toEqual({
      advance: "click",
      pause: 0.4,
      clear: "never",
      carry: 0,
    });
  });
});

describe("a stream that clears at each new run (I-2745)", () => {
  test("with `clear = run`, the second run's first line removes the first run's entries", async () => {
    const h = await play(thread(settings(`${AUTO}\n  clear = run`)));
    await tickUntil(h, "two");
    expect(entries(h)).toEqual(["one", "two"]);
    await click(h);
    expect(shown(h)).toBe("three");
    expect(entries(h)).toEqual(["three", "four"]);
    expect(reserved(h)).toBe(1);
    expect(carried(h)).toEqual([]);
  });

  test("with `clear = never`, the second run keeps every entry of the first", async () => {
    const h = await play(thread(settings(`${AUTO}\n  clear = never`)));
    await tickUntil(h, "two");
    await click(h);
    expect(shown(h)).toBe("three");
    expect(entries(h)).toEqual(["one", "two", "three", "four"]);
    expect(carried(h)).toEqual([]);
  });

  test("with `carry = 1`, the newest entry of the first run stays at the top of the second", async () => {
    const h = await play(thread(settings(`${AUTO}\n  clear = run\n  carry = 1`)));
    await tickUntil(h, "two");
    await click(h);
    expect(shown(h)).toBe("three");
    expect(entries(h)).toEqual(["two", "three", "four"]);
    expect(carried(h)).toEqual(["two"]);
    expect(reserved(h)).toBe(1);
    await tickUntil(h, "four");
    expect(entries(h)).toEqual(["two", "three", "four"]);
  });

  test("a carry larger than the run keeps every entry there is", async () => {
    const h = await play(thread(settings(`${AUTO}\n  clear = run\n  carry = 5`)));
    await tickUntil(h, "two");
    await click(h);
    expect(entries(h)).toEqual(["one", "two", "three", "four"]);
    expect(carried(h)).toEqual(["one", "two"]);
  });

  test("with `advance = click` in a layout the author opened, each line is a run and clears the one before", async () => {
    const h = await play(thread(settings("  clear = run\n  carry = 1")));
    expect(entries(h)).toEqual(["one"]);
    await click(h);
    expect(shown(h)).toBe("two");
    expect(entries(h)).toEqual(["one", "two"]);
    expect(carried(h)).toEqual(["one"]);
    await click(h);
    expect(entries(h)).toEqual(["two", "three"]);
    expect(carried(h)).toEqual(["two"]);
  });
});

describe("`[[clear NAME]]` follows `carry` (I-2745)", () => {
  test("a clear keeps the newest entry with `carry = 1`, and no entry without it", () => {
    const story = (block: string) => `${DEFS}
${block}
scene start
  [[open phone]]
  RAFFLES: one
  RAFFLES: two
  [[clear phone]]
  BUNNY: three
end
`;
    const kept = stepped(story(settings("  carry = 1")));
    kept.tapTo("three");
    expect(kept.entries().map(said)).toEqual(["two", "three"]);
    expect(kept.entries().filter((entry) => entry.carried).map(said)).toEqual(["two"]);

    const plain = stepped(story(""));
    plain.tapTo("three");
    expect(plain.entries().map(said)).toEqual(["three"]);
  });

  test("a close empties the stream whatever `carry` says", () => {
    const h = stepped(`${DEFS}
${settings("  carry = 1")}
scene start
  [[open phone]]
  RAFFLES: one
  [[close phone]]
  The street is empty.
  [[open phone]]
  BUNNY: two
end
`);
    h.tapTo("two");
    expect(h.entries().map(said)).toEqual(["two"]);
    expect(h.entries().some((entry) => entry.carried)).toBe(false);
  });
});

describe("`@carried` and `@latest` on the entries of a cleared stream (I-2745)", () => {
  test("`@carried` is on the kept entry and no other, and `@latest` moves to the next run's first entry", async () => {
    const h = await play(thread(settings(`${AUTO}\n  clear = run\n  carry = 1`)));
    await tickUntil(h, "two");
    await typed(h);
    expect(marked(h, "data-carried")).toEqual([false, false]);
    expect(marked(h, "data-latest")).toEqual([false, true]);
    const two = rootIds(h, views(h)[1]);
    await click(h);
    expect(shown(h)).toBe("three");
    await typed(h);
    expect(rootIds(h, views(h)[0])).toEqual(two);
    expect(marked(h, "data-carried")).toEqual([true, false, false]);
    expect(marked(h, "data-latest")).toEqual([false, true, false]);
    await tickUntil(h, "four");
    await typed(h);
    expect(marked(h, "data-carried")).toEqual([true, false, false]);
    expect(marked(h, "data-latest")).toEqual([false, false, true]);
  });
});

describe("the order of a clear (I-2745)", () => {
  const SOURCE = `${DEFS}
${settings("  carry = 1")}
style bubble {
  transition = layout 0.38s
  @initial { opacity = 0 }
  @hide { opacity = 0; transition-duration = 0.22s }
}

scene start
  RAFFLES: one
end
`;

  const wire = (messages: any[]): any[] =>
    messages.flatMap((m: any) =>
      (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
        ? wire(m.params.messages)
        : [m],
    );

  const motions = (h: Harness) =>
    wire(h.messages)
      .filter((m: any) => m?.method === "ui/presence")
      .flatMap((m: any) => m.params.effects);

  const destroyed = (h: Harness, id: string) =>
    wire(h.messages).filter((m: any) => m?.method === "ui/destroy" && m.params?.element === id);

  const typedWrites = (h: Harness, text: string) =>
    wire(h.messages).filter(
      (m: any) =>
        m?.method === "ui/write-text" &&
        !m.params.held &&
        m.params.instructions.map((i: any) => i.text).join("") === text,
    );

  const line = (text: string, extra: Record<string, unknown> = {}) => ({
    text: {
      character_name: [{ text: "RAFFLES" }],
      dialogue: [...text].map((letter, i) => ({ text: letter, after: i * 0.05 })),
    },
    ...extra,
  });

  async function show(h: Harness, beat: Record<string, unknown>) {
    const c = new Coordinator(h.game, { end: 0, ...beat } as never);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
      (c as any)._onTick?.(100);
    }
    await flushMicrotasks(20);
    return c;
  }

  async function settle(h: Harness) {
    for (let i = 0; i < 4; i += 1) {
      h.releasePresence();
      h.releaseLayout();
      await flushMicrotasks(30);
    }
  }

  test("the leaving entries' motion ends, then the carried entry moves, then the next line starts", async () => {
    const h = createHarness(SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      holdPresence: true,
      holdLayout: true,
      beforeConnect: (game: Game) => {
        game.context.system.previewing = undefined;
        game.context.system.composeBeats = true;
      },
    });
    await h.ready;
    expect(h.errors).toEqual([]);
    await show(h, line("one", { layout: { phone: [{ control: "open", name: "phone" }] } }));
    await settle(h);
    await show(h, line("two"));
    await settle(h);
    const [one, two] = views(h).map((view) => rootIds(h, view)[0]!) as [string, string];
    h.reset();

    const c = await show(
      h,
      line("three", { layout: { phone: [{ control: "clear", name: "phone" }] } }),
    );
    expect(motions(h)).toEqual([{ element: one, presence: "hide" }]);
    expect(views(h).map((view) => rootIds(h, view)[0])[0]).toBe(two);
    expect(typedWrites(h, "three")).toEqual([]);

    h.releasePresence();
    h.releaseLayout();
    await flushMicrotasks(40);
    expect(destroyed(h, one)).toHaveLength(1);
    expect(destroyed(h, two)).toEqual([]);
    expect(h.heldLayout()).toHaveLength(1);
    expect(motions(h)).toHaveLength(1);

    h.releaseLayout([two]);
    await flushMicrotasks(40);
    const three = rootIds(h, views(h)[1])[0];
    expect(motions(h)).toEqual([
      { element: one, presence: "hide" },
      { element: three, presence: "show" },
    ]);
    expect(typedWrites(h, "three")).toEqual([]);

    h.releasePresence();
    await flushMicrotasks(40);
    for (let i = 0; i < 3; i += 1) {
      (c as any)._onTick?.(100);
      await flushMicrotasks(10);
    }
    expect(typedWrites(h, "three")).toHaveLength(1);
  });
});

describe("how far a stream that clears at each run is gathered (I-2745)", () => {
  test("a layout that opened by itself with `clear = run` is gathered to the next wait, not to its close", async () => {
    const source = `${DEFS}
stream note {
  advance = auto
  pause = 0.2s
  clear = run
}

scene start
  @note: first
  @note: second >
  @note: third
  The door creaks.
end
`;
    const h = await play(source);
    expect(shown(h)).toBe("first");
    expect(entries(h, "note")).toEqual(["first", "second"]);
    expect(reserved(h, "note")).toBe(1);
    await tickUntil(h, "second");
    await click(h);
    expect(shown(h)).toBe("third");
    expect(entries(h, "note")).toEqual(["third"]);
  });
});

describe("a line that continues the newest entry across a clear (I-2745)", () => {
  const CONTINUED = (lines: string) =>
    `${DEFS}\n${settings(lines)}\nscene start\n  [[open phone]]\n  RAFFLES: slight problem .. > .. doors locked >\nend\n`;

  test("adds to the carried entry instead of copying it, with `carry = 1`", async () => {
    const h = await play(CONTINUED("  clear = run\n  carry = 1"));
    expect(entries(h)).toEqual(["slight problem"]);
    await click(h);
    expect(shown(h)).toBe("slight problem doors locked");
    expect(entries(h)).toEqual(["slight problem doors locked"]);
    expect(carried(h)).toEqual(["slight problem doors locked"]);
    await typed(h);
    expect(views(h)).toHaveLength(1);
    expect(marked(h, "data-carried")).toEqual([true]);
  });

  test("keeps the entry it continues even with `carry = 0`", async () => {
    const h = await play(CONTINUED("  clear = run"));
    await click(h);
    expect(shown(h)).toBe("slight problem doors locked");
    expect(entries(h)).toEqual(["slight problem doors locked"]);
  });

  test("a later line that continues a carried entry keeps it carried", async () => {
    const h = await play(`${DEFS}
${settings("  carry = 1")}
scene start
  [[open phone]]
  RAFFLES: one .. >
  [[clear phone]] RAFFLES: .. two .. >
  RAFFLES: .. three >
end
`);
    await click(h);
    await typed(h);
    expect(entries(h)).toEqual(["one two"]);
    expect(carried(h)).toEqual(["one two"]);
    expect(marked(h, "data-carried")).toEqual([true]);
    await click(h);
    await typed(h);
    expect(entries(h)).toEqual(["one two three"]);
    expect(carried(h)).toEqual(["one two three"]);
    expect(marked(h, "data-carried")).toEqual([true]);
  });

  test("a step back and forward again keep one entry", async () => {
    const h = await play(CONTINUED("  clear = run\n  carry = 1"));
    await click(h);
    expect(entries(h)).toEqual(["slight problem doors locked"]);
    expect((await h.game.rollBack("beat")).moved).toBe(true);
    await flushMicrotasks(20);
    expect(shown(h)).toBe("slight problem");
    expect(entries(h)).toEqual(["slight problem"]);
    await click(h);
    expect(shown(h)).toBe("slight problem doors locked");
    expect(entries(h)).toEqual(["slight problem doors locked"]);
    expect(carried(h)).toEqual(["slight problem doors locked"]);
  });
});

describe("a line that continues the newest entry across a close (I-2745)", () => {
  test("starts the reopened stream with an uncarried entry, and the closed entry's picture leaves", async () => {
    const h = await play(
      `define raffles as character with
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

${settings("  carry = 2")}
scene start
  [[open phone]]
  RAFFLES: a
  [[raffles@happy]] RAFFLES: b .. >
  [[close phone]] [[open phone]] RAFFLES: .. c >
  RAFFLES: d >
end
`,
      {
        assets: [
          {
            uri: "inmemory:///raffles@happy.png",
            type: "image",
            name: "raffles@happy",
            ext: "png",
            src: "https://example.com/raffles@happy.png",
          },
        ] as never,
      },
    );
    const pictures = () =>
      h.game.module.ui.casts
        .entries("main")
        .flatMap((entry: any) => (entry.image?.portrait ?? []).flatMap((event: any) => event.assets ?? []));
    await click(h);
    expect(shown(h)).toBe("b");
    expect(pictures()).toEqual(["raffles@happy"]);
    await click(h);
    expect(shown(h)).toBe("b c");
    expect(entries(h)).toEqual(["b c"]);
    expect(carried(h)).toEqual([]);
    await click(h);
    expect(shown(h)).toBe("d");
    expect(entries(h)).toEqual(["b c", "d"]);
    expect(pictures()).toEqual([]);
  });
});

describe("a cast picture shown with a carried line (I-2745)", () => {
  const story = `define raffles as character with
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

${settings("  clear = run\n  carry = 1")}
scene start
  [[open phone]]
  [[raffles@happy]]
  RAFFLES: one
  RAFFLES: two
  RAFFLES: three
end
`;

  test("stays while its line is carried and leaves when that line does", async () => {
    const h = await play(story, {
      assets: [
        {
          uri: "inmemory:///raffles@happy.png",
          type: "image",
          name: "raffles@happy",
          ext: "png",
          src: "https://example.com/raffles@happy.png",
        },
      ] as never,
    });
    const pictures = () =>
      h.game.module.ui.casts
        .entries("main")
        .flatMap((entry: any) => (entry.image?.portrait ?? []).flatMap((event: any) => event.assets ?? []));
    expect(pictures()).toEqual(["raffles@happy"]);
    await click(h);
    expect(shown(h)).toBe("two");
    expect(entries(h)).toEqual(["one", "two"]);
    expect(pictures()).toEqual(["raffles@happy"]);
    await click(h);
    expect(entries(h)).toEqual(["two", "three"]);
    expect(pictures()).toEqual([]);
  });
});

describe("a run that ends at its hundredth line clears like any other (I-2745)", () => {
  const LONG = (() => {
    const lines = Array.from({ length: 101 }, (_, i) => `  RAFFLES: line${i + 1}`).join("\n");
    return `${DEFS}\n${settings("  advance = auto\n  pause = 0s\n  clear = run\n  carry = 1")}\nscene start\n  [[open phone]]\n${lines}\nend\n`;
  })();

  test("the line after the hundredth starts a fresh page with the hundredth carried", async () => {
    const h = await play(LONG);
    expect(entries(h)).toHaveLength(100);
    await tickUntil(h, "line100", 200000, 200);
    expect(entries(h)).toHaveLength(100);
    await click(h);
    expect(shown(h)).toBe("line101");
    expect(entries(h)).toEqual(["line100", "line101"]);
    expect(carried(h)).toEqual(["line100"]);
  });

  test("the preview on the line after the hundredth shows the carried line and that line", async () => {
    const line = LONG.split("\n").findIndex((text) => text.includes("RAFFLES: line101"));
    const h = createHarness(LONG, line, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(entries(h)).toEqual(["line100", "line101"]);
    expect(carried(h)).toEqual(["line100"]);
  });
});

describe("a checkpoint and the preview inside the second run (I-2745)", () => {
  const SOURCE = thread(settings(`${AUTO}\n  clear = run\n  carry = 1`));

  test("a save taken in the second run loads with the carried entry and that run's lines", async () => {
    const h = await play(SOURCE);
    await tickUntil(h, "two");
    await click(h);
    await tickUntil(h, "four");
    const saved = h.game.saveHere();
    expect(saved).not.toBeNull();

    const loaded = createHarness(SOURCE, 0, { autoOpenAll: false });
    await loaded.ready;
    loaded.game.context.system.previewing = undefined;
    expect(loaded.game.loadToResume(saved!.data)).toBe(true);
    loaded.game.start();
    await flushMicrotasks(10);
    expect(shown(loaded)).toBe("four");
    expect(entries(loaded)).toEqual(["two", "three", "four"]);
    expect(carried(loaded)).toEqual(["two"]);
  });

  test("a step back into the second run shows the carried entry and that run's lines", async () => {
    const h = await play(SOURCE);
    await tickUntil(h, "two");
    await click(h);
    await tickUntil(h, "four");
    await click(h);
    const back = await h.game.rollBack("beat");
    expect(back.moved).toBe(true);
    await flushMicrotasks(10);
    expect(shown(h)).toBe("four");
    expect(entries(h)).toEqual(["two", "three", "four"]);
    expect(carried(h)).toEqual(["two"]);
  });

  test("the preview on the second run's first line shows the carried entry and the run's lines", async () => {
    const line = SOURCE.split("\n").findIndex((text) => text.includes("BUNNY: three"));
    const h = createHarness(SOURCE, line, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(entries(h)).toEqual(["two", "three", "four"]);
    expect(carried(h)).toEqual(["two"]);
    expect(reserved(h)).toBe(1);
    expect(marked(h, "data-carried")).toEqual([true, false, false]);
  });
});
