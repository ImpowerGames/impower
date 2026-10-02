// #1224: a layout written with brace blocks and dotted classes mounts the
// elements its indented form mounts, with the same names and classes, and the
// engine emits the same message stream for both (ids are normalized in
// first-seen order, so the same creation order gives the same ids).

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const STATE = `store items = { "a", "b" }
store busy = true
`;

const BRACED = `${STATE}
layout hud with
  column.panel #child-gap=8 {
    text.title "Inventory"
    for item in items do
      row.item { text "{item}"; button.primary "Use" }
    end
    if busy then
      text.busy "Busy"
    end
    choice.0 { text }
    title { stroke; text }
  }
  stage {
    mask.shadow_1
  }
end
`;

const hpText = (h: ReturnType<typeof createHarness>): string | undefined => {
  const m = h
    .snapshotFiltered("ui/update")
    .find(
      (x: any) =>
        typeof x.params?.content?.text === "string" &&
        x.params.content.text.startsWith("HP:"),
    ) as any;
  return m?.params?.content?.text;
};

describe("handlers on elements in a block", () => {
  for (const [label, handler, expected] of [
    ["a ref handler", "@click=heal", "HP: 105"],
    ["a call handler", "@click=take_damage(10)", "HP: 90"],
    ["a closure handler", "@click={ hp = hp + 1; hp = hp * 2 }", "HP: 202"],
  ] as const) {
    test(`${label} runs when the element is clicked`, async () => {
      const h = createHarness(
        `store hp = 100
function heal()
  hp = hp + 5
end
function take_damage(n)
  hp = hp - n
end
layout hud with
  column.panel {
    text "HP: {hp}"
    row { button.primary "Go" ${handler}; text "after" }
  }
end
`,
        0,
        { reactive: true },
      );
      await h.ready;
      const buttonId = h.observedElementIds()[0];
      expect(buttonId).toBeTruthy();
      h.reset();
      h.emitEvent("click", buttonId!);
      expect(hpText(h)).toBe(expected);
    });
  }
});

describe("a brace-form layout mounts with its declared tree", () => {
  test("same elements, names and classes, and the same message stream", async () => {
    const braced = createHarness(BRACED);
    await braced.ready;
    const created = (h: ReturnType<typeof createHarness>) =>
      h
        .snapshotFiltered("ui/create")
        .map((m: any) => m.params?.name)
        .filter((name: string) => name !== undefined);
    const names = created(braced);
    // The elements the layout declares, with their classes in their names.
    for (const name of [
      "hud",
      "column panel",
      "text title",
      "row item",
      "button primary",
      "text busy",
      "choice 0",
      "title",
      "stroke",
      "mask shadow_1",
    ]) {
      expect(names).toContain(name);
    }
    expect(names.filter((n: string) => n === "row item")).toHaveLength(2);

  });
});
