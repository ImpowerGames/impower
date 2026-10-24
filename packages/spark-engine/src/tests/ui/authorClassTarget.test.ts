// #863: an element in an author's layout whose class is the name of a builtin
// text or image target (`text.title "Inventory"`) shows its content. A target
// resolves to the elements named exactly as it is, so the story's writes and
// clears of `title` reach the builtin `title` element and leave the author's
// `text title` alone. A target no element is named after reaches only the
// layouts' declared targets that carry its classes, never an element holding
// what the author wrote.

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

  for (const [label, element, name] of [
    ["`text.title`", `text.title "Inventory"`, "text title"],
    ["a `row.title` container", `row.title { text "Inventory" }`, "row title"],
  ] as const) {
    test(`${label} in a layout that replaces \`main\` is not written by the story's title`, async () => {
      const { h, hidden, writes, idsNamed, created } = await run(
        `layout main with
  column.panel {
    ${element}
    text "Rope"
  }
end

^: Chapter One

You rummage through your pack.
`,
      );
      const [authored] = idsNamed(name);
      expect(authored, created).toBeTruthy();
      expect(hidden).not.toContain(name);
      expect(h.game.module.ui.findIds("title")).toEqual([]);
      expect(writes.map((m) => m.params.target)).not.toContain("title");
    });
  }
});

describe("a target no element is named after", () => {
  test("reaches the declared target with its classes, and the write names it", async () => {
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
