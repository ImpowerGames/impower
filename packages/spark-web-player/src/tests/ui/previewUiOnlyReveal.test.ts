import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

describe("preview of a UI-only layout reveals it in the player DOM", () => {
  test("preview() reveals the layouts layer (no manual reveal)", async () => {
    const src = `store hp = 5
layout main with
  column #child-gap=8 #padding=24 {
    text.h1 "Sparkle x Pico"
    text "HP: {hp}"
    button "Go"
  }
end
`;
    const h = createDOMHarness(src, 0, { autoOpenAll: true });
    await h.ready;
    await h.preview(0);
    await flushMicrotasks(10);

    const layer = h.overlay.querySelector(".layouts");
    const col = h.overlay.querySelector(".column");

    expect(layer?.getAttribute("style")).toContain("opacity: 1");
    expect(col?.getAttribute("style") ?? "").not.toContain("display: none");
    expect((h.game as any).module.ui.getTransientTargets()).toEqual([]);
    expect((h.overlay.querySelector(".main")?.textContent ?? "").trim()).toBe(
      "Sparkle x PicoHP: 5Go",
    );
  });
});
