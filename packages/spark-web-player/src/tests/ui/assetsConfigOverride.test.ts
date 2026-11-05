import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

function source(defines: string): string {
  return [
    defines,
    "layout main {",
    "  column {",
    '    text "hello"',
    "  }",
    "}",
  ].join("\n");
}

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks();
  return h;
}

describe("overriding the assets config", () => {
  test("a project define replaces the builtin's value and keeps the rest", async () => {
    const h = await render(
      source(`define assets as config with\n  loading_min = 1\nend\n`),
    );
    const assets = (h.game as any)?.context?.config?.assets;
    expect(assets?.loading_min).toBe(1);
    expect(assets?.predict_distance).toBe(32);
    expect(assets?.predict_cache_size).toBe(300);
    expect(assets?.load_cache_size).toBe(0);
    expect(assets?.loading_transition).toBe("fade");
    expect(h.game.module.assets.config.loading_min).toBe(1);
  });

  test("compile-time context and the runtime table agree", async () => {
    const h = await render(
      source(`define assets as config with\n  predict_distance = 4\nend\n`),
    );
    const game = h.game as any;
    expect(game?.program?.context?.config?.assets?.predict_distance).toBe(4);
    expect(game?.context?.config?.assets?.predict_distance).toBe(4);
  });
});
