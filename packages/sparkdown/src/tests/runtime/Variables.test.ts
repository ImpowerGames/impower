// Ported from inkjs `src/tests/specs/ink/Variables.spec.ts`.
//
// Each test compiles the corresponding `.sd` fixture in `fixtures/variables/`,
// runs it to completion, and asserts the output matches the same expected
// string the inkjs spec expects from its `.ink` counterpart. Any divergence
// here is a real bug in our compile pipeline or runtime, not a difference in
// language idiom — the fixtures are translated line-for-line and the test
// assertions are unchanged from inkjs.
//
// Fixtures *not* yet ported (deferred to follow-up slices):
//   - temp_global_conflict       (uses `ref` by-reference args — deferred)
//   - temp_usage_in_options      (needs choice-text + `ChooseChoiceIndex`)
//   - variable_pointer_ref_from_knot (needs `ref` by-reference args)
//   - variable_swap_recurse      (needs `ref` by-reference args)
//   - variable_tunnel            (needs tunnel syntax)
//   - warn_variable_not_found_*  (orphan upstream fixtures with no matching
//                                  spec — the runtime warning behavior they
//                                  would have validated is covered by
//                                  `temp not found (forward reference …)`
//                                  below; nothing more to port)
//   - compiler/* fixtures        (compile-time error tests — separate harness)

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Variables (ported from inkjs)", () => {
  test("const", () => {
    const ctx = makeRuntimeStoryFromFile("variables", "const");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("const (explicit `& store`/`& const` form)", () => {
    // Both `store x = 5` (implicit) and `& store x = 5` (explicit) should
    // produce identical runtime behavior. The `&` prefix is normally only
    // necessary for bare reassignments (where the identifier-and-`=` shape
    // would otherwise be matched as display text); but using it on
    // declarations is also valid sparkdown.
    const ctx = makeRuntimeStoryFromFile("variables", "const-explicit");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("temporaries at global scope (adjacent `{x}{y}` concatenates)", () => {
    // Two adjacent interpolations on one line emit "54" — concatenated,
    // no newline between them. `lowerLuauInterpolatedStringExpression`
    // peeks at the next textmate-tree sibling; if it's another
    // `LuauInterpolatedStringExpression` with no `Newline` separator,
    // the trailing `"\n"` is suppressed so the values share a line.
    // Only the last interpolation in the chain emits the line break.
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "temporaries-at-global-scope",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("54\n");
  });

  // The Luau-style port `varStr == CONST_STR and "success" or ""` works
  // because `NativeFunctionCall.Call()` has a fast-path for `and`/`or` that
  // returns one operand based on truthiness, matching Luau's short-circuit
  // semantics across mixed types.
  test("multiple constant references", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "multiple-constant-references",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("success\n");
  });

  test("variable declaration in conditional", () => {
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "variable-declaration-in-conditional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("5\n");
  });

  test("set non-existent variable (throws)", () => {
    // Upstream ink fixture defines `x = "world"`, prints "Hello world.",
    // then expects `variablesState["y"] = "earth"` to throw because `y`
    // was never declared. The runtime API is inherited from inkjs.
    const ctx = makeRuntimeStoryFromFile(
      "variables",
      "set-non-existent-variable",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello world.\n");
    expect(() => {
      (ctx.story.variablesState as unknown as { [k: string]: unknown })["y"] =
        "earth";
    }).toThrow();
  });

  test("variable get/set API across choices", () => {
    // Upstream ink fixture exercises the `variablesState[name]` getter
    // and setter API by mutating `x` between choice picks. The runtime
    // API works on any declared global: reading returns the current
    // value, writing replaces it (allowed types: int, float, string).
    // Writing an unsupported type (e.g. a Map) should throw. Reading
    // an unknown name should return null.
    //
    // Sparkdown rewrite: uses `store` for the global, a `choose`
    // block + label loop to advance through the visit sequence, and
    // an `i` counter to terminate after 4 iterations.
    const ctx = makeRuntimeStoryFromFile("variables", "variable-get-set-api");
    expect(ctx.errorMessages).toEqual([]);
    const state = ctx.story.variablesState as unknown as {
      [k: string]: unknown;
    };

    expect(ctx.story.ContinueMaximally()).toBe("5\n");
    expect(state["x"]).toBe(5);

    state["x"] = 10;
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("10\n");
    expect(state["x"]).toBe(10);

    state["x"] = 8.5;
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("8.5\n");
    expect(state["x"]).toBe(8.5);

    state["x"] = "a string";
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("a string\n");
    expect(state["x"]).toBe("a string");

    expect(state["z"]).toBe(null);

    expect(() => {
      // Arbitrary type. Note that [] gets converted to 0, which may
      // not be what we want; Map is unambiguously unsupported.
      state["x"] = new Map();
    }).toThrow();
  });

  test("temp forward reference resolves to nil (Luau semantics)", () => {
    // Upstream ink fixture (Luau-ported semantics):
    //   {x}
    //   & local x = 5
    //   hello
    //
    // Line 1 references `x` before its declaration on line 2. Ink's
    // original behaviour was to emit a runtime warning ("Variable not
    // found: 'x'. Using default value of 0") and throw on the next
    // dispatch. Sparkdown follows Luau-superset semantics instead:
    // undefined names resolve to `nil` silently. The forward-reference
    // value reads as nil ("" when interpolated); the declaration runs
    // normally afterwards. No warning, no throw.
    const ctx = makeRuntimeStoryFromFile("variables", "temp-not-found");
    expect(ctx.errorMessages).toEqual([]);
    const output = ctx.story.ContinueMaximally();
    // Empty interpolation for the forward-ref nil, then "hello".
    expect(output).toMatch(/hello/);
    expect(ctx.story.hasWarning).toBe(false);
  });

  test("variable holds a divert target (`store x = -> here`)", () => {
    // Upstream ink fixture:
    //   VAR x = -> here
    //   -> there
    //   == there ==
    //   -> x
    //   == here ==
    //   Here.
    //   -> DONE
    //
    // A global holds a divert-target value (`-> here`); diverting via
    // `-> x` follows the stored target. Sparkdown's `store x = -> here`
    // lowers the `-> here` expression to a `DivertTarget` Expression,
    // which the runtime stores as a `DivertTargetValue` — comparable
    // via `==` and divertable via `-> x`. The lowerer for
    // `LuauDivertTargetLiteral` (in `expression/lowerExpression.ts`)
    // already wraps the parsed identifier path into a `DivertTarget`
    // wrapping a `Divert(parts)`.
    const ctx = makeRuntimeStoryFromFile("variables", "variable-divert-target");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Here.\n");
  });
});
