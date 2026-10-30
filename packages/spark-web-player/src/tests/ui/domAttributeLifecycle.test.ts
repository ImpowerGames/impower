import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string, opts: any = { autoOpenAll: true }) {
  const h = createDOMHarness(src, 0, opts);
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

describe("attributes are removable across a live-preview edit", () => {
  test("editing `#disabled=true` to `false` re-enables the control", async () => {
    const h = await render(`layout main with
  button "Save" #disabled=true
end
`);
    const before = h.overlay.querySelector("button") as HTMLButtonElement;
    expect(before.hasAttribute("disabled")).toBe(true);

    await h.rerender(`layout main with
  button "Save" #disabled=false
end
`);
    const after = h.overlay.querySelector("button") as HTMLButtonElement;
    expect(after).toBe(before);
    expect(after.hasAttribute("disabled")).toBe(false);
  });

  test("deleting the only attribute clears it from the reused node", async () => {
    const h = await render(`layout main with
  link "Docs" #href="/docs"
end
`);
    const before = h.overlay.querySelector("a") as HTMLAnchorElement;
    expect(before.getAttribute("href")).toBe("/docs");

    await h.rerender(`layout main with
  link "Docs"
end
`);
    const after = h.overlay.querySelector("a") as HTMLAnchorElement;
    expect(after).toBe(before);
    expect(after.hasAttribute("href")).toBe(false);
  });
});

describe("an authored #id does not destroy its own element", () => {
  test("an input with #id survives the next render", async () => {
    const src = `layout main with
  input #id="name_field"
end
`;
    const h = await render(src);
    const before = h.overlay.querySelector("input") as HTMLInputElement;
    expect(before).toBeTruthy();
    expect(before.id).toBe("name_field");

    await h.rerender(src);
    const after = h.overlay.querySelector("input") as HTMLInputElement;
    expect(after).toBeTruthy();
    expect(after).toBe(before);
    expect(after.id).toBe("name_field");
  });

  test("a label's #for still resolves to the input it names", async () => {
    const h = await render(`layout main with
  label "Name" #for="name_field"
  input #id="name_field"
end
`);
    const label = h.overlay.querySelector("label") as HTMLLabelElement;
    expect(label.getAttribute("for")).toBe("name_field");
    expect(h.overlay.querySelector("#name_field")?.tagName).toBe("INPUT");
  });

  test("removing an authored #id reverts to the structural id, not to none", async () => {
    const h = await render(`layout main with
  input #id="name_field"
end
`);
    const before = h.overlay.querySelector("input") as HTMLInputElement;

    await h.rerender(`layout main with
  input
end
`);
    const after = h.overlay.querySelector("input") as HTMLInputElement;
    expect(after).toBe(before);
    expect(after.id).not.toBe("");
    expect(after.id).not.toBe("name_field");
  });
});

describe("#value is not clamped by the props authored after it", () => {
  test("`#value` before `#max` keeps its value", async () => {
    const h = await render(
      `store volume = 150
layout main with
  slider #value={volume} #min=0 #max=200
end
`,
      { reactive: true },
    );
    const slider = h.overlay.querySelector(
      "input[type=range]",
    ) as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.value).toBe("150");
  });

  test("the reordered spelling agrees with it", async () => {
    const h = await render(
      `store volume = 150
layout main with
  slider #min=0 #max=200 #value={volume}
end
`,
      { reactive: true },
    );
    const slider = h.overlay.querySelector(
      "input[type=range]",
    ) as HTMLInputElement;
    expect(slider.value).toBe("150");
  });
});
