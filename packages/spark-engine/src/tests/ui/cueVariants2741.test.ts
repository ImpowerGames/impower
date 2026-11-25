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
    character_name #variant=left { text }
    character_name #variant=right { text }
    dialogue #speaker=bunny { text }
    action { text }
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

  test("a saved left name comes back to the left element alone when the layout is rebuilt", async () => {
    const h = await start(`${CHARACTERS}\n${LAYOUT.replaceAll(" { text }", "")}\n${LINES}`);
    await displayLive(h, h.nextBeat());
    await displayLive(h, h.nextBeat());
    const ui: any = h.game.module.ui;
    expect(ui._state.lineText.character_name).toEqual([
      { variant: "left", speaker: "raffles", text: [{ text: "RAFFLES" }] },
      { variant: "right", speaker: "bunny", text: [{ text: "BUNNY" }] },
    ]);
    const left = elementId(h, "character_name", "data-variant", "left");
    const right = elementId(h, "character_name", "data-variant", "right");
    h.messages.length = 0;
    await ui.text.restore("character_name");
    await flushMicrotasks(10);
    expect(writtenTo(h, "character_name", left)).toEqual(["RAFFLES"]);
    expect(writtenTo(h, "character_name", right)).toEqual(["BUNNY"]);
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
