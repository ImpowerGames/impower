// `define assets as config` rides the same override path as `config.ui`: an
// authored key replaces the builtin's value, the keys left out keep theirs,
// and the compile-time context agrees with the runtime table. The TypeScript
// mirror the engine falls back on must match the prelude.

import { assetsBuiltinDefinitions } from "@impower/spark-engine/src/game/modules/assets/assetsBuiltinDefinitions";
import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

function source(defines: string): string {
  return [
    defines,
    "layout main with",
    "  column:",
    '    text "hello"',
    "end",
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

  test("the prelude and the engine's mirror carry the same defaults", async () => {
    const h = await render(source(""));
    const runtime = (h.game as any)?.context?.config?.assets;
    const mirror = assetsBuiltinDefinitions().config.assets;
    expect(runtime).toMatchObject(mirror);
    // Both ways: a key added to one side and not the other is a drift.
    const runtimeKeys = Object.keys(runtime ?? {})
      .filter((k) => !k.startsWith("$"))
      .sort();
    expect(runtimeKeys).toEqual(Object.keys(mirror).sort());
  });
});
