// Ported from inkjs `src/tests/specs/ink/Conditions.spec.ts`.
//
// Ink's `{cond: A | else: B}` and `{ - cond1: A - cond2: B - else: C }`
// switch alternator forms map naturally to sparkdown's `if/elseif/else`
// blocks. The branch bodies use `{"text"}` interpolation rather than display
// lines to emit bare text without speaker tags (matching the inkjs reference
// outputs byte-for-byte).

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Conditions (ported from inkjs)", () => {
  test("all switch branches fail is clean", () => {
    // Tests that when no condition branch matches, the eval stack stays
    // clean. We don't assert on output (none expected) — the smoke test is
    // just that compilation + run produce no errors and the stack drains.
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "all-switch-branches-fail-is-clean",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.state.evaluationStack.length).toBe(0);
  });

  test("else branches", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "else-branches");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("other\nother\nother\nother\n");
  });

  test("trivial condition", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "trivial-condition");
    expect(ctx.errorMessages).toEqual([]);
    // Just verifies Continue() runs without error — ink test is similarly
    // shape-only.
    ctx.story.Continue();
  });

  test("gather after if-block (divergent intros converging)", () => {
    // `if x == 1 then ... -> meet end` followed by `- (meet) ...` —
    // a labeled gather AFTER the if-block. Branches diverge into the
    // conditional then converge at the gather. Sparkdown allows this
    // without ambiguity because `if/then/end` doesn't use `-` for
    // branch markers (ink's multiline-conditional `-` prefix would
    // clash with gather prefixes, which is why ink disallows gathers
    // inside conditionals — sparkdown has no such limitation).
    const ctx = makeRuntimeStoryFromFile("conditions", "gather-inside-if");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "Tom enters.\nNow they look at each other.\n",
    );
  });

  test("gather inside conditional body (labeled anchor)", () => {
    // `if x == 1 then ... -> inside_meet ... - (inside_meet) ... end`
    // — a labeled gather INSIDE the if-block body. The gather acts
    // as a labeled position the branch can divert to. Ink disallows
    // this entirely (the `-` prefix collides with multiline-
    // conditional branch markers); sparkdown's `if/then/end` lifts
    // that restriction.
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "gather-inside-conditional-body",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Tom enters.\nThe crowd hushes.\n");
  });

  test("inline `{if cond then a else b}` conditional expression", () => {
    // Sparkdown's equivalent of ink's `{cond:a|b}` inline conditional
    // is `{if cond then a else b}` — an if-expression inside an
    // interpolation. The lowerer detects the if/elseif/else shape
    // inside `{...}` and emits a `Conditional` ParsedObject so the
    // chosen branch's value is output. The block form
    // `if true then ... end` (last fixture line) uses the normal
    // statement path.
    const ctx = makeRuntimeStoryFromFile("conditions", "conditionals");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "true\ntrue\ntrue\ntrue\ntrue\ngreat\nright?\n",
    );
  });

  test("empty conditional branch emits nothing", () => {
    // Upstream ink fixture:
    //   { 3:
    //       - 3:
    //       - 4:
    //           txt
    //   }
    //
    // Ink's match-style alternator with init `3`: the `3:` arm matches
    // but has empty body, so output is empty. Sparkdown rewrite uses
    // `if/elseif/end` since match keys must be identifiers (sparkdown
    // can't pattern-match on number-literal keys directly). Same
    // invariant: an empty matched branch emits nothing.
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "empty-conditional-branch",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("");
  });
});
