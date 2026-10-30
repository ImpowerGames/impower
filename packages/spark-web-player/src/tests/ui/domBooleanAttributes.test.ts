import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { reactive: true, autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

describe("a false boolean prop leaves the control usable", () => {
  test("input #disabled={false} is enabled", async () => {
    const h = await render(`store locked = false
layout main with
  input #disabled={locked}
end
`);
    const input = h.overlay.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(input.disabled).toBe(false);
  });

  test("textarea #readonly={false} is editable", async () => {
    const h = await render(`store locked = false
layout main with
  textarea #readonly={locked}
end
`);
    const ta = h.overlay.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(ta.readOnly).toBe(false);
  });

  test("dropdown #disabled={false} is enabled", async () => {
    const h = await render(`store locked = false
layout main with
  dropdown #disabled={locked} {
    option "One"
    option "Two"
  }
end
`);
    const select = h.overlay.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.disabled).toBe(false);
  });

  test("option #disabled={false} is selectable", async () => {
    const h = await render(`store locked = false
layout main with
  dropdown {
    option "One" #disabled={locked}
  }
end
`);
    const opt = h.overlay.querySelector("option") as HTMLOptionElement;
    expect(opt).toBeTruthy();
    expect(opt.disabled).toBe(false);
  });

  test("input #disabled={true} is still disabled", async () => {
    const h = await render(`store locked = true
layout main with
  input #disabled={locked}
end
`);
    const input = h.overlay.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
