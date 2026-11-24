import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `layout main {
  textbox {
    dialogue {
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
