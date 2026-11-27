import { describe, expect, test } from "vitest";
import { holdsPresentedText } from "../../src/game/core/classes/presenters/textLayouts";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `layout main {
  textbox {
    dialogue #clear {
      text
    }
  }
}

screen menu {
  panel {
    header { text "My Game" }
    slot
    footer { text "v1" }
  }
}

screen bare {
  banner { text "Banner" }
}

layout title in menu {
  title_page { text "Title" }
}

layout settings in menu {
  settings_page { text "Settings" }
}

layout alone in bare {
  alone_page { text "Alone" }
}

scene start
  [[navigate menu to title]] One.
  [[navigate menu to settings]] Two.
  [[close settings]] Three.
  [[open alone]] Four.
end
`;

type Harness = ReturnType<typeof createHarness>;

interface TreeElement {
  id: string;
  name: string;
  parent: TreeElement | null;
  children: TreeElement[];
}

const tree = (h: Harness): TreeElement | undefined =>
  (h.game.module.ui as any)._root;

const findAll = (h: Harness, name: string): TreeElement[] => {
  const out: TreeElement[] = [];
  const walk = (el: TreeElement | undefined) => {
    if (!el) {
      return;
    }
    if (el.name === name) {
      out.push(el);
    }
    el.children.forEach(walk);
  };
  walk(tree(h));
  return out;
};

const only = (h: Harness, name: string): TreeElement => {
  const found = findAll(h, name);
  expect(found.map((el) => el.name)).toEqual([name]);
  return found[0]!;
};

const childNames = (el: TreeElement): string[] =>
  el.children.map((child) => child.name);

const createdNames = (h: Harness): unknown[] =>
  h.snapshotFiltered("ui/create").map((m: any) => m.params?.name);

const createdStyle = (h: Harness, name: string): Record<string, unknown> =>
  (
    h
      .snapshotFiltered("ui/create")
      .filter((m: any) => m.params?.name === name)
      .at(-1) as any
  )?.params?.style ?? {};

const destroyed = (h: Harness): unknown[] =>
  h
    .snapshotFiltered("ui/destroy")
    .flatMap((m: any) => [m.params?.element, ...(m.params?.elements ?? [])]);

async function drive(h: Harness, instant: boolean) {
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  await h.display(beat!, instant);
  await flushMicrotasks();
}

async function started() {
  const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
  await h.ready;
  h.jumpToFlow("start");
  return h;
}

describe("a screen's own elements stay while any of its layouts is open", () => {
  for (const instant of [true, false]) {
    test(`they mount once, keep their ids across navigate and leave with the last layout (instant: ${instant})`, async () => {
      const h = await started();
      expect(findAll(h, "panel")).toEqual([]);

      await drive(h, instant);
      const panel = only(h, "panel");
      const header = only(h, "header");
      expect(header.parent).toBe(panel);
      expect(childNames(panel)).toEqual(["header", "title", "footer"]);
      expect(only(h, "title_page").parent?.name).toBe("title");

      h.reset();
      await drive(h, instant);
      expect(only(h, "panel")).toBe(panel);
      expect(only(h, "panel").id).toBe(panel.id);
      expect(only(h, "header").id).toBe(header.id);
      expect(childNames(panel)).toEqual(["header", "settings", "footer"]);
      expect(findAll(h, "title")).toEqual([]);
      expect(createdNames(h)).not.toContain("panel");
      expect(createdNames(h)).not.toContain("header");
      expect(destroyed(h)).not.toContain(panel.id);

      h.reset();
      await drive(h, instant);
      expect(findAll(h, "panel")).toEqual([]);
      expect(findAll(h, "header")).toEqual([]);
      expect(findAll(h, "settings")).toEqual([]);
      expect((h.game.module.ui as any)._mountedLayouts.has("settings")).toBe(
        false,
      );
    });
  }

  test("with no slot, the open layout is placed after the screen's elements", async () => {
    const h = await started();
    for (let i = 0; i < 4; i += 1) {
      await drive(h, true);
    }
    const banner = only(h, "banner");
    const root = banner.parent!;
    expect(root.name).toBe("bare");
    expect(childNames(root)).toEqual(["banner", "alone"]);
    expect(only(h, "alone_page").parent?.name).toBe("alone");
    expect(createdStyle(h, "alone")["position"]).toBeUndefined();
    expect(createdStyle(h, "alone")["inset"]).toBeUndefined();
  });

  test("a checkpoint taken with a screen's layout open restores the screen's elements", async () => {
    const h = await started();
    await drive(h, true);
    const checkpoint = h.game.save();

    const restored = createHarness(SOURCE, 0, {
      reactive: true,
      autoOpenAll: false,
      loadCheckpoint: checkpoint,
    });
    await restored.ready;
    await flushMicrotasks();
    const panel = only(restored, "panel");
    expect(childNames(panel)).toEqual(["header", "title", "footer"]);
    expect(only(restored, "title_page").parent?.name).toBe("title");
  });
});

const ui = (h: Harness): any => h.game.module.ui;

async function bare(source: string, assets?: any[]) {
  const h = createHarness(source, 0, {
    reactive: true,
    autoOpenAll: false,
    ...(assets ? { assets } : {}),
  });
  await h.ready;
  return h;
}

describe("a screen's elements follow its layouts through every route", () => {
  test("a slot that moves to another branch takes the open layout with it", async () => {
    const h = await bare(`store left = true
screen menu {
  if left then
    left_panel { slot }
  else
    right_panel { slot }
  end
}

layout home in menu {
  home_page { text "Home" }
}

layout options in menu {
  options_page { text "Options" }
}
`);
    await ui(h).openLayout("home", undefined, true);
    expect(only(h, "home_page").parent?.parent?.name).toBe("left_panel");

    (h.game.story as any).variablesState.$("left", false);
    ui(h).refreshLayouts();
    expect(findAll(h, "left_panel")).toEqual([]);
    expect(only(h, "home").parent?.name).toBe("right_panel");
    expect(only(h, "home_page").parent?.name).toBe("home");

    await ui(h).navigateScreen("options", "menu", undefined, true);
    expect(findAll(h, "home")).toEqual([]);
    expect(only(h, "options").parent?.name).toBe("right_panel");
  });

  test("a slot whose branch leaves puts the open layout after the screen's elements", async () => {
    const h = await bare(`store framed = true
screen menu {
  banner { text "Banner" }
  if framed then
    frame { slot }
  end
}

layout home in menu {
  home_page { text "Home" }
}
`);
    await ui(h).openLayout("home", undefined, true);
    expect(only(h, "home").parent?.name).toBe("frame");

    (h.game.story as any).variablesState.$("framed", false);
    ui(h).refreshLayouts();
    expect(findAll(h, "frame")).toEqual([]);
    expect(childNames(only(h, "menu"))).toEqual(["banner", "home"]);
    expect(createdStyle(h, "home")["position"]).toBeUndefined();
  });

  test("a screen element that appears later stays before a layout placed with no slot", async () => {
    const h = await bare(`store expanded = false
screen menu {
  shared_heading { text "My Game" }
  if expanded then
    shared_notice { text "Notice" }
  end
}

layout home in menu { home_page }
`);
    await ui(h).openLayout("home", undefined, true);
    expect(childNames(only(h, "menu"))).toEqual(["shared_heading", "home"]);

    (h.game.story as any).variablesState.$("expanded", true);
    ui(h).refreshLayouts();
    expect(childNames(only(h, "menu"))).toEqual([
      "shared_heading",
      "shared_notice",
      "home",
    ]);
  });

  test("closing every open layout of a screen together with an animation removes its elements", async () => {
    const h = await bare(`screen menu {
  shared_heading { text "My Game" }
  slot
}

layout home in menu { home_page }
layout options in menu { options_page }
layout elsewhere { other_page }
`);
    await ui(h).openLayout("home", undefined, true);
    await ui(h).openLayout("options", undefined, true);
    only(h, "shared_heading");

    await ui(h).navigateScreen(
      "elsewhere",
      undefined,
      [{ with: "fade", over: 0.1 }],
      false,
    );
    await flushMicrotasks();
    expect(findAll(h, "home")).toEqual([]);
    expect(findAll(h, "options")).toEqual([]);
    only(h, "other_page");
    expect(findAll(h, "shared_heading")).toEqual([]);
    expect(ui(h)._mountedScreens.size).toBe(0);
  });

  test("opening a screen's layout loads a font only the screen's elements use", async () => {
    const h = await bare(
      `screen menu {
  shared_heading { text "My Game" #font_family="Fancy" }
  slot
}

layout home in menu {
  home_page { text "Home" }
}
`,
      [
        {
          uri: "inmemory:///Fancy.ttf",
          type: "font",
          name: "Fancy",
          ext: "ttf",
          src: "/file:/proj/Fancy.ttf?v=1",
        },
      ],
    );
    h.reset();
    await ui(h).openLayout("home", undefined, true);
    await flushMicrotasks();
    const fonts = h
      .snapshotFiltered("assets/load")
      .flatMap((m: any) => m.params.items)
      .filter((item: any) => item.kind === "font");
    expect(fonts).toContainEqual(expect.objectContaining({ family: "Fancy" }));
  });
});

describe("a screen's elements count as its layouts' own", () => {
  test("a layout whose screen holds the dialogue box presents the text", async () => {
    const h = await bare(`screen conversation {
  textbox { dialogue #clear { text } }
  slot
}

layout page in conversation { marker }

layout loose { marker }
`);
    expect(holdsPresentedText(h.game, "page")).toBe(true);
    expect(holdsPresentedText(h.game, "loose")).toBe(false);
  });

  test("a #clear text target a screen's body holds clears with each line like a layout's", async () => {
    const h = await bare(`screen menu {
  caption #clear { text }
  slot
}

layout home in menu { home_page }

layout notes { note #clear { text } }
`);
    const transient = ui(h).getTransientTargets();
    expect(transient).toContain("caption");
    expect(transient).toContain("note");
  });

  test("a slot forwarded through a component branch that leaves gives up the open layout", async () => {
    const h = await bare(`store framed = true
component wrapper {
  if framed then
    frame { slot }
  else
    banner
  end
}

screen menu {
  wrapper { slot }
}

layout home in menu { home_page }
`);
    await ui(h).openLayout("home", undefined, true);
    expect(only(h, "home").parent?.name).toBe("frame");

    (h.game.story as any).variablesState.$("framed", false);
    ui(h).refreshLayouts();
    expect(findAll(h, "frame")).toEqual([]);
    only(h, "banner");
    expect(only(h, "home").parent?.name).toBe("menu");
    only(h, "home_page");
  });
});
