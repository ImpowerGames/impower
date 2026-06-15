// Ported from inkjs `src/tests/specs/ink/Glue.spec.ts`.
//
// Glue itself is well-exercised by the existing `Logic.test.ts`
// "multiline logic with glue" test. This file ports inkjs's dedicated
// glue spec for parity coverage. Most inkjs glue tests rely on ink's
// function-as-subroutine semantics (functions that emit narrative text
// into the output stream during evaluation), which sparkdown's
// expression-returning `function ... end` doesn't model — same
// divergence flagged in `Newlines.test.ts` and `CallStack.test.ts`.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Glue (ported from inkjs)", () => {
  test("simple glue across multiple lines", () => {
    // Ink's `Some <>\ncontent<> with glue.` uses trailing/leading `<>`
    // markers; sparkdown's `..` lives between whitespace boundaries.
    // Rewritten so each continuation line opens with ` .. ` — the same
    // pattern as the multiline-glue logic test, exercising the
    // `Glue` runtime marker's newline-suppression behavior.
    const ctx = makeRuntimeStoryFromFile("glue", "simple-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("multi-line content inside `if cond then ... end` (left-right glue)", () => {
    // Ink fixture wraps text in `{ f(): Another line. }` — sparkdown
    // maps the inline `{cond: text}` shorthand to the block form
    // `if cond then text end`. Test that the surrounding lines join
    // correctly across the block.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "left-right-glue-matching",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A line.\nAnother line.\n");
  });
});

describe("Glue — ported from ink fixture rewrites", () => {
  test("inline interpolation of function-return string (rewrite of inkjs `implicit_inline_glue.ink`)", () => {
    // Upstream ink fixture relies on a function emitting narrative
    // ("five") via implicit inline glue:
    //   I have {five()} eggs.
    //   == function five == {false:...} five
    // Sparkdown's functions are expression-only, so the rewrite uses
    // `function five() return "five" end` and the inline `{five()}`
    // interpolation pulls the returned value into the line. Same
    // observable output, different mechanism (value return vs implicit
    // narrative emission). Validates that `{func()}` interpolation
    // inlines a function's return value into surrounding display text.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-function-return-in-interp",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("I have five eggs.\n");
  });

  test("inline conditional that emits nothing trims trailing space (rewrite of inkjs `implicit_inline_glue_b.ink`)", () => {
    // Upstream ink fixture:
    //   A {f():B}
    //   X
    //   === function f() === {true: ~ return false}
    // The function returns false, so `{f():B}` emits nothing. The line
    // "A {f():B}" reduces to "A " then sparkdown's display lowerer
    // trims trailing whitespace from the last text segment, leaving
    // "A". Output is "A\nX\n", matching ink's expected behavior here.
    // Validates the inline `if … then …` (no else) collapse-to-empty
    // semantics inside display text.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-conditional-empty-then",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nX\n");
  });
});

// Test C from upstream (`A\n{f():X}\nC` → `"A\nC\n"`) is intentionally
// not ported — it pins ink's specific "empty-interpolation-line is
// collapsed via implicit glue" behavior, which sparkdown does not
// share. In sparkdown, an interpolation that evaluates to empty still
// emits a `\n` for the line break (giving `"A\n\nC\n"`). Authors who
// want ink-C's exact behavior would write `if cond then "X"` inline
// with the surrounding text rather than on its own line.
