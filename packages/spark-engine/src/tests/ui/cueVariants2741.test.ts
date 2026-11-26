import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flushMicrotasks, type UIHarness } from "./harness/uiTestHarness";

const CHARACTERS = `define raffles as character with
  name = "RAFFLES"
end

define bunny as character with
  name = "BUNNY"
end
`;

const LINES = `scene start
  RAFFLES [<]: Well-- I mean--
  BUNNY [right]: Seriously???
  BUNNY [shout]: I'm busy!
  RAFFLES [receive]: slight problem
  RAFFLES [left]: Again.
  RAFFLES: Plain.
  The door opens.
end
`;

const LAYOUT = `define ui as config with
  layouts_initial = { "main" }
end

layout main {
  box {
    character_name #variant=left #clear { text }
    character_name #variant=right #clear { text }
    dialogue #speaker=bunny #clear { text }
    action #clear { text }
  }
}
`;

const STYLES = `style character_name {
  @speaker(bunny) { text-color = sky_60 }
}

style dialogue {
  @variant(shout) { text-size = lg }
}
`;

const TYPEWRITER = `define receive as typewriter with
  letter_pause = 0
end
`;

function wire(messages: any[]): any[] {
  return messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );
}

const live = (game: any) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

async function displayLive(h: UIHarness, beat: any) {
  const coordinator = new Coordinator(h.game, beat);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(20);
    coordinator.onUpdate({ deltaMS: 100 } as Clock);
  }
  await flushMicrotasks(30);
}

async function start(source: string) {
  const h = createHarness(source, 0, { reactive: true, autoOpenAll: false, beforeConnect: live });
  await h.ready;
  await flushMicrotasks(10);
  h.jumpToFlow("start");
  return h;
}

const lineMarks = (h: UIHarness): Record<string, string> | undefined =>
  wire(h.messages)
    .filter((m: any) => m?.method === "ui/showing" && m.params?.line)
    .at(-1)?.params.line;

const elementId = (h: UIHarness, name: string, attribute: string, value: string): string => {
  const created = wire(h.messages).find(
    (m: any) =>
      m?.method === "ui/create" &&
      m.params?.name === name &&
      m.params?.attributes?.[attribute] === value,
  );
  expect(created, `${name} ${attribute}=${value}`).toBeDefined();
  return created.params.element;
};

const writtenTo = (h: UIHarness, target: string, id: string): string[] =>
  wire(h.messages)
    .filter(
      (m: any) =>
        m?.method === "ui/write-text" &&
        m.params?.target === target &&
        (!m.params.elements || m.params.elements.includes(id)),
    )
    .map((m: any) => (m.params.instructions ?? []).map((i: any) => i.text ?? "").join(""))
    .filter(Boolean);

describe("a cue's brackets hold the line's variant (#2741)", () => {
  test("[left], [<] and [shout] read as left, left and shout, and a cue with no brackets has none", async () => {
    const h = await start(`${CHARACTERS}\n${LINES}`);
    const variants: (string | undefined)[] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      variants.push(beat.variant);
    }
    expect(variants).toEqual(["left", "right", "shout", "receive", "left", undefined, undefined]);
  });

  test("a variant named after an Object member is that word", async () => {
    const h = await start(`${CHARACTERS}\nscene start\n  BUNNY [constructor]: Hm.\n  BUNNY [toString]: Hm.\nend\n`);
    expect([h.nextBeat()?.variant, h.nextBeat()?.variant]).toEqual(["constructor", "toString"]);
  });
});

describe("a character defined with an Object member's name speaks (#2741)", () => {
  test.each(["constructor", "toString"])("a line spoken by a character defined as %s is read", async (name) => {
    const h = await start(`define ${name} as character with
  name = "BUNNY"
end

scene start
  BUNNY: Hello.
end
`);
    const beat = h.nextBeat();
    expect(beat?.speaker?.character).toBe(name);
    expect((beat?.text?.["dialogue"] ?? []).map((e: any) => e.text).join("")).toBe("Hello.");
    const sounds = JSON.stringify(beat?.audio ?? {});
    expect(sounds).toContain('"character~');
    expect(sounds).not.toContain(`"${name}~`);
  });

  test.each(["constructor", "toString"])("a synth defined as %s voices the character of that name", async (name) => {
    const h = await start(`define ${name} as character with
  name = "BUNNY"
end

define ${name} as synth with
end

scene start
  BUNNY: Hello.
end
`);
    const sounds = JSON.stringify(h.nextBeat()?.audio ?? {});
    expect(sounds).toContain(`"${name}~`);
    expect(sounds).not.toContain('"character~');
  });

  test.each(["constructor", "toString", "__proto__"])("a [%s] line with no typewriter of that name types as dialogue", async (name) => {
    const h = await start(`${CHARACTERS}\nscene start\n  BUNNY [${name}]: Seriously now.\n  BUNNY: Seriously now.\nend\n`);
    const labelled = h.nextBeat();
    const plain = h.nextBeat();
    const timing = (beat: any) => (beat?.text?.["dialogue"] ?? []).map((e: any) => e.after ?? 0);
    expect(labelled?.variant).toBe(name);
    expect(timing(labelled)).toEqual(timing(plain));
    expect(timing(plain).at(-1)).toBeGreaterThan(0);
  });

  test.each(["constructor", "toString", "__proto__"])("merging beats keeps a %s target in every list", async (name) => {
    const h = await start(`${CHARACTERS}\nscene start\n  BUNNY: Hi.\nend\n`);
    const interpreter: any = (h.game.module as any).interpreter;
    const entry = (text: string) => ({ [name]: [{ control: "show", text }] });
    const a: any = { end: 0 };
    interpreter.merge(a, { text: entry("1"), image: entry("1"), audio: entry("1"), layout: entry("1"), end: 0 });
    interpreter.merge(a, { text: entry("2"), image: entry("2"), audio: entry("2"), layout: entry("2"), end: 0 });
    for (const kind of ["text", "image", "audio", "layout"]) {
      expect(Object.hasOwn(a[kind], name)).toBe(true);
      expect(a[kind][name].map((e: any) => e.text)).toEqual(["1", "2"]);
    }
  });
});

describe("a line written to a target named after an Object member is written (#2741)", () => {
  test.each(["constructor", "toString", "__proto__"])("@%s: is read and shown", async (name) => {
    const h = await start(`${CHARACTERS}
define ui as config with
  layouts_initial = { "main" }
end

layout main {
  box {
    note #clear.${name} #speaker=bunny { text }
  }
}

scene start
  @${name}: Hello.
  BUNNY: Bye.
end
`);
    const first = h.nextBeat();
    expect(Object.hasOwn(first?.text ?? {}, name)).toBe(true);
    expect((first?.text?.[name] ?? []).map((e: any) => e.text).join("")).toContain("Hello.");
    const ui: any = h.game.module.ui;
    ui.line({ text: { [name]: [{ text: "Hi." }] }, speaker: { name: "BUNNY", character: "bunny" } });
    await ui.text.change("line write", name, [{ text: "Hi." }], true);
    expect(Object.hasOwn(ui._state.text, name)).toBe(true);
    expect(Object.hasOwn(ui._state.lineText, name)).toBe(true);
    expect(ui._state.lineText[name]).toEqual([{ speaker: "bunny", text: [{ text: "Hi." }] }]);
    h.messages.length = 0;
    await ui.text.restore(name);
    await flushMicrotasks(10);
    expect(
      wire(h.messages)
        .filter((m: any) => m?.method === "ui/write-text" && m.params?.target === name)
        .map((m: any) => m.params.instructions.map((i: any) => i.text).join("")),
    ).toEqual(["Hi."]);
  });
});

describe("#variant and #speaker on a text element limit the lines it takes (#2741)", () => {
  test("character_name #variant=left takes only left lines' names, and #speaker=bunny only Bunny's lines", async () => {
    const h = await start(`${CHARACTERS}\n${LAYOUT}\n${LINES}`);
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      await displayLive(h, beat);
    }
    const left = elementId(h, "character_name", "data-variant", "left");
    const right = elementId(h, "character_name", "data-variant", "right");
    const bunny = elementId(h, "dialogue", "data-speaker", "bunny");
    expect(writtenTo(h, "character_name", left)).toEqual(["RAFFLES", "RAFFLES"]);
    expect(writtenTo(h, "character_name", right)).toEqual(["BUNNY"]);
    expect(writtenTo(h, "dialogue", bunny)).toEqual(["Seriously???", "I'm busy!"]);
  });

  test("a restored right name goes back to the right element alone", async () => {
    const h = await start(`${CHARACTERS}\n${LAYOUT}\n${LINES}`);
    await displayLive(h, h.nextBeat());
    await displayLive(h, h.nextBeat());
    const ui: any = h.game.module.ui;
    expect(ui._state.lineText.character_name).toEqual([
      { variant: "right", speaker: "bunny", text: [{ text: "BUNNY" }] },
    ]);
    const left = elementId(h, "character_name", "data-variant", "left");
    const right = elementId(h, "character_name", "data-variant", "right");
    h.messages.length = 0;
    await ui.text.restore("character_name");
    await flushMicrotasks(10);
    expect(writtenTo(h, "character_name", left)).toEqual([]);
    expect(writtenTo(h, "character_name", right)).toEqual(["BUNNY"]);
  });
});

describe("a bound #variant or #speaker limits the element by its current value (#2741)", () => {
  test.each(["variant", "speaker"] as const)("#%s={selected} follows selected", async (prop) => {
    const h = createHarness(
      `${CHARACTERS}
store selected = "raffles"

define ui as config with
  layouts_initial = { "main" }
end

layout main {
  dialogue #${prop}={selected} #clear { text }
}

scene start
  RAFFLES [raffles]: First.
  BUNNY [bunny]: Second.
end
`,
      0,
      { reactive: true, autoOpenAll: false, beforeConnect: live },
    );
    await h.ready;
    await flushMicrotasks(10);
    h.jumpToFlow("start");
    const ui: any = h.game.module.ui;
    const first = h.nextBeat();
    const second = h.nextBeat();
    await displayLive(h, first);
    const element = elementId(h, "dialogue", `data-${prop}`, "raffles");
    (h.game.story as any).variablesState.$("selected", "bunny");
    ui.refreshLayouts();
    await flushMicrotasks(10);
    await displayLive(h, second);
    expect(writtenTo(h, "dialogue", element)).toEqual(["First.", "Second."]);
  });
});

describe("@variant and @speaker test the newest line, anywhere in the game (#2741)", () => {
  test("each line marks its variant and speaker, and the next line that has neither clears them", async () => {
    const h = await start(`${CHARACTERS}\n${LAYOUT}\n${STYLES}\n${LINES}`);
    const marks: (Record<string, string> | undefined)[] = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      await displayLive(h, beat);
      marks.push(lineMarks(h));
    }
    expect(marks).toEqual([
      { variant: "left", speaker: "raffles" },
      { variant: "right", speaker: "bunny" },
      { variant: "shout", speaker: "bunny" },
      { variant: "receive", speaker: "raffles" },
      { variant: "left", speaker: "raffles" },
      { speaker: "raffles" },
      {},
    ]);
  });

  test("a game whose styles never test @variant or @speaker sends no line mark", async () => {
    const h = await start(`${CHARACTERS}\n${LAYOUT}\n${LINES}`);
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      await displayLive(h, beat);
    }
    expect(lineMarks(h)).toBeUndefined();
  });
});

describe("a typewriter named after a variant types that variant's lines (#2741)", () => {
  const typed = (beat: any, target: string) =>
    (beat?.text?.[target] ?? []).filter((e: any) => e.text?.trim()).map((e: any) => e.after ?? 0);

  test("a [receive] line types with the receive typewriter and an unlabelled line with the dialogue one", async () => {
    const h = await start(`${CHARACTERS}\n${TYPEWRITER}\n${LINES}`);
    const beats = [];
    for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
      beats.push(beat);
    }
    const received = typed(beats[3], "dialogue");
    const plain = typed(beats[5], "dialogue");
    expect(received.length).toBeGreaterThan(1);
    expect(new Set(received)).toEqual(new Set([0]));
    expect(plain.length).toBeGreaterThan(1);
    expect(plain.at(-1)).toBeGreaterThan(0);
    expect(typed(beats[3], "character_name")).toEqual(typed(beats[5], "character_name"));
  });
});
