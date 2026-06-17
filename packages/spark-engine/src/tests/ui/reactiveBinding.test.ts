import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

// Phase 3 I0: program.sparkle (the reactive AST) reaches the engine, and the
// hoisted `__binding_<offset>() return <expr> end` evaluators the compiler
// emitted are callable via story.EvaluateFunction — proving the binding-eval
// path end-to-end (the compiler-side tests compile bindings but never run them).

/** First `{expr}` Binding found in a screen's AST (DFS over content + control
 *  nodes), or undefined. */
function findFirstBinding(sparkle: any): any {
  const walk = (nodes: any[] | undefined): any => {
    for (const n of nodes ?? []) {
      for (const part of n.content ?? []) {
        if (part.kind === "binding") return part.binding;
      }
      for (const b of n.branches ?? []) {
        const f = walk(b.children);
        if (f) return f;
      }
      for (const c of n.cases ?? []) {
        const f = walk(c.children);
        if (f) return f;
      }
      const inChildren = walk(n.children);
      if (inChildren) return inChildren;
      const inElse = walk(n.else);
      if (inElse) return inElse;
    }
    return undefined;
  };
  for (const screen of Object.values(sparkle?.screens ?? {})) {
    const f = walk((screen as any).children);
    if (f) return f;
  }
  return undefined;
}

describe("UIModule.evalBinding (Phase 3 I0)", () => {
  test("evaluates a hoisted {expr} binding to its live value", async () => {
    const h = createHarness(`store hp = 100
screen hud with
  text "HP: {hp}"
end
`);
    await h.ready;
    const binding = findFirstBinding((h.game.program as any).sparkle);
    expect(binding?.exprId).toMatch(/^__binding_\d+$/);
    // The screen need not be shown — the evaluator is a top-level story knot,
    // and the global `hp` is initialized at story load.
    const value = (h.game.module.ui as any).evalBinding(binding);
    expect(value).toBe(100);
  });

  test("returns undefined for a binding the story never hoisted (HasFunction guard)", () => {
    const h = createHarness(`screen hud with
  text "static"
end
`);
    const value = (h.game.module.ui as any).evalBinding({
      exprId: "__binding_999999",
      source: "",
      span: { line: 0, from: 0, to: 0 },
    });
    expect(value).toBeUndefined();
  });
});
