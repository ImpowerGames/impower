// Ported from inkjs `src/tests/specs/ink/Logic.spec.ts`.

import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Logic (ported from inkjs)", () => {
  // The inkjs `logic_lines_with_newlines` fixture relies on function
  // bodies emitting narrative text, which sparkdown intentionally
  // doesn't support — see DIVERGENCES.md > "Functions are
  // expression-only". This port exercises just the bare-call piece
  // (`& foo()`) using a function that mutates a global instead.
  test("bare function-call statement (`& func()`)", () => {
    const src = `store counter = 0
-> main
scene main
  & inc()
  & inc()
  & inc()
  count is {counter}
  -> DONE

function inc()
  counter = counter + 1
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("count is 3\n");
  });

  test("multiline logic with glue", () => {
    // Ink's `<>` glue maps to sparkdown's `..` glue marker. The grammar's
    // `Glue` rule recognizes ` .. ` between whitespace boundaries and the
    // inline-action lowerer emits a runtime `Glue` output-stream marker
    // before the body, suppressing the leading line-type metadata tag (which
    // would otherwise sit between the Glue and body text and prevent the
    // runtime from cleanly consuming the marker). The runtime's output-
    // stream renderer drops the newline that would otherwise sit between
    // glued content runs, so `…{"a"}\n.. b\n…` renders as `"a b\n"`.
    //
    // Inkjs's third pattern (`} <> {true: ...}` — glue followed by another
    // conditional on the same line) doesn't have a clean sparkdown
    // equivalent because `if true then` needs its own line, so this port
    // exercises two glue stitches across two if-blocks instead.
    const ctx = makeRuntimeStoryFromFile("logic", "multiline-logic-with-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("a b\na b\n");
  });

});

describe("Logic — ported from ink fixture rewrites", () => {
  test("print num (rewrite of inkjs `print_num.ink` — recursive number-to-words)", () => {
    // Upstream ink fixture recursively spells out numbers via a
    // function that *emits narrative* into the calling line:
    //   . {print_num(1234)} .
    //   === function print_num(x) ===
    //   { x >= 1000: {print_num(x / 1000)} thousand ... }
    //
    // Sparkdown's functions are expression-only — they return values
    // rather than emitting narrative (see DIVERGENCES.md > "Functions
    // are expression-only"). The rewrite restructures `print_num` to
    // *return* the spelled-out string via Luau `..` concatenation,
    // pulled into the calling line via `{print_num(n)}`. Same
    // recursive shape, same outputs:
    //   4    → "four"
    //   15   → "fifteen"
    //   37   → "thirty-seven"
    //   101  → "one hundred and one"
    //   222  → "two hundred and twenty-two"
    //   1234 → "one thousand two hundred and thirty-four"
    //
    // Ink's `x / 1000` (which floor-divides because x is an int)
    // becomes Luau's explicit `x // 1000` (floor-division operator).
    // Helper functions `ones_word` / `tens_word` / `teens_word`
    // replace ink's `{x: - 1: one - 2: two ...}` match-on-int
    // alternators with plain `if elseif` chains — same effect,
    // expressed in the Luau substrate.
    const ctx = makeRuntimeStoryFromFile("logic", "print-num");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      ". four .\n" +
        ". fifteen .\n" +
        ". thirty-seven .\n" +
        ". one hundred and one .\n" +
        ". two hundred and twenty-two .\n" +
        ". one thousand two hundred and thirty-four .\n",
    );
  });

  test("nested pass by reference (table param as pseudo-ref)", () => {
    // Port of inkjs `nested_pass_by_reference`. Tests that table-as-
    // pseudo-ref propagates through nested function calls: outer
    // `squaresquare(x)` calls `square(x)` twice, each squaring `x.value`
    // in place. Starting at 5, the result is `((5^2)^2) = 625`.
    //
    // Re-enabled after fixing the grammar's `LuauControlBlock` rule to
    // include `LuauExplicitStatement` — discard-call statements inside
    // function bodies now parse correctly. (The single non-recursive
    // call sites here weren't a hang, but the broken grammar meant
    // the `& square(x)` calls were being parsed at root level instead
    // of inside `squaresquare`'s body — same root cause as the
    // recursion bug.)
    const ctx = makeRuntimeStoryFromFile("logic", "nested-pass-by-reference");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("5\n625\n");
  });
});
