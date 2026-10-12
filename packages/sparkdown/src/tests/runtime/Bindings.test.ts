// Ported from inkjs `src/tests/specs/ink/Bindings.spec.ts`.
//
// Sparkdown's surface for declaring an EXTERNAL host-bound function is
// the lowercase single-line form:
//
//     external message(x)
//     external multiply(x, y)
//     external times(i, str)
//
// Allowed only at top level (file scope). The declaration registers a
// signature with the parsed-hierarchy `Story.externals` map. At each call
// site (`& message("hi")` or `{multiply(5,3)}`) the regular `FunctionCall`
// → `Divert` lowering already checks `Story.IsExternal(name)` and flips
// the runtime `Divert.isExternal = true` flag — no separate call-site
// machinery is needed.
//
// The stories run on the program engine, which carries no external function
// and presents no variable observer (docs/engine/binary-program.md, section
// 9); the test harness writes each `external` as a function that calls the
// host function the test binds (`withTestExternals`), so these tests keep
// what a binding returns and how often it runs.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Bindings (ported from inkjs)", () => {
  test("external bindings (BindExternalFunction across return/side-effect shapes)", () => {
    // Upstream ink fixture declares three externals and uses them in
    // both side-effect form (`& message("hello world")` — discards
    // return) and value form (`{multiply(5.0, 3)}`, `{times(3, ...)}`).
    // `message` writes to a host-captured variable, `multiply` returns
    // a number, `times` returns a string. The runtime walks the
    // function-call site through `CallExternalFunction`, pops the
    // arguments, invokes the bound host function, and pushes the
    // (coerced) return value onto the evaluation stack.
    const ctx = makeRuntimeStoryFromFile("bindings", "external-binding");
    expect(ctx.errorMessages).toEqual([]);

    let testExternalBindingMessage = "";

    ctx.story.BindExternalFunction("message", (arg: unknown) => {
      testExternalBindingMessage = "MESSAGE: " + arg;
    });

    ctx.story.BindExternalFunction(
      "multiply",
      (arg1: number, arg2: number) => arg1 * arg2,
    );

    ctx.story.BindExternalFunction(
      "times",
      (numberOfTimes: number, stringValue: string) => {
        let result = "";
        for (let i = 0; i < numberOfTimes; i++) result += stringValue;
        return result;
      },
    );

    expect(ctx.story.Continue()).toBe("15\n");
    expect(ctx.story.Continue()).toBe("knock knock knock\n");
    expect(testExternalBindingMessage).toBe("MESSAGE: hello world");
  });

  test("host ↔ sparkdown round-trip (BindExternalFunction + EvaluateFunction recursion)", () => {
    // Upstream ink fixture's `topExternal` emitted narrative AND
    // returned a value (knot-function form). Sparkdown `function ...
    // end` is pure (no narrative emission inside the body — see
    // Functions.test.ts > function purity), so we drop the narrative
    // and keep the return value. The interesting behavior the test
    // pins — host external calling back into a sparkdown function via
    // `EvaluateFunction` mid-call — is unchanged: 5 →
    // `topExternal(5)` (sparkdown function) → `gameInc(5)` (host
    // external) → `gameInc` calls back into `EvaluateFunction("inkInc",
    // [5+1=6])` → `inkInc` returns 7 → bubbles up as the final return.
    // The `output` field comes back empty in sparkdown's pure-function
    // model — that's the documented divergence.
    const ctx = makeRuntimeStoryFromFile("bindings", "game-ink-back-and-forth");
    expect(ctx.errorMessages).toEqual([]);

    ctx.story.BindExternalFunction("gameInc", (x: number) => {
      const incremented = x + 1;
      return ctx.story.EvaluateFunction("inkInc", [incremented]);
    });

    const finalResult = ctx.story.EvaluateFunction("topExternal", [5], true) as {
      returned: unknown;
      output: string;
    };

    expect(finalResult.returned).toBe(7);
    // Sparkdown divergence: pure functions emit no narrative. The
    // host-ink round-trip API still returns the `output` field; it
    // just stays empty because the called function is pure.
    expect(finalResult.output).toBe("");
  });

  test("Object.keys(variablesState) lists every declared global", () => {
    // `variablesState` is a Proxy-backed map of declared globals. The
    // upstream test asserts that JS iteration (`Object.keys`) sees
    // every `VAR` declaration; sparkdown uses `store` instead but the
    // runtime registration is identical (both produce
    // `VariableAssignment(kind="global")` parsed nodes that the engine
    // funnels into `state.variablesState`).
    const ctx = makeRuntimeStoryFromFile("bindings", "variable-observer");
    expect(ctx.errorMessages).toEqual([]);
    expect(Object.keys(ctx.story.variablesState)).toEqual([
      "testVar",
      "testVar2",
    ]);
  });

  test("an external call inside a glued line runs once", () => {
    // Upstream ink fixture uses `<>` (ink's glue marker); sparkdown
    // uses `..` instead. `One ..` writes no newline, so the continue
    // runs on through the external call to `Two`: the call runs once
    // and the line joins.
    const ctx = makeRuntimeStoryFromFile(
      "bindings",
      "lookup-safe-or-not-with-post-glue",
    );
    expect(ctx.errorMessages).toEqual([]);
    let calls = 0;
    ctx.story.BindExternalFunction("myAction", () => {
      calls++;
    });
    expect(ctx.story.ContinueMaximally()).toBe("One Two\n");
    expect(calls).toBe(1);
  });
});
