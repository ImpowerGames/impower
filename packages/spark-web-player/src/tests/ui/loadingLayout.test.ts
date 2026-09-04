// The built-in `loading` layout as the DOM sees it: its tree, its stacking
// above every other layout, and the progress it takes from the reactive
// `game.loading` table, which a replaced tree can bind as well.

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
  });

  test("scales the built-in bar from game.loading", async () => {
    const h = await render(STORY);
    const fill = h.overlay.querySelector(".loading_fill") as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill!.style.transform).toBe("scaleX(0)");
    (h.game.module.ui as any).updateLoading({ loaded: 1, total: 4 });
    await flushMicrotasks(20);
    expect(fill!.style.transform).toBe("scaleX(0.25)");
    (h.game.module.ui as any).updateLoading({ loaded: 4, total: 4 });
    await flushMicrotasks(20);
    expect(fill!.style.transform).toBe("scaleX(1)");
  });

  test("lets a replaced tree bind the progress itself", async () => {
    const h = await render(
      `layout loading with\n  text "Loading {game.loading.percent}%"\nend\n\n${STORY}`,
    );
    const root = h.overlay.querySelector(".loading") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.querySelector(".loading_fill")).toBeNull();
    expect(root!.textContent).toContain("Loading 0%");
    (h.game.module.ui as any).updateLoading({ loaded: 1, total: 4 });
    await flushMicrotasks(20);
    expect(root!.textContent).toContain("Loading 25%");
  });
});
