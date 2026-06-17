// Ported from inkjs `src/tests/specs/ink/Newlines.spec.ts`.
//
// These tests verify sparkdown's whitespace-trimming behavior around
// conditionals, diverts, and inline calls. Most map directly — sparkdown's
// runtime is the inkjs engine with sparkdown-specific patches around tags
// and float serialization, so the underlying output-stream trim logic is
// shared. Tests that depend on `EXTERNAL` declarations or ink's
// string-eval-inside-a-string-literal (`"{3}"`) syntax are skipped.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Newlines (ported from inkjs)", () => {
  test("newline consistency: same-line divert", () => {
    // Inline mid-line divert `hello -> world` joins the `hello` segment with
    // the diverted-to scene's content onto one logical line. Covered by the
    // inline-divert lowerer added in Slice D.
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "newline-consistency-1",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hello world\n");
  });

  test("newline consistency: same-line choice + divert (* hello -> world)", () => {
    // `* hello -> world` is a choice whose chosen output is "hello"
    // followed by a same-line divert to world. Expected combined
    // output: `"hello world\n"` — the same-line divert glues choice
    // text to the diverted-to scene's content.
    const ctx = makeRuntimeStoryFromFile("newlines", "newline-consistency-2");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("hello world\n");
  });

  test("newline consistency: choice + next-line divert", () => {
    // `* hello\n  -> world` is a choice with the divert on the
    // following indented line. Unlike the same-line form, the chosen
    // output and the diverted-to scene's content stay on separate
    // lines. Expected: `"hello\nworld\n"`. Exercises the
    // no-inline-divert branch of `lowerChoice` (trailing `\n` is
    // appended to innerContent because no inline Divert sibling is
    // captured inside the choice).
    const ctx = makeRuntimeStoryFromFile("newlines", "newline-consistency-3");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("hello\nworld\n");
  });

  test("newline at start of multiline conditional (scene rewrite of `newline_at_start_of_multiline_conditional.ink`)", () => {
    // Upstream ink fixture uses a function that emits narrative:
    //   {isTrue():
    //       x
    //   }
    //   === function isTrue() X ~ return true
    //
    // The point of the test: a multi-line conditional body that starts
    // with whitespace (right after `{cond:`) should NOT emit a leading
    // newline into the body's content. Combined with the truthy
    // function's narrative emission, the output is `"X\nx\n"`.
    //
    // Sparkdown rewrite: the narrative-emitting callable becomes a
    // scene + tunnel return (`-> emitX -> ... ->->`), and the multiline
    // conditional uses `if true then ... end`. Same invariant — the
    // if-block's body must not introduce extra leading newlines.
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "newline-at-start-of-multiline-conditional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("X\nx\n");
  });
  test("EXTERNAL with in-sparkdown fallback function (allowExternalFunctionFallbacks)", () => {
    // Upstream ink fixture:
    //   EXTERNAL TRUE()
    //   Phrase 1
    //   { TRUE():
    //       Phrase 2
    //   }
    //   -> END
    //   === function TRUE() === ~ return true
    //
    // With `allowExternalFunctionFallbacks = true`, the runtime falls
    // back to the sparkdown function whose name matches the unbound
    // external. This is the inherited inkjs feature — the test pins
    // that (a) the call resolves to the fallback, (b) the multi-line
    // conditional body around `Phrase 2` doesn't introduce stray
    // leading newlines.
    //
    // Sparkdown rewrite: `external TRUE()` + `function TRUE() return
    // true end` + `if TRUE() then Phrase 2 end`. The block-form `if`
    // takes the place of ink's `{cond: body}` multi-line conditional.
    const ctx = makeRuntimeStoryFromFile("newlines", "external-fallback");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.allowExternalFunctionFallbacks = true;
    expect(ctx.story.ContinueMaximally()).toBe("Phrase 1\nPhrase 2\n");
  });

  test("newlines around value-returning function (rewrite of `newlines_with_string_eval`)", () => {
    // Upstream ink fixture:
    //   A
    //   ~temp someTemp = string()
    //   B
    //   A
    //   {string()}
    //   B
    //   === function string() ~ return "{3}"
    //
    // Ink's `return "{3}"` returns a STRING containing the
    // interpolation marker `{3}`. When that string is written into the
    // output stream, the runtime re-evaluates the embedded `{3}` and
    // emits `3`. Sparkdown's `{...}` is grammar for the language, not
    // a runtime template — `"{3}"` inside a string literal is just
    // the 3-character string `"{3}"` with no re-evaluation. The
    // underlying invariant the upstream test pins, though, is
    // "newline trimming around function calls that emit content"
    // — same shape works in sparkdown by having the function return a
    // bare value and interpolating it at the call site.
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "value-returning-function-eval",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nA\n3\nB\n");
  });
});
