// Phase 4 I8: dep-gated refresh.
//
// refreshScreens now takes the turn's change-set (globals + tables written since
// the last refresh) and re-evaluates a binding only when its read deps intersect
// it. We prove the GATING (not just the equality-gated output) by spying on
// EvaluateFunction: a binding whose deps didn't change is never called.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

function exprId(program: any, screen: string, childIndex: number): string {
  const node = program.sparkle.screens[screen].children[childIndex];
  return node.content.find((p: any) => p.kind === "binding").binding.exprId;
}

/** Install a counting spy over story.EvaluateFunction; returns the call map. */
function spyEvalFunction(h: UIHarness): Record<string, number> {
  const story: any = h.game.story;
  const calls: Record<string, number> = {};
  const orig = story.EvaluateFunction.bind(story);
  story.EvaluateFunction = (name: string, args: any[] = []) => {
    calls[name] = (calls[name] ?? 0) + 1;
    return orig(name, args);
  };
  return calls;
}

const run = (h: UIHarness, fn: string): void =>
  (h.game.story as any).EvaluateFunction(fn, []);
const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshScreens();
const updates = (h: UIHarness): string[] =>
  h
    .snapshotFiltered("ui/update")
    .map((m: any) => m.params?.content?.text)
    .filter((t: any) => typeof t === "string");

describe("dep-gated refresh (Phase 4 I8)", () => {
  test("only the binding whose global changed is re-evaluated", async () => {
    const h = createHarness(
      `store a = 1
store b = 2
function bumpA()
  a = a + 1
end
screen hud with
  text "a={a}"
  text "b={b}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const program = h.game.program as any;
    const aId = exprId(program, "hud", 0);
    const bId = exprId(program, "hud", 1);

    h.reset();
    const calls = spyEvalFunction(h);
    run(h, "bumpA"); // a → 2 (a global change)
    refresh(h);

    // a's binding re-evaluated; b's binding skipped (its dep didn't change).
    expect(calls[aId]).toBeGreaterThanOrEqual(1);
    expect(calls[bId] ?? 0).toBe(0);
    expect(updates(h)).toContain("a=2");
    expect(updates(h)).not.toContain("b=2");
  });

  test("a table-field write re-evaluates only the binding that read that table", async () => {
    const h = createHarness(
      `store player = { hp = 100 }
store score = 0
function hurt()
  player.hp = player.hp - 10
end
screen hud with
  text "hp={player.hp}"
  text "score={score}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const program = h.game.program as any;
    const hpId = exprId(program, "hud", 0);
    const scoreId = exprId(program, "hud", 1);

    h.reset();
    const calls = spyEvalFunction(h);
    run(h, "hurt"); // player.hp = 90 (a table-field change, no global change)
    refresh(h);

    expect(calls[hpId]).toBeGreaterThanOrEqual(1);
    expect(calls[scoreId] ?? 0).toBe(0);
    expect(updates(h)).toContain("hp=90");
  });

  test("unrelated change re-evaluates nothing", async () => {
    const h = createHarness(
      `store a = 1
store b = 2
function bumpHidden()
  b = b
end
screen hud with
  text "a={a}"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const program = h.game.program as any;
    const aId = exprId(program, "hud", 0);

    h.reset();
    const calls = spyEvalFunction(h);
    // Touch only `b`, which no shown binding reads.
    (h.game.story as any).variablesState.$("b", 5);
    refresh(h);

    expect(calls[aId] ?? 0).toBe(0);
    expect(h.snapshotFiltered("ui/update")).toEqual([]);
  });
});
