import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

// A pure UI-only project (a `layout` whose only path-located flows are the
// synthetic `__binding_*` evaluators the compiler hoists for `{interpolations}`
// and `@event` handlers) has NO narrative path to preview: `findClosestPath`
// excludes bindings, so `game.preview()` finds nothing and returns early.
//
// The layouts LAYER is created (at connect) with `opacity: 0` and is only
// revealed to `opacity: 1` by a content beat (the Coordinator's per-beat reveal)
// or the UI-only `continue()` fallback — NEITHER of which runs when there is no
// beat. So without an explicit reveal on the no-path preview branch, the whole
// layer stays transparent and the screen renders invisibly even though its DOM
// (main -> column -> text/button) is fully mounted.
//
// This drives the REAL engine -> REAL player `UIManager` (jsdom) and asserts the
// mounted UI is actually visible after a preview.
describe("preview of a UI-only layout reveals it in the player DOM", () => {
  test("preview() reveals the layouts layer (no manual reveal)", async () => {
    const src = `store hp = 5
layout main with
  column #child-gap=8 #padding=24:
    text "HP: {hp}"
    button "Go"
end
`;
    const h = createDOMHarness(src, 0, { autoOpenAll: true });
    await h.ready;
    h.preview(0);
    await flushMicrotasks(10);

    const layer = h.overlay.querySelector(".layouts");
    const col = h.overlay.querySelector(".column");

    // The layer must be revealed (opacity:1) so the UI is actually visible.
    expect(layer?.getAttribute("style")).toContain("opacity: 1");
    // And the content column must not be hidden.
    expect(col?.getAttribute("style") ?? "").not.toContain("display: none");
    // The interpolated content rendered.
    expect((h.overlay.querySelector(".main")?.textContent ?? "").trim()).toBe(
      "HP: 5Go",
    );
  });
});
