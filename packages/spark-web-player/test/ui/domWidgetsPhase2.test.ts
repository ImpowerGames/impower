import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

describe("dom widgets · phase 2", () => {
  test("radio renders a real <input type=radio> whose checked follows state", async () => {
    const h = createDOMHarness(
      `store picked = true
layout form {
  radio #checked={picked} #name="plan"
}
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
    expect(radio!.getAttribute("name")).toBe("plan");
  });

  test("switch is a checkbox carrying role=switch", async () => {
    const h = createDOMHarness(
      `store on = true
layout form {
  switch #checked={on}
}
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
    expect(sw!.classList.contains("switch")).toBe(true);
  });

  test("textarea renders a real <textarea> whose value follows state", async () => {
    const h = createDOMHarness(
      `store notes = "Dear diary"
layout form {
  textarea #value={notes} #rows=4
}
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
    expect(ta!.value).toBe("Dear diary");
    expect(ta!.getAttribute("rows")).toBe("4");
  });

  test("`input #type=` narrows the generic input to any HTML type", async () => {
    const h = createDOMHarness(
      `store email = "a@b.co"
store when = "2026-07-24"
layout form {
  input #type="email" #value={email}
  input #type="date" #value={when}
  input #type="password"
}
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
    expect(h.overlay.querySelectorAll("input[type=text]").length).toBe(0);
  });

  test("the new widget builtins ship default styles", async () => {
    const h = createDOMHarness(
      `store on = true
store notes = "hi"
layout form {
  radio #checked={on}
  switch #checked={on}
  textarea #value={notes}
}
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
