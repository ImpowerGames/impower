import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flattenMessages, flushMicrotasks } from "./harness/uiTestHarness";

const PREFIX = `define HERO as character with
  name = "HERO"
end

define SKY as image with
  src = "https://example.com/sky.png"
end
`;

async function play(source: string) {
  const h = createHarness(PREFIX + source);
  await h.ready;
  expect(h.errors).toEqual([]);
  const ui: any = h.game.module.ui;
  h.jumpToFlow("start");
  const beats: number[] = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    beats.push(h.messages.length);
    new Coordinator(h.game, beat);
    await flushMicrotasks(20);
  }
  return { h, ui, beats };
}

const writes = (messages: any[], method: string, target: string) =>
  flattenMessages(messages).filter((m: any) => m?.method === method && m.params?.target === target);

const isClear = (m: any) => (m.params?.instructions ?? []).length === 0;

function emptied(ui: any, messages: any[], method: string, target: string): string[] {
  const all: string[] = ui.findIds(target);
  return writes(messages, method, target)
    .filter(isClear)
    .flatMap((m: any) => m.params.elements ?? all);
}

async function restored(h: any, ui: any, method: string, target: string): Promise<string[]> {
  const from = h.messages.length;
  await ui.onRestore();
  await flushMicrotasks(20);
  const all: string[] = ui.findIds(target);
  return writes(h.messages.slice(from), method, target)
    .filter((m: any) => !isClear(m))
    .flatMap((m: any) => m.params.elements ?? all);
}

const idOf = (ui: any, target: string, within: (id: string) => boolean) => {
  const ids: string[] = ui.findIds(target).filter(within);
  expect(ids, target).toHaveLength(1);
  return ids[0]!;
};

const inBanner = (id: string) => id.includes("-banner-");
const outsideBanner = (id: string) => !id.includes("-banner-");

describe("#clear empties the element it is written on, not others of its name (I-2732)", () => {
  const BANNER = `
layout banner {
  banner { title { text } }
}

scene start
  ^: Chapter One

  First line.
end
`;

  test("the banner: an unmarked title beside the built-in textbox's #clear title keeps its text through the next line", async () => {
    const { h, ui, beats } = await play(BANNER);
    const marked = idOf(ui, "title", outsideBanner);
    const banner = idOf(ui, "title", inBanner);
    expect(marked).not.toBe(banner);
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title");
    expect(atNextLine).toContain(marked);
    expect(atNextLine).not.toContain(banner);
  });

  test("the banner: a restore after the next line puts the title back on the banner only", async () => {
    const { h, ui } = await play(BANNER);
    const marked = idOf(ui, "title", outsideBanner);
    const banner = idOf(ui, "title", inBanner);
    const onto = await restored(h, ui, "ui/write-text", "title");
    expect(onto).toContain(banner);
    expect(onto).not.toContain(marked);
  });

  const PICTURE = `
layout textbox {
  textbox { portrait #clear { image } }
}

layout banner {
  banner { portrait { image } }
}

scene start
  [[show portrait SKY]]
  A sky.

  First line.
end
`;

  test("a picture: an unmarked portrait beside a #clear portrait keeps its picture through the next line", async () => {
    const { h, ui, beats } = await play(PICTURE);
    expect(beats).toHaveLength(2);
    const marked = idOf(ui, "portrait", (id) => id.includes("-textbox-"));
    const banner = idOf(ui, "portrait", inBanner);
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-image", "portrait");
    expect(atNextLine).toContain(marked);
    expect(atNextLine).not.toContain(banner);
  });

  test("a picture: a restore after the next line puts the picture back on the unmarked portrait only", async () => {
    const { h, ui } = await play(PICTURE);
    const marked = idOf(ui, "portrait", (id) => id.includes("-textbox-"));
    const banner = idOf(ui, "portrait", inBanner);
    const onto = await restored(h, ui, "ui/write-image", "portrait");
    expect(onto).toContain(banner);
    expect(onto).not.toContain(marked);
  });

  test("two #clear elements of one name in two layouts both empty at the next line, and a restore puts back neither", async () => {
    const { h, ui, beats } = await play(`
layout banner {
  banner { title #clear { text } }
}

scene start
  ^: Chapter One

  First line.
end
`);
    const both: string[] = ui.findIds("title");
    expect(both).toHaveLength(2);
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title");
    for (const id of both) {
      expect(atNextLine).toContain(id);
    }
    expect(await restored(h, ui, "ui/write-text", "title")).toEqual([]);
  });

  const ONE_LAYOUT = `
layout textbox {
  textbox {
    title #clear { text }
    caption { title { text } }
    action #clear { text }
  }
}

scene start
  ^: Chapter One

  First line.
end
`;

  test("a #clear and an unmarked element of one name in one layout: only the marked one empties at the next line", async () => {
    const { h, ui, beats } = await play(ONE_LAYOUT);
    const marked = idOf(ui, "title", (id) => !id.includes("-caption-"));
    const kept = idOf(ui, "title", (id) => id.includes("-caption-"));
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title");
    expect(atNextLine).toContain(marked);
    expect(atNextLine).not.toContain(kept);
    const onto = await restored(h, ui, "ui/write-text", "title");
    expect(onto).toContain(kept);
    expect(onto).not.toContain(marked);
  });

  test("a write to a name still reaches every element of that name, marked or not", async () => {
    const { h, ui, beats } = await play(ONE_LAYOUT);
    const all: string[] = ui.findIds("title");
    expect(all).toHaveLength(2);
    const written = writes(h.messages.slice(beats[0], beats[1]), "ui/write-text", "title")
      .filter((m: any) => !isClear(m))
      .flatMap((m: any) => m.params.elements ?? all);
    expect([...new Set(written)].sort()).toEqual([...all].sort());
  });
});
