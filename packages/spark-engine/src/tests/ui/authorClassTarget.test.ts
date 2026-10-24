// #863: an element in an author's layout whose class is the name of a builtin
// text or image target (`text.title "Inventory"`) shows its content. A target
// resolves to the elements named exactly as it is, so the story's writes and
// clears of `title` reach the builtin `title` element and leave the author's
// `text title` alone.

import { describe, expect, test } from "vitest";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const script = (element: string) => `layout inventory with
  column.panel #child-gap=8 {
    ${element}
    text "Rope"
  }
end

[[open inventory]]
You rummage through your pack.
`;

async function runBeat(element: string) {
  const h = createHarness(script(element), 0, { reactive: true });
  await h.ready;
  const beat = h.nextBeat();
  await h.display(beat!, true);
  await flushMicrotasks(10);
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
  const idsNamed = (name: string) =>
    [...names].filter(([, n]) => n === name).map(([id]) => id);
  return { h, hidden, idsNamed, created: [...names.values()].join(" | ") };
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
      const { h, hidden, idsNamed, created } = await runBeat(
        `text.${target} "Inventory"`,
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
    const { h, hidden, idsNamed, created } = await runBeat(
      `row.title { text "Inventory" }`,
    );
    const [authored] = idsNamed("row title");
    expect(authored, created).toBeTruthy();
    expect(hidden).not.toContain("row title");
    expect(h.game.module.ui.findIds("title")).not.toContain(authored);
  });

  test("a target no element is named after resolves by its classes", async () => {
    const { h, idsNamed } = await runBeat(`text.title "Inventory"`);
    expect(h.game.module.ui.findIds("panel")).toEqual(
      idsNamed("column panel"),
    );
  });

  test("a choice target leaves an author's element with the choice's classes alone", async () => {
    const { h, idsNamed, created } = await runBeat(`text.choice.0 "Inventory"`);
    const [authored] = idsNamed("text choice 0");
    expect(authored, created).toBeTruthy();
    const ids = h.game.module.ui.findIds("choice 0");
    expect(ids).not.toContain(authored);
    expect(ids).toEqual(idsNamed("choice 0"));
  });
});
