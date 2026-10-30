import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

function bindingAt(program: any, screen: string, childIndex: number): any {
  const node = program.sparkle.layouts[screen].children[childIndex];
  return node.content.find((p: any) => p.kind === "binding").binding;
}

describe("reactive dependency primitive (Phase 4 I7)", () => {
  test("read-tracking captures a binding's global + table deps", async () => {
    const h = createHarness(
      `store hp = 100
store player = { hp = 50 }
layout hud with
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
    expect(playerDeps.globals.has("player")).toBe(true);
    expect(playerDeps.tables.size).toBeGreaterThan(0);
  });

  test("a global write registers as a global change", async () => {
    const h = createHarness(
      `store hp = 100
layout hud with
  text "{hp}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const vs = (h.game.story as any).variablesState;
    vs.reactiveDepsEnabled = true;
    vs.takeReactiveChanges();
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
layout hud with
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
    const deps = vs.endReactiveRead();

    vs.takeReactiveChanges();
    story.EvaluateFunction("hurt", []);
    const changes = vs.takeReactiveChanges();

    expect(changes.globals.has("player")).toBe(false);
    expect(changes.tables.size).toBeGreaterThan(0);
    const intersects = [...changes.tables].some((t) => deps.tables.has(t));
    expect(intersects).toBe(true);
  });

  test("dep tracking is enabled once reactive screens mount", async () => {
    const h = createHarness(
      `store hp = 100
layout hud with
  text "{hp}"
end
`,
    );
    await h.ready;
    const vs = (h.game.story as any).variablesState;
    expect(vs.reactiveDepsEnabled).toBe(true);
    vs.$("hp", 7);
    const changes = vs.takeReactiveChanges();
    expect(changes.globals.has("hp")).toBe(true);
  });
});
