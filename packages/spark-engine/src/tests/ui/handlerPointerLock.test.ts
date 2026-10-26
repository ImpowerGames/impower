// An element with an event handler takes the pointer through the
// `data-ui-handler` marker, which a builtin rule opts in at the lowest
// specificity, never through an inline style: an inline `pointer-events: auto`
// would outrank the element's own `interactable = false`, whether a prop or a
// class (at any breakpoint or state) sets it.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const writes = (h: UIHarness): any[] =>
  h
    .snapshotFiltered("ui/")
    .filter((m: any) => m.method === "ui/create" || m.method === "ui/update")
    .map((m: any) => m.params);

const pointerStyles = (h: UIHarness, element: string) =>
  writes(h)
    .filter((p) => p.element === element)
    .map((p) => p.style?.pointer_events)
    .filter((v) => v !== undefined);

const marked = (h: UIHarness, element: string) =>
  writes(h).some(
    (p) => p.element === element && p.attributes?.["data-ui-handler"] === "",
  );

const created = (h: UIHarness, type: string): any[] =>
  h
    .snapshotFiltered("ui/create")
    .map((m: any) => m.params)
    .filter((p: any) => p.type === type);

describe("handler pointer lock", () => {
  test("a handler marks its element and never writes an inline pointer", async () => {
    const h = createHarness(
      `store x = false
store n = 0
style locked with
  interactable = false
end
layout main with
  checkbox #interactable=false @change={ x = event.checked }
  checkbox.locked @change={ x = event.checked }
  checkbox @change={ x = event.checked }
  button #interactable=false @click={ n = n + 1 }
  button.locked @click={ n = n + 1 }
  button @click={ n = n + 1 }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const elements = [...created(h, "input"), ...created(h, "button")];
    expect(elements).toHaveLength(6);
    for (const el of elements) {
      expect(pointerStyles(h, el.element)).toEqual([]);
      expect(marked(h, el.element)).toBe(true);
    }
    // The prop lock reaches the page as the element's own inline style.
    expect(elements[0].style?.interactable).toBe("false");
    expect(elements[3].style?.interactable).toBe("false");
    expect(h.observedElementIds()).toHaveLength(6);
  });

  test("a bound lock follows its binding from mount", async () => {
    const h = createHarness(
      `store locked = true
store n = 0
layout main with
  button #interactable={not locked} @click={ n = n + 1 }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [button] = created(h, "button");
    expect(button.style?.interactable).toBe("false");
    expect(pointerStyles(h, button.element)).toEqual([]);
    (h.game.story as any).variablesState.$("locked", false);
    (h.game.module.ui as any).refreshLayouts();
    const last = writes(h)
      .filter((p) => p.element === button.element && p.style?.interactable)
      .at(-1);
    expect(last.style.interactable).toBe("true");
  });

  test("an observed element keeps its prop lock", async () => {
    const h = createHarness(
      `layout main with
  box.target #interactable=false
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [target] = created(h, "div").filter((p) =>
      String(p.name).includes("target"),
    );
    expect(target.style?.interactable).toBe("false");
    // The path a story's choices take (`Coordinator` observes `choice N`).
    const found = (h.game.module.ui as any).observe("click", "target", () => {});
    expect(found).toBe(true);
    (h.game.module.ui as any).flushUIBatch();
    expect(pointerStyles(h, target.element)).toEqual([]);
    expect(marked(h, target.element)).toBe(true);
  });
});
