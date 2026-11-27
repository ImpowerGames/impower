import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define MARA as character with
  name = "MARA"
end

define sky as image with
  src = "https://example.com/sky.png"
end
`;

type Harness = ReturnType<typeof createHarness>;

interface TreeElement {
  id: string;
  name: string;
  parent: TreeElement | null;
  children: TreeElement[];
}

const ui = (h: Harness): any => h.game.module.ui;

const findAll = (h: Harness, name: string): TreeElement[] => {
  const out: TreeElement[] = [];
  const walk = (el: TreeElement | undefined) => {
    if (!el) {
      return;
    }
    if (el.name.split(" ").includes(name)) {
      out.push(el);
    }
    el.children.forEach(walk);
  };
  walk(ui(h)._root);
  return out;
};

const ids = (h: Harness, name: string): string[] =>
  findAll(h, name).map((el) => el.id);

const mounted = (h: Harness): string[] =>
  [...ui(h)._mountedLayouts.keys()].filter(
    (name: string) => !["main", "loading", "ending"].includes(name),
  );

const shownText = (h: Harness, target: string): string =>
  (ui(h)._state.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

const beat = (h: Harness): any => (h.game as any)._coordinator?._instructions;

async function play(source: string, opts?: Parameters<typeof createHarness>[2]) {
  const h = createHarness(`${DEFS}\n${source}`, 0, {
    autoOpenAll: false,
    ...opts,
  });
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  await settle(h);
  return h;
}

async function settle(h: Harness) {
  for (let tick = 0; tick < 4; tick += 1) {
    await flushMicrotasks(10);
    (h.game as any)._coordinator?.onUpdate({ deltaMS: 1000 });
  }
  await flushMicrotasks(10);
}

async function click(h: Harness) {
  h.game.clickedToContinue();
  await settle(h);
}

describe("a layout opens for each kind of text as lines arrive (I-2740)", () => {
  test("a dialogue line opens dialogue, and an action line closes it, opens action and keeps the screen's elements", async () => {
    const h = await play(`scene start
  MARA: Hello.
  A plain action line.
end
`);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(shownText(h, "dialogue")).toBe("Hello.");
    const frame = {
      textbox: ids(h, "textbox"),
      background: ids(h, "textbox_background"),
      indicator: ids(h, "continue_indicator"),
    };
    expect(frame.textbox).toHaveLength(1);
    expect(frame.background).toHaveLength(1);
    expect(frame.indicator).toHaveLength(1);
    expect(findAll(h, "dialogue").length).toBeGreaterThan(0);

    await click(h);
    expect(beat(h).kind).toBe("action");
    expect(mounted(h)).toEqual(["action"]);
    expect(shownText(h, "action")).toBe("A plain action line.");
    expect(findAll(h, "character_name")).toEqual([]);
    expect({
      textbox: ids(h, "textbox"),
      background: ids(h, "textbox_background"),
      indicator: ids(h, "continue_indicator"),
    }).toEqual(frame);
  });

  test("a line goes to an open layout the author opened that holds its kind, and nothing opens beside it", async () => {
    const h = await play(`layout talk {
  panel {
    character_name #clear { text }
    dialogue #clear { text }
  }
}

scene start
  [[open talk]]
  MARA: Hello.
end
`);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["talk"]);
    expect(findAll(h, "textbox")).toEqual([]);
    expect(shownText(h, "dialogue")).toBe("Hello.");
    const dialogue = findAll(h, "dialogue");
    expect(dialogue).toHaveLength(1);
    expect(dialogue[0]!.parent?.name).toBe("panel");
  });

  test("@note: opens layout note, and the next dialogue line closes it", async () => {
    const h = await play(`layout note {
  paper {
    note #clear { text }
  }
}

scene start
  @note: Buy milk
  MARA: Hello.
end
`);
    expect(Object.keys(beat(h).text)).toEqual(["note"]);
    expect(mounted(h)).toEqual(["note"]);
    expect(findAll(h, "textbox")).toEqual([]);
    expect(findAll(h, "note")).toHaveLength(1);

    await click(h);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(findAll(h, "note")).toEqual([]);
    expect(findAll(h, "paper")).toEqual([]);
  });

  test("a beat with no text closes the box that opened by itself, and the next line opens it again", async () => {
    const h = await play(`scene start
  MARA: Hello.
  [[show backdrop sky]]
  >
  MARA: Again.
end
`);
    expect(mounted(h)).toEqual(["dialogue"]);
    const frame = ids(h, "textbox");

    await click(h);
    expect(Object.keys(beat(h).image ?? {})).toEqual(["backdrop"]);
    expect(Object.values(beat(h).text ?? {}).flat()).toEqual([]);
    expect(mounted(h)).toEqual([]);
    expect(findAll(h, "textbox")).toEqual([]);

    await click(h);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["dialogue"]);
    expect(findAll(h, "textbox")).toHaveLength(1);
    expect(ids(h, "textbox")).not.toEqual(frame);
    expect(shownText(h, "dialogue")).toBe("Again.");
  });

  test("a beat that only runs a directive and lasts no time keeps the box", async () => {
    const h = await play(`layout hud {
  meter { text "HUD" }
}

scene start
  MARA: Hello.
  [[open hud]]
  MARA: Again.
end
`);
    const frame = ids(h, "textbox");
    await click(h);
    expect(shownText(h, "dialogue")).toBe("Again.");
    expect(mounted(h)).toEqual(["dialogue", "hud"]);
    expect(ids(h, "textbox")).toEqual(frame);
  });

  test("a menu with no line of its own opens choices in the box, and a project's own choice slots keep it closed", async () => {
    const MENU = `scene start
  choose
    + [Stay.]
      Stayed.
    + [Go.]
      Gone.
  end
end
`;
    const built = await play(MENU);
    expect(beat(built).choices).toHaveLength(2);
    expect(mounted(built)).toEqual(["choices"]);
    expect(findAll(built, "textbox")).toHaveLength(1);
    expect(built.game.module.ui.findIds("choice")).toHaveLength(6);

    const own = await play(`layout main {
  choice.0 #clear { text }
  choice.1 #clear { text }
}

${MENU}`);
    expect(beat(own).choices).toHaveLength(2);
    expect(mounted(own)).toEqual([]);
    expect(findAll(own, "textbox")).toEqual([]);
    expect(own.game.module.ui.findIds("choice")).toHaveLength(2);
  });

  test("no box opens while textstream is open", async () => {
    const h = await play(`scene start
  [[open textstream]]
  MARA: Hello.
  A plain action line.
end
`);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual(["textstream"]);
    await click(h);
    expect(beat(h).kind).toBe("action");
    expect(mounted(h)).toEqual(["textstream"]);
    expect(findAll(h, "textbox")).toEqual([]);
  });
});

const CLOSED = `scene start
  MARA: Before.
  [[close textbox]]
  Nobody sees this.
  MARA: Nor this.
  [[open textbox]]
  Everybody sees this.
end
`;

describe("[[close textbox]] and [[open textbox]] act on the textbox screen (I-2740)", () => {
  test("after close, lines are not shown and nothing opens; after open, they show again", async () => {
    const h = await play(CLOSED);
    expect(mounted(h)).toEqual(["dialogue"]);

    await click(h);
    expect(beat(h).kind).toBe("action");
    expect(mounted(h)).toEqual([]);
    expect(findAll(h, "textbox")).toEqual([]);
    expect(findAll(h, "action")).toEqual([]);
    await click(h);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual([]);
    expect(findAll(h, "dialogue")).toEqual([]);

    await click(h);
    expect(beat(h).kind).toBe("action");
    expect(mounted(h)).toEqual(["action"]);
    expect(shownText(h, "action")).toBe("Everybody sees this.");
  });

  test("a save keeps the closed textbox, and a line after it still opens nothing until [[open textbox]]", async () => {
    const original = await play(CLOSED);
    await click(original);
    expect(mounted(original)).toEqual([]);
    const saved = original.game.saveHere()!.data;

    const h = createHarness(`${DEFS}\n${CLOSED}`, 0, {
      autoOpenAll: false,
      beforeConnect: (game) => expect(game.loadToResume(saved)).toBe(true),
    });
    await h.ready;
    h.game.context.system.previewing = undefined;
    h.game.start();
    await settle(h);
    expect(mounted(h)).toEqual([]);
    await click(h);
    expect(beat(h).kind).toBe("dialogue");
    expect(mounted(h)).toEqual([]);
    await click(h);
    expect(mounted(h)).toEqual(["action"]);
  });

  test("a checkpoint keeps the closed textbox, and one taken after [[open textbox]] keeps it open", async () => {
    const original = await play(CLOSED);
    await click(original);
    const closed = original.game.save();
    await click(original);
    await click(original);
    const reopened = original.game.save();

    const shut = createHarness(`${DEFS}\n${CLOSED}`, 0, {
      autoOpenAll: false,
      loadCheckpoint: closed,
    });
    await shut.ready;
    await flushMicrotasks(10);
    expect(mounted(shut)).toEqual([]);
    expect(findAll(shut, "textbox")).toEqual([]);

    const open = createHarness(`${DEFS}\n${CLOSED}`, 0, {
      autoOpenAll: false,
      loadCheckpoint: reopened,
    });
    await open.ready;
    await flushMicrotasks(10);
    expect(mounted(open)).toEqual(["action"]);
    expect(findAll(open, "textbox")).toHaveLength(1);
  });
});
