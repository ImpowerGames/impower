// Ported from inkjs `src/tests/specs/ink/Strings.spec.ts`.
//
// String literals, `const` strings, and `{x}`-interpolated output map
// cleanly. The other tests in the inkjs spec exercise ink-specific
// features (the `?` string-contains operator, implicit string<->number
// coercion in `==`, and ink's `[suppressed-in-output]` choice text
// bracket) that don't exist or aren't wired up in sparkdown — those are
// skipped with explanations.

import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Strings (ported from inkjs)", () => {
  test("string constants flow through a store variable", () => {
    // `const kX = "hi"` declares a string constant; `store x = kX`
    // copies it into a global; `{x}` interpolates the string into output.
    const ctx = makeRuntimeStoryFromFile("strings", "string-constants");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hi\n");
  });

  test("string contains via :find()", () => {
    // Ink's `?` "string contains" operator is replaced in sparkdown by
    // the `:find` method, which returns a 1-based position or `nil` if
    // not found. Authors write `if s:find(sub) then` for the contains
    // check (matches the standard Luau idiom). Full method set
    // documented in METHODS.md.
    const ctx = makeRuntimeStoryFromFile("strings", "string-contains");
    expect(ctx.errorMessages).toEqual([]);
    // `:find("World")` returns 8 (1-based position of "W" in "Hello, World!")
    // `:find("zzz")` returns nil, which sparkdown renders as 0
    expect(ctx.story.ContinueMaximally()).toBe("8\n0\n");
  });

  test("explicit string↔number conversion via concat (sparkdown is strictly typed)", () => {
    // Upstream ink fixture relies on ink's implicit `==` coercion:
    //   {"5" == 5: same | different}    → same  (ink coerces "5" → 5)
    //   {"blah" == 5: same | different} → different
    //
    // Sparkdown is strictly typed — `"5" == 5` is always false (different
    // types). The luau-idiomatic equivalent forces explicit conversion.
    // Here we use `"" .. five` to stringify the number `5` before
    // comparison; `tonumber()` would be the symmetric alternative once
    // it's wired up in sparkdown's stdlib (currently unimplemented —
    // see STDLIB.md). Same observable output ("same\ndifferent\n")
    // with explicit-conversion intent.
    const ctx = makeRuntimeStoryFromFile("strings", "type-coercion-tonumber");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("same\ndifferent\n");
  });
});

describe.skip("Strings — closed by design (see DIVERGENCES.md)", () => {
  // The `* \ {"t1"} ...` fixture combines `\<space>` whitespace
  // suppression with a leading `{var}` that sparkdown's Choice begin
  // parses as the `* if cond` gate. Use inline `{expr}` AFTER the
  // first non-brace character if you want interpolation in choice text.
  test("strings in choices (leading `{var}` is grammar-ambiguous with ChoiceConditional)", () => {});
});
