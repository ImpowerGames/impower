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
// The runtime API (`BindExternalFunction`, `UnbindExternalFunction`,
// `EvaluateFunction`, `ObserveVariable`) is inherited from inkjs and
// unchanged.

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

  test("variable observer fires on assignment", () => {
    // Upstream ink fixture:
    //   VAR testVar = 5
    //   VAR testVar2 = 10
    //   Hello world!
    //   ~ testVar = 15
    //   ~ testVar2 = 100
    //   Hello world 2!
    //   * choice
    //       ~ testVar = 25
    //       ~ testVar2 = 200
    //       -> END
    //
    // Sparkdown rewrite uses `store` for globals and `&` for the
    // discard-statement assignment marker. `ObserveVariable("testVar",
    // ...)` registers a callback; the inkjs runtime fires it whenever
    // the named global is written. testVar starts at 5, gets set to 15
    // during the first Continue burst (firing once with newValue=15),
    // then to 25 after the choice (firing again with newValue=25).
    // testVar2 is observed implicitly via `Object.keys` below.
    const ctx = makeRuntimeStoryFromFile("bindings", "variable-observer");
    expect(ctx.errorMessages).toEqual([]);

    let currentVarValue = 0;
    let observerCallCount = 0;
    ctx.story.ObserveVariable(
      "testVar",
      (_varName: string, newValue: number) => {
        currentVarValue = newValue;
        observerCallCount += 1;
      },
    );

    ctx.story.ContinueMaximally();
    expect(currentVarValue).toBe(15);
    expect(observerCallCount).toBe(1);

    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    expect(currentVarValue).toBe(25);
    expect(observerCallCount).toBe(2);
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

  test("lookahead-safe flag controls how often the external is called", () => {
    // Upstream ink fixture:
    //   EXTERNAL myAction()
    //   One
    //   ~ myAction()
    //   Two
    //
    // The runtime's `ContinueMaximally` does a lookahead pass to
    // detect glue. When the bound external is registered with
    // `lookaheadSafe = true`, the lookahead may call it once
    // speculatively in addition to the "real" call — so the host sees
    // 2 invocations. With `lookaheadSafe = false`, the runtime breaks
    // out of the lookahead the first time it sees the external,
    // ensuring exactly 1 invocation.
    const ctxSafe = makeRuntimeStoryFromFile("bindings", "lookup-safe-or-not");
    expect(ctxSafe.errorMessages).toEqual([]);
    let callCount = 0;
    ctxSafe.story.BindExternalFunction(
      "myAction",
      () => {
        callCount++;
      },
      true,
    );
    ctxSafe.story.ContinueMaximally();
    expect(callCount).toBe(2);

    const ctxUnsafe = makeRuntimeStoryFromFile(
      "bindings",
      "lookup-safe-or-not",
    );
    expect(ctxUnsafe.errorMessages).toEqual([]);
    let unsafeCallCount = 0;
    ctxUnsafe.story.BindExternalFunction(
      "myAction",
      () => {
        unsafeCallCount++;
      },
      false,
    );
    ctxUnsafe.story.ContinueMaximally();
    expect(unsafeCallCount).toBe(1);
  });

  test("ValidateExternalBindings errors on a call site with no bound host fn", () => {
    // The runtime auto-validates external bindings on the first
    // Continue (via `_hasValidatedExternals`). When a declared
    // `external` is called but no host function has been bound, the
    // runtime surfaces a "Missing function binding for external"
    // error. This pins the linkage between the declaration, the
    // call-site Divert.isExternal flag, and the validation pass.
    const ctx = makeRuntimeStoryFromFile("bindings", "lookup-safe-or-not");
    expect(ctx.errorMessages).toEqual([]);
    // Deliberately don't call BindExternalFunction — Continue should
    // throw with a missing-binding error message.
    expect(() => ctx.story.ContinueMaximally()).toThrow(
      /Missing function binding for external/,
    );
  });

  test("lookahead with leading glue (`..` left-glue marker)", () => {
    // Upstream ink fixture uses `<>` (ink's glue marker); sparkdown
    // uses `..` instead. The lookahead-safe runtime path snapshots
    // state at the newline before "Two", calls the external
    // speculatively while peeking past the line, then rewinds when
    // the glue marker forces a re-evaluation. The bound external is
    // a no-op; the test pins output ordering: "One\nTwo\n".
    const ctx = makeRuntimeStoryFromFile(
      "bindings",
      "lookup-safe-or-not-with-post-glue",
    );
    expect(ctx.errorMessages).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    ctx.story.BindExternalFunction("myAction", () => {});
    expect(ctx.story.ContinueMaximally()).toBe("One\nTwo\n");
  });
});
