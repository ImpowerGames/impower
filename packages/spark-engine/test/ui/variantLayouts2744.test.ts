import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { EventMessage } from "../../src/game/core/classes/messages/EventMessage";
import type { Instructions } from "../../src/game/core/types/Instructions";
import type { StreamEntry } from "../../src/game/modules/ui/types/StreamState";
import { createHarness, flushMicrotasks, MAIN_URI } from "./harness/uiTestHarness";

const DEFS = `define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end
`;

const EXCHANGE = `${DEFS}
style dialogue {
  @variant(shout) { text-size = 32px }
}

scene start
  RAFFLES [left]: one
  BUNNY [right]: two
  RAFFLES [left]: three
  BUNNY [right]: four
  RAFFLES: plain
  BUNNY [shout]: loud
end
`;

const PHONE = `${DEFS}
layout phone {
  thread {
    stream {
      dialogue.bubble.incoming #variant=receive { text }
      dialogue.bubble.outgoing #variant=send { text }
    }
  }
}

scene start
  RAFFLES [receive]: slight problem
  BUNNY [send]: Anything you can do about it? >
  Bunny looks up from the screen.
  RAFFLES [receive]: maybe
end
`;

type Harness = ReturnType<typeof createHarness>;

const ui = (h: Harness): any => h.game.module.ui;

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const lineText = (beat: Instructions | undefined): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !["character_name", "character_parenthetical"].includes(target))
    .flatMap(([, events]) => events.map((event) => event.text))
    .join("");

const shown = (h: Harness): string => lineText(coordinator(h)?._instructions);

const mounted = (h: Harness): string[] =>
  [...ui(h)._mountedLayouts.keys()].filter(
    (name: string) => !["main", "loading", "ending"].includes(name),
  );

const said = (entry: StreamEntry): string =>
  Object.entries(entry.text)
    .filter(([target]) => !["character_name", "character_parenthetical"].includes(target))
    .flatMap(([, events]) => events)
    .map((event) => event.text)
    .join("");

const entries = (h: Harness, layout: string): string[] =>
  (h.game.module.ui.streams.entries(layout) as StreamEntry[]).map(said);

function wire(messages: any[]): any[] {
  return messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );
}

const created = (h: Harness, name: string): any[] =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/create" && m.params?.name === name)
    .map((m: any) => m.params);

const writtenTo = (h: Harness, target: string, id: string): string[] =>
  wire(h.messages)
    .filter(
      (m: any) =>
        m?.method === "ui/write-text" &&
        m.params?.target === target &&
        (!m.params.elements || m.params.elements.includes(id)),
    )
    .map((m: any) => (m.params.instructions ?? []).map((i: any) => i.text ?? "").join(""))
    .filter((text, index, all) => text !== "" || all.slice(0, index).some(Boolean));

const nameElement = (h: Harness, variant: string): string => {
  const element = created(h, "character_name simultaneous_name")
    .filter((params) => params.attributes?.["data-variant"] === variant)
    .at(-1);
  expect(element, `character_name #variant=${variant}`).toBeDefined();
  return element.element;
};

const lineMarks = (h: Harness): Record<string, string> | undefined =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/showing" && m.params?.line)
    .at(-1)?.params.line;

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
  await settle(h);
  return h;
}

async function settle(h: Harness) {
  for (let i = 0; i < 5; i += 1) {
    await flushMicrotasks(10);
    await tick(h, 0);
  }
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
  for (let i = 0; i < 10 && !shown(h); i += 1) {
    await tick(h, 0);
  }
  await settle(h);
}

async function tickUntil(h: Harness, line: string, limit = 20000, step = 50) {
  for (let elapsed = 0; elapsed < limit && shown(h) !== line; elapsed += step) {
    await tick(h, step);
  }
  expect(shown(h)).toBe(line);
}

describe("a labelled line opens the layout that holds its variant (I-2744)", () => {
  test("a [left] line opens simultaneous, an unlabelled line closes it, and a [shout] line stays in dialogue with @variant(shout) set", async () => {
    const h = await play(EXCHANGE);
    expect(shown(h)).toBe("one");
    expect(mounted(h)).toEqual(["simultaneous"]);
    expect(entries(h, "simultaneous")).toEqual(["one", "two", "three", "four"]);
    await tickUntil(h, "four");
    expect(mounted(h)).toEqual(["simultaneous"]);
    await click(h);
    expect(shown(h)).toBe("plain");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(entries(h, "simultaneous")).toEqual([]);
    await click(h);
    expect(shown(h)).toBe("loud");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(lineMarks(h)).toEqual({ variant: "shout" });
  });

  test("an action line between two pairs ends the first exchange, and the second pair starts with none of its entries", async () => {
    const h = await play(`${DEFS}
scene start
  RAFFLES [left]: a1
  BUNNY [right]: b1
  The door opens.
  RAFFLES [left]: a2
  BUNNY [right]: b2
end
`);
    expect(entries(h, "simultaneous")).toEqual(["a1", "b1"]);
    await tickUntil(h, "b1");
    await click(h);
    expect(shown(h)).toBe("The door opens.");
    expect(mounted(h)).toEqual(["action"]);
    await click(h);
    expect(shown(h)).toBe("a2");
    expect(mounted(h)).toEqual(["simultaneous"]);
    expect(entries(h, "simultaneous")).toEqual(["a2", "b2"]);
  });

  test("a labelled line goes to a layout the author opened that holds its kind, and simultaneous does not open", async () => {
    const h = await play(`${DEFS}
layout talk {
  panel {
    character_name #clear { text }
    dialogue #clear { text }
  }
}

scene start
  [[open talk]]
  RAFFLES [left]: hi
  BUNNY [right]: hello
end
`);
    expect(shown(h)).toBe("hi");
    expect(mounted(h)).toEqual(["talk"]);
    await click(h);
    expect(shown(h)).toBe("hello");
    expect(mounted(h)).toEqual(["talk"]);
  });

  test("the phone opens by itself at its first labelled line and closes at the action line", async () => {
    const h = await play(PHONE);
    expect(shown(h)).toBe("slight problem");
    expect(mounted(h)).toEqual(["phone"]);
    expect(entries(h, "phone")).toEqual(["slight problem", "Anything you can do about it?"]);
    await click(h);
    expect(shown(h)).toBe("Anything you can do about it?");
    await click(h);
    expect(shown(h)).toBe("Bunny looks up from the screen.");
    expect(mounted(h)).toEqual(["action"]);
    await click(h);
    expect(shown(h)).toBe("maybe");
    expect(mounted(h)).toEqual(["phone"]);
    expect(entries(h, "phone")).toEqual(["maybe"]);
  });

  test("after [[open phone]] the phone stays open through the action line and takes the labelled lines", async () => {
    const h = await play(PHONE.replace("scene start\n", "scene start\n  [[open phone]]\n"));
    expect(mounted(h)).toEqual(["phone"]);
    await click(h);
    await click(h);
    expect(shown(h)).toBe("Bunny looks up from the screen.");
    expect(mounted(h)).toContain("phone");
    await click(h);
    expect(shown(h)).toBe("maybe");
    expect(mounted(h)).toEqual(["phone"]);
    expect(entries(h, "phone")).toEqual([
      "slight problem",
      "Anything you can do about it?",
      "maybe",
    ]);
  });
});

describe("a variant element in a screen's body or a component picks its layout (I-2744)", () => {
  test("a [receive] line opens the layout whose screen holds a receive dialogue element", async () => {
    const h = await play(`${DEFS}
screen inbox {
  dialogue #variant=receive { text }
  slot
}

layout phone in inbox {
  decoration
}

scene start
  BUNNY [receive]: hello
end
`);
    expect(shown(h)).toBe("hello");
    expect(mounted(h)).toEqual(["phone"]);
    const receive = created(h, "dialogue").find(
      (params) => params.attributes?.["data-variant"] === "receive",
    );
    expect(receive).toBeDefined();
    expect(writtenTo(h, "dialogue", receive.element)).toEqual(["hello"]);
  });

  test("a stream in a screen's body does not pick a layout, so the line shows in the dialogue box", async () => {
    const h = await play(`${DEFS}
screen inbox {
  stream { dialogue.bubble #variant=receive { text } }
  slot
}

layout phone in inbox {
  decoration
}

scene start
  BUNNY [receive]: hello
end
`);
    expect(shown(h)).toBe("hello");
    expect(mounted(h)).toEqual(["dialogue"]);
  });

  test("a [receive] line opens the layout that uses a component holding a receive dialogue element", async () => {
    const h = await play(`${DEFS}
component incoming {
  dialogue #variant=receive { text }
}

layout phone {
  incoming
}

scene start
  BUNNY [receive]: hello
end
`);
    expect(shown(h)).toBe("hello");
    expect(mounted(h)).toEqual(["phone"]);
  });
});

describe("a stream entry rebuilt from saved state (I-2744)", () => {
  test("keeps a visibility its saved styles give it", async () => {
    const h = createHarness(
      `layout phone {
  stream { dialogue.bubble { text } }
}

scene start
  A bell rings.
end
`,
      0,
      {
        reactive: true,
        autoOpenAll: false,
        beforeConnect(game) {
          game.context.system.previewing = undefined;
        },
      },
    );
    await h.ready;
    const ui: any = h.game.module.ui;
    new Coordinator(
      h.game,
      {
        end: 0,
        text: { dialogue: [{ text: "hello" }] },
        layout: { phone: [{ control: "open", name: "phone" }] },
      } as never,
      { settled: "presented" } as never,
    );
    await flushMicrotasks(40);
    expect(ui.streams.entries("phone")).toHaveLength(1);
    await ui.style.updateWaiting("dialogue", { visibility: "hidden" });
    expect(ui._state.streams["phone/0"].styles[0].dialogue.visibility).toBe("hidden");
    const mount = ui.streams._mounted.get("phone/0")[0];
    ui._state = JSON.parse(JSON.stringify(ui._state));
    mount.rendered[0] = "rebuilt";
    h.messages.length = 0;
    ui.streams.show(true);
    await flushMicrotasks(40);
    const roots = ui.collectNodes(mount.entries[0].group).map((el: any) => el.id);
    const visibility = wire(h.messages)
      .filter(
        (m: any) =>
          m?.method === "ui/update" &&
          roots.includes(m.params?.element) &&
          m.params?.style &&
          "visibility" in m.params.style,
      )
      .map((m: any) => m.params.style.visibility);
    expect(visibility.at(-1)).toBe("hidden");
  });
});

describe("a stream makes each entry from the template for its line's variant (I-2744)", () => {
  const LOG = `${DEFS}
layout log {
  stream {
    dialogue.mine #variant=left { text }
    dialogue.any { text }
  }
}

scene start
  [[open log]]
  RAFFLES [left]: a
  BUNNY [right]: b
  RAFFLES: c
end
`;

  test("a [left] line uses the left template, and a [right] or unlabelled line the template with no #variant", async () => {
    const h = await play(LOG);
    await click(h);
    await click(h);
    expect(shown(h)).toBe("c");
    const stream = ui(h)._state.streams["log/0"];
    expect(stream.entries.map((entry: StreamEntry) => [entry.template, said(entry)])).toEqual([
      [0, "a"],
      [1, "b"],
      [1, "c"],
    ]);
  });

  test("every entry carries #variant and #speaker for its own line, whichever template made it", async () => {
    const h = await play(LOG);
    await click(h);
    await click(h);
    const labels = (name: string) =>
      created(h, name).map((params) => ({
        variant: params.attributes?.["data-variant"] ?? null,
        speaker: params.attributes?.["data-speaker"] ?? null,
      }));
    expect(labels("dialogue mine")).toEqual([{ variant: "left", speaker: "raffles" }]);
    expect(labels("dialogue any")).toEqual([
      { variant: "right", speaker: "bunny" },
      { variant: null, speaker: "raffles" },
    ]);
  });

  test("a line whose variant has no limited template and no open template adds no entry", async () => {
    const h = await play(PHONE.replace("scene start\n", "scene start\n  [[open phone]]\n").replace(
      "RAFFLES [receive]: maybe",
      "RAFFLES [shout]: maybe",
    ));
    await click(h);
    await click(h);
    await click(h);
    expect(shown(h)).toBe("maybe");
    expect(entries(h, "phone")).toEqual(["slight problem", "Anything you can do about it?"]);
  });
});

describe("the built-in exchange shows each name on its own side (I-2744)", () => {
  test("the right name is absent until the right side's first line starts, and both stay until the exchange closes", async () => {
    const h = await play(`${DEFS}
scene start
  RAFFLES [left]: a1
  BUNNY [right]: b1
  RAFFLES [left]: a2
  The door opens.
  RAFFLES [left]: a3
  BUNNY [right]: b3
end
`);
    expect(shown(h)).toBe("a1");
    const left = nameElement(h, "left");
    const right = nameElement(h, "right");
    expect(writtenTo(h, "character_name", left)).toEqual(["RAFFLES"]);
    expect(writtenTo(h, "character_name", right)).toEqual([]);
    await tickUntil(h, "b1");
    await typed(h);
    expect(writtenTo(h, "character_name", right)).toEqual(["BUNNY"]);
    expect(writtenTo(h, "character_name", left)).toEqual(["RAFFLES"]);
    await tickUntil(h, "a2");
    await typed(h);
    expect(writtenTo(h, "character_name", left)).toEqual(["RAFFLES", "", "RAFFLES"]);
    expect(writtenTo(h, "character_name", right)).toEqual(["BUNNY"]);
    expect(ui(h)._state.lineText?.character_name?.map((line: any) => line.variant)).toEqual([
      "right",
      "left",
    ]);
    await click(h);
    expect(shown(h)).toBe("The door opens.");
    expect(mounted(h)).toEqual(["action"]);
    await click(h);
    expect(shown(h)).toBe("a3");
    const right3 = nameElement(h, "right");
    expect(right3).not.toBe(right);
    expect(writtenTo(h, "character_name", right3)).toEqual([]);
    await tickUntil(h, "b3");
    await typed(h);
    expect(writtenTo(h, "character_name", right3)).toEqual(["BUNNY"]);
  });
});

describe("the preview of a line inside an exchange (I-2744)", () => {
  test.each([
    ["the body", "    First right line."],
    ["the cue", "  BUNNY [right]:"],
  ])("at %s of a cue written over two lines shows that line's entry", async (_, picked) => {
    const source = `${DEFS}
scene start
  RAFFLES [left]:
    First left line.
  BUNNY [right]:
    First right line.
  A bell rings.
end
`;
    const line = source.split("\n").indexOf(picked);
    const h = createHarness(source, line, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(mounted(h)).toEqual(["simultaneous"]);
    expect(entries(h, "simultaneous")).toEqual(["First left line.", "First right line."]);
    const views = (h.game.module.ui.streams as any)._mounted.get("simultaneous/0")[0].entries;
    expect(views.map((view: any) => Boolean(view.reserved))).toEqual([false, false]);
  });

  test("played once on the second line after a still of the first, shows the second line's entry", async () => {
    const source = `${DEFS}
scene start
  RAFFLES [left]:
    First left line.
  BUNNY [right]:
    First right line.
  A bell rings.
end
`;
    const lines = source.split("\n");
    const first = lines.indexOf("    First left line.");
    const second = lines.indexOf("    First right line.");
    const h = createHarness(source, first);
    await h.ready;
    await h.preview(first);
    await flushMicrotasks(10);
    await h.game.preview(MAIN_URI, second, undefined, undefined, { playId: 1 });
    await flushMicrotasks(10);
    for (let elapsed = 0; elapsed < 6000 && h.game.playingBeat; elapsed += 50) {
      h.game.update({ deltaMS: 50 } as never);
      await flushMicrotasks(5);
    }
    expect(h.game.playingBeat).toBe(false);
    const views = (h.game.module.ui.streams as any)._mounted.get("simultaneous/0")[0].entries;
    expect(views.map((view: any) => Boolean(view.reserved))).toEqual([false, false]);
    const roots = views[1].group.map((member: any) => member.el.id);
    const visibility = wire(h.messages)
      .filter(
        (m: any) =>
          m?.method === "ui/update" &&
          roots.includes(m.params?.element) &&
          m.params?.style &&
          "visibility" in m.params.style,
      )
      .map((m: any) => m.params.style.visibility);
    expect(visibility.at(-1)).toBeNull();
  });

  test("moved from the first line to the second shows the second line's entry", async () => {
    const source = `${DEFS}
scene start
  RAFFLES [left]:
    First left line.
  BUNNY [right]:
    First right line.
  A bell rings.
end
`;
    const lines = source.split("\n");
    const first = lines.indexOf("    First left line.");
    const second = lines.indexOf("    First right line.");
    const h = createHarness(source, first, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line: first });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(first);
    await flushMicrotasks(30);
    const views = () => (h.game.module.ui.streams as any)._mounted.get("simultaneous/0")[0].entries;
    expect(views().map((view: any) => Boolean(view.reserved))).toEqual([false, true]);
    await h.preview(second);
    await flushMicrotasks(30);
    expect(entries(h, "simultaneous")).toEqual(["First left line.", "First right line."]);
    expect(views().map((view: any) => Boolean(view.reserved))).toEqual([false, false]);
    const roots = views()[1].group.map((member: any) => member.el.id);
    const hidden = wire(h.messages)
      .filter(
        (m: any) =>
          m?.method === "ui/update" &&
          roots.includes(m.params?.element) &&
          m.params?.style &&
          "visibility" in m.params.style,
      )
      .map((m: any) => m.params.style.visibility);
    expect(hidden.at(-1)).toBeNull();
  });

  test("at the first line of a second exchange shows no name left over from the first", async () => {
    const source = `${DEFS}
scene start
  RAFFLES [left]: a1
  BUNNY [right]: b1
  The door opens.
  RAFFLES [left]: a2
  BUNNY [right]: b2
end
`;
    const line = source.split("\n").findIndex((text) => text.includes("a2"));
    const h = createHarness(source, line, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(mounted(h)).toEqual(["simultaneous"]);
    expect(writtenTo(h, "character_name", nameElement(h, "left"))).toContain("RAFFLES");
    expect(writtenTo(h, "character_name", nameElement(h, "right"))).toEqual([]);
    expect(ui(h)._state.lineText?.character_name?.map((saved: any) => saved.variant)).toEqual([
      "left",
    ]);
  });

  test("shows the entries up to the cursor's line, with room for the whole exchange", async () => {
    const source = `${DEFS}
scene start
  RAFFLES [left]: one
  BUNNY [right]: two
  RAFFLES [left]: three
  BUNNY [right]: four
  RAFFLES [left]: five
  BUNNY [right]: six
end
`;
    const line = source.split("\n").findIndex((text) => text.includes("four"));
    const h = createHarness(source, line, { reactive: true, autoOpenAll: false, connect: false });
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
    await h.reconnect();
    await flushMicrotasks(10);
    await h.preview(line);
    await flushMicrotasks(30);
    expect(mounted(h)).toEqual(["simultaneous"]);
    expect(entries(h, "simultaneous")).toEqual(["one", "two", "three", "four", "five", "six"]);
    const views = (h.game.module.ui.streams as any)._mounted.get("simultaneous/0")[0].entries;
    expect(views.map((view: any) => Boolean(view.reserved))).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });
});
