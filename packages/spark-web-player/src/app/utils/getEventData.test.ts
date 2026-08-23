// The engine keys its `_events` handler registry by the STRUCTURAL element id
// (stamped as the `__sdId` JS property by UIManager), while the DOM `id`
// attribute belongs to the author — `#id="save_btn"` legitimately overwrites
// it. `getEventData` must therefore report the structural id, or an element
// with both an authored `#id` and an `@event` has a handler that silently
// never fires (the engine's `_events[type][currentTargetId]` lookup misses).

import { describe, expect, it } from "vitest";
import { getEventData } from "./getEventData";

const elementWith = (domId: string, structuralId?: string) => {
  const el = document.createElement("button");
  el.id = domId;
  if (structuralId !== undefined) {
    (el as any).__sdId = structuralId;
  }
  return el;
};

/** Dispatch a real DOM event so `currentTarget` is populated during the
 *  listener, and capture what `getEventData` reports there. */
const capture = (el: HTMLElement, event: Event): any => {
  let data: any;
  const listener = (e: Event) => {
    data = getEventData(e);
  };
  el.addEventListener(event.type, listener);
  el.dispatchEvent(event);
  el.removeEventListener(event.type, listener);
  return data;
};

describe("getEventData structural ids", () => {
  it("reports the structural id when an authored #id owns the DOM id", () => {
    const el = elementWith("save_btn", "e-layouts-0-main-0-button-0");
    const data = capture(el, new MouseEvent("click", { bubbles: true }));
    expect(data.type).toBe("click");
    expect(data.currentTargetId).toBe("e-layouts-0-main-0-button-0");
    expect(data.targetId).toBe("e-layouts-0-main-0-button-0");
  });

  it("falls back to the DOM id for elements the UIManager never stamped", () => {
    const el = elementWith("plain");
    const data = capture(el, new MouseEvent("click", { bubbles: true }));
    expect(data.currentTargetId).toBe("plain");
  });

  it("uses the structural id on the input/change branch (two-way binding)", () => {
    const el = elementWith("name_field", "e-layouts-0-main-0-input-0");
    const data = capture(el, new Event("input", { bubbles: true }));
    expect(data.type).toBe("input");
    expect(data.currentTargetId).toBe("e-layouts-0-main-0-input-0");
  });

  it("keeps the structural id on the terminal fallback branch (scroll)", () => {
    // The fallback must also carry `type` — `UIModule` dispatches on it, and
    // omitting it made `@scroll` handlers never fire (#311.2).
    const el = elementWith("scroll_box", "e-layouts-0-main-0-scroller-0");
    const data = capture(el, new Event("scroll", { bubbles: true }));
    expect(data.type).toBe("scroll");
    expect(data.currentTargetId).toBe("e-layouts-0-main-0-scroller-0");
  });
});
