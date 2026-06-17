// Phase 4 I7: the fine-grained change primitive + read-tracking.
//
// VariablesState now accumulates (while reactiveDepsEnabled) the global names +
// table identities that change, and — bracketed by begin/endReactiveRead — the
// globals + tables a single binding evaluation READS. The reactive runtime
// re-runs a binding only when its read-set intersects the change-set. A
// table-field write (`player.hp = 5`) mutates in place and fires no global
// change, so it must register as a TABLE change keyed by identity.

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

function bindingAt(program: any, screen: string, childIndex: number): any {
  const node = program.sparkle.screens[screen].children[childIndex];
  return node.content.find((p: any) => p.kind === "binding").binding;
}

describe("reactive dependency primitive (Phase 4 I7)", () => {
  test("read-tracking captures a binding's global + table deps", async () => {
    const h = createHarness(
      `store hp = 100
store player = { hp = 50 }
screen hud with
  text "{hp}"
  text "{player.hp}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const story: any = h.game.story;
    const vs = story.variablesState;
    vs.reactiveDepsEnabled = true;
    const program = h.game.program as any;

    vs.beginReactiveRead();
    story.EvaluateFunction(bindingAt(program, "hud", 0).exprId, []);
    const hpDeps = vs.endReactiveRead();
    expect(hpDeps.globals.has("hp")).toBe(true);

    vs.beginReactiveRead();
    story.EvaluateFunction(bindingAt(program, "hud", 1).exprId, []);
    const playerDeps = vs.endReactiveRead();
    // `{player.hp}` depends on the global `player` AND the table it read into.
    expect(playerDeps.globals.has("player")).toBe(true);
    expect(playerDeps.tables.size).toBeGreaterThan(0);
  });

  test("a global write registers as a global change", async () => {
    const h = createHarness(
      `store hp = 100
screen hud with
  text "{hp}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const vs = (h.game.story as any).variablesState;
    vs.reactiveDepsEnabled = true;
    vs.takeReactiveChanges(); // clear residue
    vs.$("hp", 42);
    const changes = vs.takeReactiveChanges();
    expect(changes.globals.has("hp")).toBe(true);
  });

  test("a table-field write registers as a table change matching the read dep", async () => {
    const h = createHarness(
      `store player = { hp = 50 }
function hurt()
  player.hp = 10
end
screen hud with
  text "{player.hp}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const story: any = h.game.story;
    const vs = story.variablesState;
    vs.reactiveDepsEnabled = true;
    const program = h.game.program as any;

    // Capture the binding's read deps.
    vs.beginReactiveRead();
    story.EvaluateFunction(bindingAt(program, "hud", 0).exprId, []);
    const deps = vs.endReactiveRead();

    // Mutate player.hp via a function (a StoreIndex on the player table).
    vs.takeReactiveChanges(); // clear
    story.EvaluateFunction("hurt", []);
    const changes = vs.takeReactiveChanges();

    // The whole-global `player` did NOT change — only the table did.
    expect(changes.globals.has("player")).toBe(false);
    expect(changes.tables.size).toBeGreaterThan(0);
    // The field write's table identity intersects the binding's read deps.
    const intersects = [...changes.tables].some((t) => deps.tables.has(t));
    expect(intersects).toBe(true);
  });

  test("tracking is off by default (no accumulation for non-reactive games)", async () => {
    const h = createHarness(
      `store hp = 100
screen hud with
  text "{hp}"
end
`,
    );
    await h.ready;
    const vs = (h.game.story as any).variablesState;
    expect(vs.reactiveDepsEnabled).toBe(false);
    vs.$("hp", 7);
    const changes = vs.takeReactiveChanges();
    expect(changes.globals.size).toBe(0);
  });
});
