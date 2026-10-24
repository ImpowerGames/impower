// #863: an element in an author's layout whose class is the name of a builtin
// text target shows what the author wrote. The story's line goes to the
// builtin `action` element, and the author's `text.action` keeps its own text
// and stays visible, whether the page resolves the write's target itself or
// a composed beat names its elements.

import { describe, expect, test } from "vitest";
import {
  createDOMHarness,
  flushMicrotasks,
  type DOMHarness,
} from "./domTestHarness";

const SOURCE = `layout inventory with
  column.panel #child-gap=8 {
    text.action "Inventory"
    text "Rope"
  }
end

-> start

scene start
  [[open inventory]]
  You rummage through your pack.
end
`;

const LINE = SOURCE.split("\n").findIndex((l) => l.includes("You rummage"));

function expectAuthoredKept(h: DOMHarness) {
  const authored = h.overlay.querySelector<HTMLElement>(
    ".panel > .text.action",
  );
  expect(authored, h.overlay.innerHTML).not.toBeNull();
  expect(authored!.textContent).toBe("Inventory");
  expect(authored!.style.display).not.toBe("none");
  const builtin = [...h.overlay.querySelectorAll<HTMLElement>(".action")].filter(
    (el) => el.className === "action",
  );
  expect(builtin).toHaveLength(1);
  expect(builtin[0]!.textContent).toContain("You rummage through your pack.");
  expect((h.ui as any).findTargetElements("action")).toEqual(builtin);
}

describe("an author's element whose class names a builtin target", () => {
  test("keeps its text when the page resolves the story's write", async () => {
    const h = createDOMHarness(SOURCE, 0, { reactive: true });
    await h.ready;
    h.jumpTo("start");
    const beat = h.nextBeat();
    await h.display(beat!, true);
    await flushMicrotasks(10);
    expectAuthoredKept(h);
  });

  test("keeps its text when a composed preview beat writes the target", async () => {
    const h = createDOMHarness(SOURCE, LINE, { reactive: true, compose: true });
    await h.ready;
    await h.rerender(SOURCE, LINE);
    await flushMicrotasks(10);
    expectAuthoredKept(h);
  });
});
