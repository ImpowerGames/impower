// Ported from inkjs `src/tests/specs/ink/Functions.spec.ts`.
//
// The inkjs Functions spec is composed entirely of *compile-diagnostic*
// tests. Most tests assert on ink-specific wording / triggering
// conditions and are kept skipped with notes; the function-purity test
// has a direct sparkdown analog (functions can't contain display
// text / choices / diverts) and is ported below.
//
// Runtime-level function behavior is covered by `CallStack.test.ts`.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Functions (ported from inkjs)", () => {
  test("function purity: bare expression statements and diverts are rejected", () => {
    // Sparkdown's `function ... end` is a pure-expression callable —
    // its body is parsed as Luau-only. Sparkdown statements that would
    // yield to the surrounding flow (display lines, choice blocks,
    // diverts) get re-parsed as Luau-shaped fragments inside a
    // function body: bare display text reads as access-path variable
    // references, `choose` reads as a variable name, `-> target`
    // reads as a `LuauDivertTargetLiteral` value. The purity checker
    // in `lowerLuauFunctionDefinition` flags any top-level body child
    // that isn't a legitimate Luau statement shape.
    //
    // The upstream ink fixture asserted three distinct category
    // wordings ("Functions may not contain choices", etc.). Sparkdown
    // emits messages of two flavors — "display text" (the most
    // common cause, since misparsed sparkdown statements surface as
    // access paths) and "diverts" (`LuauDivertTargetLiteral` at
    // statement position). The fixture has one of each:
    //   function bad_display() thisLooksLikeText ... end
    //   function bad_divert() -> somewhere ... end
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "function-purity-checks",
    );
    expect(ctx.errorMessages).toHaveLength(2);
    expect(
      ctx.errorMessages.some((m) => /display text/i.test(m)),
    ).toBe(true);
    expect(
      ctx.errorMessages.some((m) => /diverts/i.test(m)),
    ).toBe(true);
  });
});

describe("Functions — clean-compile invariants", () => {
  // These tests assert "no diagnostics emitted" for valid sparkdown
  // forms. They don't depend on diagnostic wording, only on the
  // compiler NOT emitting false positives. Both come from inkjs's
  // Functions.spec.ts and survive the port verbatim because
  // `errorMessages.length === 0` is an implementation-agnostic check.

  test("function param shadowing a gather label in another scene is allowed", () => {
    // Upstream ink fixture:
    //   == knot ==
    //   - (x) -> DONE
    //   == function f(x) ==
    //   Nothing
    //
    // The function's `x` parameter has the same name as a labeled
    // gather inside an unrelated knot. Different scopes — no conflict.
    // Sparkdown rewrite uses `label x` for the gather and `function
    // f(x) end` for the function. Compile should be clean.
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "argument-shouldnt-conflict-with-gather",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
  });

  test("compound assignment with function-call rhs (`& x += one()`) compiles cleanly", () => {
    // Upstream ink fixture:
    //   VAR x = 5
    //   ~ x += one()
    //   === function one() === ~ return 1
    //
    // Mixing compound-assignment + function-call as the rhs is valid
    // and should not trip any compile diagnostic. Sparkdown uses
    // `& x += one()` instead of `~`; otherwise identical.
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "function-and-increment-together",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
  });

  test("function-call restrictions: calling a scene + diverting to a function emit errors", () => {
    // Upstream ink fixture exercises two illegal invocation shapes:
    //   ~ aKnot()    — calling a knot as if it were a function
    //   -> myFunc    — diverting to a function (must be called)
    // The upstream test asserts the specific wording `"hasn't been
    // marked as a function"` and `"can only be called as a function"`.
    // Sparkdown happens to emit the exact same substrings (inherited
    // from inkjs's ExportRuntime divert validation), so we keep the
    // substring asserts. If sparkdown's wording diverges in the
    // future, relax to `.length > 0`.
    //
    // Sparkdown rewrite: `& aKnot()` for the bad-call form (sparkdown's
    // explicit-statement marker), `-> myFunc` for the bad-divert form.
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "function-call-restrictions",
    );
    expect(
      ctx.errorMessages.some((m) => /hasn't been marked as a function/.test(m)),
    ).toBe(true);
    expect(
      ctx.errorMessages.some((m) => /can only be called as a function/.test(m)),
    ).toBe(true);
  });

  test("function parameter / global-name collisions surface as compile errors", () => {
    // Upstream ink test asserts the exact wording `"name has already
    // been used for a function"` / `"name has already been used for a
    // var"`. Sparkdown's diagnostic surface differs by wording — it
    // emits `"Duplicate identifier \`X\`. A function named \`X\`
    // already exists on null"` instead. We relax the check to "at
    // least one diagnostic emitted" so the test pins the underlying
    // detection (function param shadowing a top-level function name
    // or a global store) without coupling to the exact wording.
    //
    // Sparkdown rewrite mirrors the upstream collisions:
    //   - `function pass_divert(aTarget)` collides with
    //     `function aTarget()` (file-scope name reuse)
    //   - `function variable_param_test(global_var)` collides with
    //     `store global_var = 5` (param shadowing a global)
    const ctx = makeRuntimeStoryFromFile(
      "functions",
      "argument-name-collisions",
    );
    expect(ctx.errorMessages.length).toBeGreaterThan(0);
  });
});

describe.skip("Functions — closed by design (see DIVERGENCES.md)", () => {
  // Every remaining test in inkjs's Functions spec asserts on emitted
  // compile diagnostics whose exact wording / triggering conditions
  // belong to ink's static-analysis pass. Sparkdown's diagnostic
  // surface differs by design — runtime-level function behavior is
  // covered by `CallStack.test.ts`.

  // Ink's typed divert-target parameters (`function f(-> b)`) — no
  // sparkdown equivalent.
  test("wrong variable divert target reference (sparkdown has no typed `->` param)", () => {});
});
