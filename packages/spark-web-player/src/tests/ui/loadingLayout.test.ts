// The built-in `loading` layout as the DOM sees it: its tree, its stacking
// above every other layout, and the progress variable the engine writes on
// its root, which a replaced tree still receives.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return h;
}

function sheet(h: { overlay: HTMLElement }): string {
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

const STORY = `scene A
  Hello.
end
`;

describe("the loading layout", () => {
  test("mounts its default tree", async () => {
    const h = await render(STORY);
    const root = h.overlay.querySelector(".loading");
    expect(root).not.toBeNull();
    expect(root!.querySelector(".loading_backdrop")).not.toBeNull();
    expect(
      root!.querySelector(".loading_content > .loading_bar > .loading_fill"),
    ).not.toBeNull();
  });

  test("stacks above every other layout by its own z-index", async () => {
    const h = await render(STORY);
    const css = sheet(h);
    expect(css).toMatch(/\.loading\s*\{[^}]*z-index:\s*1000/);
    expect(css).not.toMatch(/\.main\s*\{[^}]*z-index/);
    expect(css).toMatch(/\.loading_fill\s*\{[^}]*var\(--loading_progress,\s*0\)/);
  });

  test("receives progress on its root, even when the author replaced the tree", async () => {
    const h = await render(
      `layout loading with\n  text "Please wait"\nend\n\n${STORY}`,
    );
    const root = h.overlay.querySelector(".loading") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.querySelector(".loading_fill")).toBeNull();
    (h.game.module.ui as any).updateLoading({ loaded: 1, total: 4 });
    await flushMicrotasks(20);
    expect(root!.style.getPropertyValue("--loading_progress")).toBe("0.25");
  });
});
