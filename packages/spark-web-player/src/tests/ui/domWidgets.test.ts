// Real-DOM widget checks: drives the engine through the actual UIManager under
// jsdom and asserts the realized DOM (not just the message stream) — so the
// renderer's live value-property path (<select>.value selecting an option) and
// the <option> DOM parentage are exercised end to end.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

describe("dom widgets", () => {
  test("dropdown's <option>s are direct children of the <select> and the bound value selects", async () => {
    const h = createDOMHarness(
      `store difficulty = "hard"
layout form with
  dropdown #value={difficulty}:
    option "Easy" #value="easy"
    option "Normal" #value="normal"
    option "Hard" #value="hard"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const select = h.overlay.querySelector("select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    // Options must be DIRECT children so HTMLSelectElement.options enumerates
    // them (a wrapper between select and option would hide them).
    expect(select!.options.length).toBe(3);
    // The deferred, bound value actually selects the option in the live DOM.
    expect(select!.value).toBe("hard");
  });

  test("field renders a real <input> whose value follows state", async () => {
    const h = createDOMHarness(
      `store name = "Zelda"
layout form with
  field #value={name}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const input = h.overlay.querySelector("input") as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input!.value).toBe("Zelda");
  });

  test("slider gets a --_fill-percentage custom property on the real element", async () => {
    const h = createDOMHarness(
      `store volume = 40
layout form with
  slider #value={volume} #min=0 #max=100
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const slider = h.overlay.querySelector(
      "input[type=range]",
    ) as HTMLInputElement | null;
    expect(slider).toBeTruthy();
    expect(slider!.style.getPropertyValue("--_fill-percentage")).toBe("40%");
  });

  // D8: the interactive widget builtins ship DEFAULT STYLES from the builtins
  // prelude (packages/sparkdown/src/compiler/builtins/builtins.sd — the
  // authoritative source; the legacy JS uiBuiltinDefinitions.ts is not the
  // render path). This drives the real getStyleContent pipeline and asserts the
  // emitted stylesheet so the widget-styling contract is guarded end to end.
  test("widget builtins emit their default styles into the stylesheet", async () => {
    const h = createDOMHarness(
      `store name = "Zelda"
store on = true
store vol = 40
layout form with
  button "Go" @click=noop
  link "More" @click=noop
  field #value={name}
  checkbox #checked={on}
  slider #value={vol} #min=0 #max=100
end
function noop()
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const styleEl = h.overlay.ownerDocument.querySelector(
      ".style-styles",
    ) as HTMLElement | null;
    expect(styleEl).toBeTruthy();
    const css = styleEl!.textContent ?? "";

    // button — styled clickable with a hover state
    expect(css).toContain(".button");
    expect(css).toContain("cursor: pointer");
    expect(css).toContain(":hover");
    // link — underlined
    expect(css).toContain(".link");
    expect(css).toContain("text-decoration: underline");
    // field — has a background fill (styled input, not the OS default)
    expect(css).toContain(".field");
    // checkbox / slider — native controls tinted via accent-color
    expect(css).toContain(".checkbox");
    expect(css).toContain(".slider");
    expect(css).toContain("accent-color");
  });
});
