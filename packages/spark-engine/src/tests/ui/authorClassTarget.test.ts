// #863: an element in an author's layout whose class is the name of a builtin
// text or image target (`text.title "Inventory"`) shows its content. A target
// resolves to the elements named exactly as it is, so the story's writes and
// clears of `title` reach the builtin `title` element and leave the author's
// `text title` alone. A target no element is named after reaches the elements
// that carry its classes, never a content element such as `text title`.

import { describe, expect, test } from "vitest";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const inventory = (element: string) => `layout inventory with
  column.panel #child-gap=8 {
    ${element}
    text "Rope"
  }
end

[[open inventory]]
You rummage through your pack.
`;

async function run(source: string) {
  const h = createHarness(source, 0, { reactive: true });
  await h.ready;
  let beat = h.nextBeat();
  while (beat) {
    await h.display(beat, true);
    await flushMicrotasks(10);
    beat = h.nextBeat();
  }
  const ops = flattenMessages(h.messages);
  const names = new Map<string, string>();
  for (const m of ops) {
    if (m.method === "ui/create") {
      names.set(m.params.element, m.params.name);
    }
  }
  const hidden = ops
    .filter(
      (m) => m.method === "ui/update" && m.params?.style?.display === "none",
    )
    .map((m) => names.get(m.params.element));
  const writes = ops.filter(
    (m) => m.method === "ui/write-text" || m.method === "ui/write-image",
  );
  const idsNamed = (name: string) =>
    [...names].filter(([, n]) => n === name).map(([id]) => id);
  return {
    h,
    hidden,
    writes,
    idsNamed,
    created: [...names.values()].join(" | "),
  };
}

describe("an author's element whose class names a builtin target", () => {
  for (const target of [
    "title",
    "heading",
    "transitional",
    "dialogue",
    "action",
    "character_name",
    "character_parenthetical",
    "portrait",
  ]) {
    test(`\`text.${target}\` is not hidden by the \`${target}\` target`, async () => {
      const { h, hidden, idsNamed, created } = await run(
        inventory(`text.${target} "Inventory"`),
      );
      const [authored] = idsNamed(`text ${target}`);
      expect(authored, created).toBeTruthy();
      expect(hidden).not.toContain(`text ${target}`);
      const ids = h.game.module.ui.findIds(target);
      expect(ids).not.toContain(authored);
      expect(ids).toEqual(idsNamed(target));
    });
  }

  test("a container whose class names a builtin target keeps its content", async () => {
    const { h, hidden, idsNamed, created } = await run(
      inventory(`row.title { text "Inventory" }`),
    );
    const [authored] = idsNamed("row title");
    expect(authored, created).toBeTruthy();
    expect(hidden).not.toContain("row title");
    expect(h.game.module.ui.findIds("title")).not.toContain(authored);
  });

  test("a choice target leaves an author's element with the choice's classes alone", async () => {
    const { h, idsNamed, created } = await run(
      inventory(`text.choice.0 "Inventory"`),
    );
    const [authored] = idsNamed("text choice 0");
    expect(authored, created).toBeTruthy();
    const ids = h.game.module.ui.findIds("choice 0");
    expect(ids).not.toContain(authored);
    expect(ids).toEqual(idsNamed("choice 0"));
  });

  test("`text.title` in a layout that replaces `main` is not written by the story's title", async () => {
    const { h, hidden, writes, idsNamed, created } = await run(
      `layout main with
  column.panel {
    text.title "Inventory"
    text "Rope"
  }
end

^: Chapter One

You rummage through your pack.
`,
    );
    const [authored] = idsNamed("text title");
    expect(authored, created).toBeTruthy();
    expect(hidden).not.toContain("text title");
    expect(h.game.module.ui.findIds("title")).toEqual([]);
    expect(writes.map((m) => m.params.target)).not.toContain("title");
  });
});

describe("a target no element is named after", () => {
  // The coordinator's decision for #863, with the #1813 rule
  // (spark-web-player workerConnectRestore.test.ts): in a layout that
  // replaces `main`, a container carrying a target's name as a class is that
  // target's slot, and its text is a placeholder the story's write replaces.
  test("takes a container carrying its class as its slot in a layout that replaces `main`", async () => {
    const { h, writes, idsNamed, created } = await run(
      `layout main with
  column.panel {
    row.title { text "Inventory" }
    text "Rope"
  }
end

^: Chapter One

You rummage through your pack.
`,
    );
    const [slot] = idsNamed("row title");
    expect(slot, created).toBeTruthy();
    expect(h.game.module.ui.findIds("title")).toEqual([slot]);
    const written = writes.filter(
      (m) =>
        m.method === "ui/write-text" &&
        m.params.target === "title" &&
        m.params.instructions.length > 0,
    );
    expect(written).toHaveLength(1);
    expect(written[0].params.elements).toEqual([slot]);
    expect(
      written[0].params.instructions.map((i: any) => i.text).join(""),
    ).toContain("Chapter One");
  });

  test("still reveals an author's `text.continue_indicator` in a layout that replaces `main`", async () => {
    const { hidden, idsNamed, created, h } = await run(
      `layout main with
  column.panel {
    text "Rope"
    text.continue_indicator "Next"
  }
end

You rummage through your pack.
`,
    );
    const [indicator] = idsNamed("text continue_indicator");
    expect(indicator, created).toBeTruthy();
    expect(hidden).not.toContain("text continue_indicator");
    const updates = flattenMessages(h.messages).filter(
      (m) => m.method === "ui/update" && m.params.element === indicator,
    );
    await h.game.module.ui.style.update("continue_indicator", {
      opacity: "1",
    });
    (h.game.module.ui as any).flushUIBatch();
    await flushMicrotasks(10);
    const after = flattenMessages(h.messages).filter(
      (m) => m.method === "ui/update" && m.params.element === indicator,
    );
    expect(after.length).toBeGreaterThan(updates.length);
    expect(after.at(-1).params.style).toMatchObject({ opacity: "1" });
  });

  test("reaches the layer with its classes and not a label with them, and the write names it", async () => {
    const { h, hidden, writes, idsNamed, created } = await run(
      `layout hud with
  box.avatar { image }
  text.avatar "Label"
end

define HERO as image with
  src = "https://example.com/hero.png"
end

[[show avatar HERO]]
You rummage through your pack.
`,
    );
    const [layer] = idsNamed("box avatar");
    const [label] = idsNamed("text avatar");
    expect(layer, created).toBeTruthy();
    expect(label, created).toBeTruthy();
    expect(h.game.module.ui.findIds("avatar")).toEqual([layer]);
    expect(hidden).not.toContain("text avatar");
    const shown = writes.filter(
      (m) =>
        m.method === "ui/write-image" &&
        m.params.target === "avatar" &&
        m.params.instructions.length > 0,
    );
    expect(shown).toHaveLength(1);
    expect(shown[0].params.elements).toEqual([layer]);
  });
});
