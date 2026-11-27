import { describe, expect, test } from "vitest";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
import { compileUI, createHarness, flattenMessages, flushMicrotasks } from "./harness/uiTestHarness";

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
layout textbox {
  textbox {
    title #clear { text }
    action #clear { text }
  }
}

layout banner {
  banner { title { text } }
}

scene start
  ^: Chapter One

  First line.
end
`;

  test("the banner: an unmarked title beside the textbox's #clear title keeps its text through the next line", async () => {
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
layout textbox {
  textbox {
    title #clear { text }
    action #clear { text }
  }
}

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

describe("each #clear declaration is its own element (I-2732)", () => {
  const SCENE = `
scene start
  ^: Chapter One

  First line.
end
`;

  test.each([
    ["the marked one first", "title #clear { text }\n    title { text }", 0],
    ["the unmarked one first", "title { text }\n    title #clear { text }", 1],
  ])("two sibling titles, %s: only the marked one empties at the next line", async (_, children, markedAt) => {
    const { h, ui, beats } = await play(`
layout textbox {
  textbox {
    action #clear { text }
    ${children}
  }
}
${SCENE}`);
    const ids: string[] = ui.findIds("title");
    expect(ids).toHaveLength(2);
    const marked = ids[markedAt]!;
    const kept = ids[1 - markedAt]!;
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title");
    expect(atNextLine).toContain(marked);
    expect(atNextLine).not.toContain(kept);
    const onto = await restored(h, ui, "ui/write-text", "title");
    expect(onto).toContain(kept);
    expect(onto).not.toContain(marked);
  });

  test.each([
    ["the marked one first", "portrait #clear { image }\n    portrait { image }", 0],
    ["the unmarked one first", "portrait { image }\n    portrait #clear { image }", 1],
  ])("two sibling portraits, %s: only the marked one empties at the next line", async (_, children, markedAt) => {
    const { h, ui, beats } = await play(`
layout main {
  stage {
    ${children}
  }
}

scene start
  [[show portrait SKY]]
  A sky.

  First line.
end
`);
    const ids: string[] = ui.findIds("portrait");
    expect(ids).toHaveLength(2);
    const marked = ids[markedAt]!;
    const kept = ids[1 - markedAt]!;
    const atNextLine = emptied(ui, h.messages.slice(beats[1]), "ui/write-image", "portrait");
    expect(atNextLine).toContain(marked);
    expect(atNextLine).not.toContain(kept);
  });

  test("a #clear title written in a layout's call to a component empties at the next line", async () => {
    const { h, ui, beats } = await play(`
component banner {
  frame { slot }
}

layout textbox {
  textbox {
    action #clear { text }
    banner() { title #clear { text } }
  }
}
${SCENE}`);
    const ids: string[] = ui.findIds("title");
    expect(ids).toHaveLength(1);
    expect(emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title")).toContain(ids[0]);
  });

  test.each([
    ["text", "title", "text", "^: Chapter One", "ui/write-text"],
    ["picture", "portrait", "image", "[[show portrait SKY]]\n  A sky.", "ui/write-image"],
  ])("a component's unmarked %s beside a #clear element of its name keeps its content through the next line and a reconnect", async (_, tag, leaf, line, method) => {
    const { h, ui } = await play(`
component banner {
  frame { ${tag} { ${leaf} } }
}

layout textbox {
  textbox {
    ${tag} #clear { ${leaf} }
    action #clear { text }
    banner()
    banner()
  }
}

scene start
  ${line}

  First line.
end
`);
    const copies = () => (ui.textElements(tag) as any[]).filter((el) => ui.elementPath(el)?.includes(">banner/")).map((el) => el.id);
    expect(copies()).toHaveLength(2);
    const from = h.messages.length;
    await h.reconnect();
    await flushMicrotasks(30);
    const all: string[] = ui.findIds(tag);
    const onto = writes(h.messages.slice(from), method, tag)
      .filter((m: any) => !isClear(m))
      .flatMap((m: any) => m.params.elements ?? all);
    expect(copies()).toHaveLength(2);
    for (const id of copies()) {
      expect(onto).toContain(id);
    }
  });

  test("a #clear on an input widget empties its text at the next line", async () => {
    const { h, ui, beats } = await play(`
layout textbox {
  textbox {
    checkbox.title #clear "Heading"
    action #clear { text }
  }
}
${SCENE}`);
    const marked = (ui.textElements("title") as any[]).find((el) => el.name === "checkbox title");
    expect(marked).toBeDefined();
    const atNextLine = ["title", "checkbox title"].flatMap((target) =>
      emptied(ui, h.messages.slice(beats[1]), "ui/write-text", target),
    );
    expect(atNextLine).toContain(marked.id);
  });

  test("every copy of a #clear element in a loop empties at the next line", async () => {
    const { h, ui, beats } = await play(`
store items = {1, 2}

layout textbox {
  textbox {
    action #clear { text }
    for n in items do
      title #clear { text }
    end
  }
}
${SCENE}`);
    const ids: string[] = ui.findIds("title");
    expect(ids).toHaveLength(2);
    expect(new Set(emptied(ui, h.messages.slice(beats[1]), "ui/write-text", "title"))).toEqual(new Set(ids));
  });

  test("an edited program's #clear marks replace the first program's", async () => {
    const layout = (mark: string) => `
layout textbox {
  textbox {
    action #clear { text }
    title${mark} { text }
  }
}
${SCENE}`;
    const h = createHarness(PREFIX + layout(""));
    await h.ready;
    const ui: any = h.game.module.ui;
    const ownMarks = () => ui.markedPaths("title").filter((path: string) => path.startsWith("layout:textbox@"));
    expect(ownMarks()).toEqual([]);
    const { program, errors } = compileUI(PREFIX + layout(" #clear"));
    expect(errors).toEqual([]);
    h.game.updateProgram(program as never);
    expect(ownMarks()).toHaveLength(1);
  });
});
