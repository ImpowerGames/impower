// Attribute lifecycle in the RENDERER (UIManager), not the engine.
//
// Three defects that share a shape: the emitted message stream is correct and
// `outerHTML` looks plausible, but the DOM the user actually interacts with is
// wrong. None of them can be caught by a snapshot.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string, opts: any = { autoOpenAll: true }) {
  const h = createDOMHarness(src, 0, opts);
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

describe("attributes are removable across a live-preview edit", () => {
  // The create path guarded `applyAttribute` with `if (v != null)`, and the
  // null branch is the ONLY path that removes. On a REUSED node — which is
  // every node in a live-preview edit — a dropped attribute therefore stuck.
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
    // Same node reused — this is a patch, not a rebuild.
    expect(after).toBe(before);
    expect(after.hasAttribute("disabled")).toBe(false);
  });

  // The harder half: deleting the LAST attribute means `params.attributes` is
  // absent entirely, so a pass driven only by its contents never runs.
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
  // `el.id` was both the author's to set and the reconcile's addressing key.
  // The next pass adopted the AUTHORED id as a stale candidate while the create
  // stream only ever marks the STRUCTURAL one, so the sweep removed a live
  // element: the input was there on pass 1 and gone on pass 2.
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
    // The point of the test: `after` was null before the fix.
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
    // An element with no id at all is unaddressable by the reconcile and by
    // `getElement`'s DOM fallback.
    expect(after.id).not.toBe("");
    expect(after.id).not.toBe("name_field");
  });
});

describe("#value is not clamped by the props authored after it", () => {
  // `value` is written to the LIVE DOM PROPERTY, which the browser sanitizes
  // against the element's CURRENT min/max. Applying it before `#max` clamped it
  // to the default max of 100 — and `outerHTML` is byte-identical either way,
  // which is why no snapshot could see it.
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
