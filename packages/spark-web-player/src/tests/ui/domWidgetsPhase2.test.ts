// Phase 2 widget builtins: radio, switch, textarea, and narrowing the generic
// `input` to any HTML input type. Drives the real engine through the real
// UIManager under jsdom and asserts the realized DOM controls.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

describe("dom widgets · phase 2", () => {
  test("radio renders a real <input type=radio> whose checked follows state", async () => {
    const h = createDOMHarness(
      `store picked = true
layout form with
  radio #checked={picked} #name="plan"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const radio = h.overlay.querySelector(
      "input[type=radio]",
    ) as HTMLInputElement | null;
    expect(radio).toBeTruthy();
    expect(radio!.checked).toBe(true);
    // Grouping still works — `name` is passed through as an attribute.
    expect(radio!.getAttribute("name")).toBe("plan");
  });

  test("switch is a checkbox carrying role=switch", async () => {
    const h = createDOMHarness(
      `store on = true
layout form with
  switch #checked={on}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const sw = h.overlay.querySelector(
      "input[type=checkbox][role=switch]",
    ) as HTMLInputElement | null;
    expect(sw).toBeTruthy();
    expect(sw!.checked).toBe(true);
    // It must NOT be confused with a plain checkbox in the style layer.
    expect(sw!.classList.contains("switch")).toBe(true);
  });

  test("textarea renders a real <textarea> whose value follows state", async () => {
    const h = createDOMHarness(
      `store notes = "Dear diary"
layout form with
  textarea #value={notes} #rows=4
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const ta = h.overlay.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    expect(ta).toBeTruthy();
    // `value` is a live PROPERTY (an attribute would not populate the control).
    expect(ta!.value).toBe("Dear diary");
    expect(ta!.getAttribute("rows")).toBe("4");
  });

  test("`input #type=` narrows the generic input to any HTML type", async () => {
    const h = createDOMHarness(
      `store email = "a@b.co"
store when = "2026-07-24"
layout form with
  input #type="email" #value={email}
  input #type="date" #value={when}
  input #type="password"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const email = h.overlay.querySelector(
      "input[type=email]",
    ) as HTMLInputElement | null;
    expect(email).toBeTruthy();
    expect(email!.value).toBe("a@b.co");
    expect(h.overlay.querySelector("input[type=date]")).toBeTruthy();
    expect(h.overlay.querySelector("input[type=password]")).toBeTruthy();
    // The default `text` type must not leak through when narrowed.
    expect(h.overlay.querySelectorAll("input[type=text]").length).toBe(0);
  });

  test("the new widget builtins ship default styles", async () => {
    const h = createDOMHarness(
      `store on = true
store notes = "hi"
layout form with
  radio #checked={on}
  switch #checked={on}
  textarea #value={notes}
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks();
    const css = [...h.overlay.querySelectorAll("style")]
      .map((s) => s.textContent ?? "")
      .join("\n");
    for (const cls of ["radio", "switch", "textarea"]) {
      expect(css, `expected default styles for .${cls}`).toContain(`.${cls}`);
    }
  });
});
