// Ported from inkjs `src/tests/specs/ink/CallStack.spec.ts`.
//
// These tests exercise function-call stack semantics — recursive function
// calls returning values, and the runtime's behavior when flow is
// redirected mid-execution. Sparkdown's `function name() ... end` decl
// form lowers to an ink Knot with `isFunction=true`, so the call stack
// behavior should match upstream.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("CallStack (ported from inkjs)", () => {
  test("callstack evaluation (nested function calls)", () => {
    // Three functions chained: `six() = four() + two()`, `four() = two() +
    // two()`, `two() = 2`. The top-level interpolation `{six() + two()}`
    // forces the runtime to push and pop frames repeatedly while preserving
    // partial sums on the evaluation stack. Expected output is 8.
    //
    // Fixture ordering note: the top-level invocation must appear *before*
    // the function declarations because of the "function-end accumulation
    // boundary" issue tracked in docs/runtime/DEFERRED.md — `parseIncrementally`
    // attaches subsequent top-level weaves to the most recent knot, so an
    // invocation written after the last `end` ends up inside the previous
    // function's body instead of at the top level. Forward references work
    // because compilation is two-pass.
    const ctx = makeRuntimeStoryFromFile("callstack", "callstack-evaluation");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("8\n");
  });

  test("clean callstack reset on path choice (scene rewrite of `clean_callstack_reset_on_path_choice.ink`)", () => {
    // Upstream ink fixture wraps the narrative in a function:
    //   {RunAThing()}                          -- function call from main
    //   == function RunAThing == The first line. The second line.
    //   == SomewhereElse == {"somewhere else"}
    //
    // Sparkdown's functions are expression-only, so the narrative-emitting
    // callable must be a scene. Same call-stack invariant though: after
    // emitting "The first line." mid-scene, `ChoosePathString` jumps to
    // a different scene and the runtime should cleanly reset the
    // call-stack rather than continue with "The second line.".
    const ctx = makeRuntimeStoryFromFile(
      "callstack",
      "clean-callstack-reset-on-path-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("The first line.\n");
    ctx.story.ChoosePathString("SomewhereElse", true, []);
    expect(ctx.story.ContinueMaximally()).toBe("somewhere else\n");
  });
});
