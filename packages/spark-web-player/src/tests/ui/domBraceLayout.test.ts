// #1224: a layout written with brace blocks and dotted classes renders the DOM
// its indented form renders: the same elements, with the same names and
// classes, in the same places.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const STATE = `store items = { "a", "b" }
store busy = true
`;

const INDENTED = `${STATE}
layout hud with
  column panel #child-gap=8:
    text title "Inventory"
    for item in items do
      row item:
        text "{item}"
        button primary "Use"
    end
    if busy then
      text busy "Busy"
    end
    choice 0:
      text
    title:
      stroke
      text
  stage:
    mask shadow_1
end
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

async function render(source: string) {
  const h = createDOMHarness(source, 0, { reactive: true });
  await h.ready;
  await flushMicrotasks();
  return h;
}

describe("a brace-form layout renders as its indented form", () => {
  test("same elements, names and classes", async () => {
    const indented = await render(INDENTED);
    const braced = await render(BRACED);
    const hud = braced.overlay.querySelector(".hud");
    expect(hud).not.toBeNull();
    const panel = hud!.querySelector(":scope > .column.panel");
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll(".row.item")).toHaveLength(2);
    expect(panel!.querySelectorAll(".row.item > .button.primary")).toHaveLength(2);
    expect(panel!.querySelector(".text.title")?.textContent).toBe("Inventory");
    expect(panel!.querySelector(".text.busy")?.textContent).toBe("Busy");
    const choice = panel!.querySelector(':scope > [class~="choice"][class~="0"]');
    expect(choice?.outerHTML).toBeDefined();
    expect(choice!.querySelector(":scope > .text")).not.toBeNull();
    expect(panel!.querySelector(":scope > .title > .stroke")).not.toBeNull();
    expect(panel!.querySelector(":scope > .title > .text")).not.toBeNull();
    expect(hud!.querySelector(".stage > .mask.shadow_1")).not.toBeNull();
    expect(braced.snapshotDOM()).toEqual(indented.snapshotDOM());
  });
});
