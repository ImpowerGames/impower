import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const setGlobal = (h: any, name: string, value: unknown): void => {
  h.game.story.variablesState.$(name, value);
};
const refresh = async (h: any): Promise<void> => {
  h.game.module.ui.refreshLayouts();
  await flushMicrotasks();
};
const visibleText = (h: any): string => {
  const root = (h.overlay.querySelector("#game") ?? h.overlay) as HTMLElement;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style, script").forEach((e) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, "").replace(/[▼▲■]/g, "");
};

describe("dom control flow (wrapperless)", () => {
  test("an `if` toggling true inserts its content BETWEEN its siblings", async () => {
    const h = createDOMHarness(
      `store show = false
layout s with
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
    expect(visibleText(h)).toBe("AC");
    setGlobal(h, "show", true);
    await refresh(h);
    expect(visibleText(h)).toBe("ABC");
    setGlobal(h, "show", false);
    await refresh(h);
    expect(visibleText(h)).toBe("AC");
  });

  test("a `for`'s items render in order between its siblings", async () => {
    const h = createDOMHarness(
      `store items = { "x", "y", "z" }
layout s with
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
    const h = createDOMHarness(
      `store outer = true
store inner = false
layout s with
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
    expect(visibleText(h)).toBe("<OIZ");
    setGlobal(h, "inner", false);
    await refresh(h);
    expect(visibleText(h)).toBe("<OZ");
  });

  test("escalation skips trailing EMPTY sibling regions", async () => {
    const h = createDOMHarness(
      `store outer = true
store inner = false
store never = false
layout s with
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
    expect(visibleText(h)).toBe("OIZ");
  });

  test("a nested region re-mounted on a branch switch still escalates correctly", async () => {
    const h = createDOMHarness(
      `store mode = 1
store inner = false
layout s with
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
    setGlobal(h, "inner", true);
    await refresh(h);
    expect(visibleText(h)).toBe("<AIZ");
  });

  test("no display:contents wrapper elements are emitted", async () => {
    const h = createDOMHarness(
      `store show = true
layout s with
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
layout s with
  dropdown #value={choice} {
    for o in opts do
      option "{o}"
    end
  }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const select = h.overlay.querySelector("select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select!.options.length).toBe(3);
    expect(
      Array.from(select!.children).every((c) => c.tagName === "OPTION"),
    ).toBe(true);
    expect(select!.value).toBe("b");
  });
});
