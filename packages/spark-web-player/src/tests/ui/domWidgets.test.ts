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
screen form with
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
screen form with
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
screen form with
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
});
