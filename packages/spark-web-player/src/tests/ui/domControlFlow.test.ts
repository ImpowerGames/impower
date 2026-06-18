// Real-DOM verification of wrapperless control flow: drives the engine through
// the actual UIManager under jsdom and asserts the realized DOM order/parentage
// (not just the message stream). This is what proves a region's content lands at
// the right sibling position with NO wrapper element, and that dynamic dropdown
// <option>s are direct children of the <select>.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const setGlobal = (h: any, name: string, value: unknown): void => {
  h.game.story.variablesState.$(name, value);
};
const refresh = async (h: any): Promise<void> => {
  h.game.module.ui.refreshScreens();
  await flushMicrotasks();
};
/** Visible rendered text in document order, excluding the injected stylesheet
 *  and constant screen chrome (e.g. the ▼ continue indicator). */
const visibleText = (h: any): string => {
  const root = (h.overlay.querySelector("#game") ?? h.overlay) as HTMLElement;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style, script").forEach((e) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, "").replace(/[▼▲]/g, "");
};

describe("dom control flow (wrapperless)", () => {
  test("an `if` toggling true inserts its content BETWEEN its siblings", async () => {
    const h = createDOMHarness(
      `store show = false
screen s with
  text "A"
  if show then
    text "B"
  end
  text "C"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    // Empty branch → A, C with nothing between.
    expect(visibleText(h)).toBe("AC");
    // Toggling true must place B at the region's slot (between A and C), not at
    // the end — the whole point of positional, wrapperless mounting.
    setGlobal(h, "show", true);
    await refresh(h);
    expect(visibleText(h)).toBe("ABC");
    // And back to empty, order preserved.
    setGlobal(h, "show", false);
    await refresh(h);
    expect(visibleText(h)).toBe("AC");
  });

  test("a `for`'s items render in order between its siblings", async () => {
    const h = createDOMHarness(
      `store items = { "x", "y", "z" }
screen s with
  text "<"
  for it in items do
    text "{it}"
  end
  text ">"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    expect(visibleText(h)).toBe("<xyz>");
  });

  test("a nested `if` that is the LAST item of an enclosing branch positions correctly on toggle", async () => {
    // Escalation case: the inner `if` is the last node of the outer branch, so
    // its local sibling group has nothing live after it — its anchor must
    // escalate to the outer region's slot (before Z), not append to the parent.
    const h = createDOMHarness(
      `store outer = true
store inner = false
screen s with
  text "<"
  if outer then
    text "O"
    if inner then
      text "I"
    end
  end
  text "Z"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    expect(visibleText(h)).toBe("<OZ");
    setGlobal(h, "inner", true);
    await refresh(h);
    expect(visibleText(h)).toBe("<OIZ"); // I lands between O and Z, not after Z
    setGlobal(h, "inner", false);
    await refresh(h);
    expect(visibleText(h)).toBe("<OZ");
  });

  test("escalation skips trailing EMPTY sibling regions", async () => {
    const h = createDOMHarness(
      `store outer = true
store inner = false
store never = false
screen s with
  if outer then
    text "O"
    if inner then
      text "I"
    end
    if never then
      text "N"
    end
  end
  text "Z"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    expect(visibleText(h)).toBe("OZ");
    setGlobal(h, "inner", true);
    await refresh(h);
    // `inner` is followed only by the empty `never` region, so its anchor must
    // still escalate past it to Z.
    expect(visibleText(h)).toBe("OIZ");
  });

  test("a nested region re-mounted on a branch switch still escalates correctly", async () => {
    // After switching away and back, the inner `if` is freshly mounted by the
    // branch-switch path — it must still get an owner so a later toggle escalates
    // (lands between A and Z, not after Z).
    const h = createDOMHarness(
      `store mode = 1
store inner = false
screen s with
  text "<"
  if mode == 1 then
    text "A"
    if inner then
      text "I"
    end
  elseif mode == 2 then
    text "B"
  end
  text "Z"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    expect(visibleText(h)).toBe("<AZ");
    setGlobal(h, "mode", 2);
    await refresh(h);
    expect(visibleText(h)).toBe("<BZ");
    setGlobal(h, "mode", 1);
    await refresh(h);
    expect(visibleText(h)).toBe("<AZ");
    // The re-mounted inner `if` toggles and must land between A and Z.
    setGlobal(h, "inner", true);
    await refresh(h);
    expect(visibleText(h)).toBe("<AIZ");
  });

  test("no display:contents wrapper elements are emitted", async () => {
    const h = createDOMHarness(
      `store show = true
screen s with
  if show then
    text "B"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const wrappers = Array.from(
      h.overlay.querySelectorAll<HTMLElement>("*"),
    ).filter((el) => el.style.display === "contents");
    expect(wrappers).toHaveLength(0);
  });

  test("dynamic dropdown options (a `for`) are DIRECT <select> children", async () => {
    const h = createDOMHarness(
      `store choice = "b"
store opts = { "a", "b", "c" }
screen s with
  dropdown #value={choice}:
    for o in opts do
      option "{o}"
    end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const select = h.overlay.querySelector("select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    // Wrapperless: every option is a direct child, so .options enumerates them
    // and the bound value can select.
    expect(select!.options.length).toBe(3);
    expect(
      Array.from(select!.children).every((c) => c.tagName === "OPTION"),
    ).toBe(true);
    expect(select!.value).toBe("b");
  });
});
