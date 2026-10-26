// An element with an event handler takes the pointer, unless it decides its own
// pointer: an `interactable` prop or a class that locks it with
// `interactable = false`. The handler's opt-in is an inline style, which would
// outrank either lock.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const updates = (h: UIHarness): any[] =>
  h
    .snapshotFiltered("ui/")
    .filter((m: any) => m.method === "ui/create" || m.method === "ui/update")
    .map((m: any) => m.params);

const pointerStyles = (h: UIHarness, element: string) =>
  updates(h)
    .filter((p) => p.element === element)
    .map((p) => p.style?.pointer_events)
    .filter((v) => v !== undefined);

const created = (h: UIHarness, type: string): any[] =>
  h
    .snapshotFiltered("ui/create")
    .map((m: any) => m.params)
    .filter((p: any) => p.type === type);

describe("handler pointer lock", () => {
  test("a bare widget locked by a prop or a class keeps its lock", async () => {
    const h = createHarness(
      `store x = false
style locked with
  interactable = false
end
layout main with
  checkbox #interactable=false @change={ x = event.checked }
  checkbox.locked @change={ x = event.checked }
  checkbox @change={ x = event.checked }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [byProp, byClass, open] = created(h, "input");
    expect(byProp.style?.interactable).toBe("false");
    expect(pointerStyles(h, byProp.element)).toEqual([]);
    expect(byClass.name).toContain("locked");
    expect(pointerStyles(h, byClass.element)).toEqual([]);
    // A handler-only widget still opts itself in.
    expect(pointerStyles(h, open.element)).toEqual(["auto"]);
    expect(h.observedElementIds()).toHaveLength(3);
  });

  test("a bare element locked by a prop or a class keeps its lock", async () => {
    const h = createHarness(
      `store n = 0
style locked with
  interactable = false
end
layout main with
  button #interactable=false @click={ n = n + 1 }
  button.locked @click={ n = n + 1 }
  button @click={ n = n + 1 }
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const [byProp, byClass, open] = created(h, "button");
    expect(pointerStyles(h, byProp.element)).toEqual([]);
    expect(pointerStyles(h, byClass.element)).toEqual([]);
    expect(pointerStyles(h, open.element)).toEqual(["auto"]);
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
    const last = updates(h)
      .filter((p) => p.element === button.element && p.style?.interactable)
      .at(-1);
    expect(last.style.interactable).toBe("true");
  });
});
