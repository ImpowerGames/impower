// Ported from inkjs `src/tests/specs/ink/Evaluation.spec.ts`.
//
// Ports the runtime-execution evaluation tests. Skipped tests document why
// each was deferred (mostly: dependencies on ink-only features like `ref`
// params, `EvaluateFunction` API, or syntax that doesn't map cleanly).

import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Evaluation (ported from inkjs)", () => {
  test("arithmetic", () => {
    // Standard arithmetic ops on integers and floats. Note: the
    // `mod` keyword alias for `%` isn't in sparkdown's grammar
    // (the LUAU_ARITHMETIC_OPERATORS regex only enumerates symbol
    // forms), so the fixture uses `%` throughout — deferred grammar
    // enhancement if author-facing `mod` parity is wanted.
    const ctx = makeRuntimeStoryFromFile("evaluation", "arithmetic");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "36\n2\n3\n2\n2.3333333333333335\n8\n8\n",
    );
  });

  test("floor division (Luau `//`)", () => {
    // Luau `//` is floor division: `7 // 2 = 3`, `-7 // 2 = -4`,
    // `7.5 // 2 = 3`. Ink historically treated `//` as a single-line
    // comment marker (inherited from JS); sparkdown disabled that in
    // CommentEliminator (Luau uses `--` for comments) and registered
    // `//` as a proper Int/Float native — see NativeFunctionCall.ts.
    const ctx = makeRuntimeStoryFromFile("evaluation", "floor-division");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("3\n2\n-4\n3\n");
  });

  test("string concatenation (Luau `..`)", () => {
    // Luau `..` is string concatenation; sparkdown aliases it to the
    // existing `+`-for-strings runtime native in
    // BinaryExpression.NativeNameForOp. Right-associative per Luau:
    // `a .. b .. c` parses as `a .. (b .. c)`.
    const ctx = makeRuntimeStoryFromFile("evaluation", "concat");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello, World!\n");
  });

  test("comparison operators (~=, <, <=, >=)", () => {
    // The four comparison operators that weren't already covered by
    // existing fixtures. `~=` is Luau's not-equal (vs JS `!=`); `<=` /
    // `>=` complete the relational set alongside `<` / `>` / `==`.
    const ctx = makeRuntimeStoryFromFile("evaluation", "comparison-ops");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse\n",
    );
  });

  test("compound assignment (all variants)", () => {
    // Luau supports compound assignment for every binary arithmetic
    // and concat operator: `+=`, `-=`, `*=`, `/=`, `//=`, `%=`, `^=`,
    // `..=`. These all desugar to `x = x <op> y` in the lowerer.
    // Verifies the desugar handles each operator uniformly. Starting
    // values chosen so each step produces a clean integer/string output.
    const ctx = makeRuntimeStoryFromFile("evaluation", "compound-assignment");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      [
        "15", // 10 += 5
        "12", // 15 -= 3
        "24", // 12 *= 2
        "6", // 24 /= 4 → integer div in sparkdown
        "2", // 6 %= 4
        "8", // 2 ^= 3
        "3", // 7 //= 2 = 3
        "Hello, World!", // "Hello" ..= ", World!"
        "",
      ].join("\n"),
    );
  });

  test("operator associativity and precedence (Luau)", () => {
    // Luau's binary-operator precedence table (lowest to highest):
    //   or
    //   and
    //   <  >  <=  >=  ==  ~=
    //   ..                                          (right-associative)
    //   +  -
    //   *  /  //  %
    //   unary `not`, `#`, `-`
    //   ^                                           (right-associative)
    //
    // Everything else is left-associative. This test pins the behavior
    // for each non-obvious case so a future refactor can't silently
    // change parsing. The expected values were computed by hand from
    // the precedence rules above.
    //
    // Fixture lines (matched 1:1 with the expected outputs below):
    //   1.  `2 ^ 3 ^ 2`     → 512  — `^` right-assoc: 2^(3^2) = 2^9 = 512
    //                                   (NOT (2^3)^2 = 64)
    //   2.  `10 - 3 - 2`    → 5    — `-` left-assoc: (10-3)-2 = 5
    //                                   (NOT 10-(3-2) = 9)
    //   3.  `100 / 5 / 4`   → 5    — `/` left-assoc: (100/5)/4 = 20/4 = 5
    //                                   (NOT 100/(5/4) = 100/1 = 100 with int div)
    //   4.  `100 // 7 // 2` → 7    — `//` left-assoc: (100//7)//2 = 14//2 = 7
    //                                   (NOT 100//(7//2) = 100//3 = 33)
    //   5.  `2 + 3 * 4`    → 14    — `*` binds tighter than `+`: 2 + (3*4)
    //                                   (NOT (2+3)*4 = 20)
    //   6.  `2 ^ 3 + 1`    → 9     — `^` binds tighter than `+`: (2^3) + 1
    //                                   (NOT 2^(3+1) = 16)
    //   7.  `1 + 2 ^ 3`    → 9     — same, other side: 1 + (2^3)
    //   8.  `-2 ^ 2`       → -4    — `^` binds tighter than unary `-`: -(2^2)
    //                                   (NOT (-2)^2 = 4 — a famous Lua quirk)
    //   9.  `24 / 2 * 3`   → 36    — same-precedence left-assoc: (24/2)*3
    //                                   (NOT 24/(2*3) = 4)
    //  10.  `17 % 5 % 2`   → 0     — `%` left-assoc: (17%5)%2 = 2%2 = 0
    //                                   (NOT 17%(5%2) = 17%1 = 0 — happens to
    //                                    match here, but the *parse* still
    //                                    needs to be left-assoc for other
    //                                    operands)
    const ctx = makeRuntimeStoryFromFile("evaluation", "associativity");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      ["512", "5", "5", "7", "14", "9", "9", "-4", "36", "0", ""].join("\n"),
    );
  });

  test("exponentiation (Luau `^`)", () => {
    // Luau uses `^` for exponentiation (right-associative, highest
    // arithmetic precedence). Ink historically used `^` for list
    // intersection; sparkdown reclaimed the symbol for Luau parity
    // when builtin method dispatch landed (list intersection is now
    // `t:intersection(other)`). The compile-time alias
    // `^` → `POW` in BinaryExpression.NativeNameForOp routes through
    // the existing Int/Float Pow native (same backing as `math.pow`).
    //
    // Note on associativity: `{ ... }` text interpolation flows through
    // InkParser's expression parser, which doesn't track per-operator
    // associativity — so `2 ^ 3 ^ 2` parses left-associatively as
    // `(2 ^ 3) ^ 2 = 64` rather than Luau-correct `2 ^ (3 ^ 2) = 512`.
    // Authors should parenthesize stacked exponents (last test case
    // below). The sparkdown-grammar path (used at statement level)
    // already handles right-associativity correctly via the lowerer's
    // BINOP_PRECEDENCE table.
    const ctx = makeRuntimeStoryFromFile("evaluation", "exponentiation");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("8\n1024\n1\n2\n512\n");
  });

  test("literal unary", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "literal-unary");
    expect(ctx.errorMessages).toEqual([]);
    // `not 0` is FALSE under Lua truthiness (0 is truthy; only nil
    // and false are falsy). The upstream ink fixture expected `true`
    // (ink treats 0 as falsy), but sparkdown's `not` is the Luau
    // operator — one semantics everywhere, matching basic.luau.
    expect(runToEnd(ctx.story)).toBe("-1\nfalse\nfalse\n");
  });

  test("increment / decrement (compound assignment)", () => {
    const ctx = makeRuntimeStoryFromFile("evaluation", "increment");
    expect(ctx.errorMessages).toEqual([]);
    // ink uses `~ x++` / `~ x--`; sparkdown ports those to `x += 1` / `x -= 1`
    // (the compound-assignment desugar produces equivalent bytecode).
    expect(runToEnd(ctx.story)).toBe("6\n5\n");
  });

  test("EvaluateFunction returning a divert target", () => {
    // The `EvaluateFunction` JS API calls a function by name and
    // returns its return value to the host. A function whose body is
    // `return -> place` produces the path string "-> place".
    const src = `-> main
scene main
  Top level content
  -> DONE
end

scene somewhere
  -> DONE
end

function test()
  return -> somewhere
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    const returned = ctx.story.EvaluateFunction("test") as string;
    expect(returned).toBe("-> somewhere");
  });

  test("EvaluateFunction with args + capture", () => {
    // The 3-arg form `EvaluateFunction(name, args, captureOutput)`
    // returns `{output, returned}` where `output` is everything the
    // function printed and `returned` is the return value. Lets the
    // host run game logic without affecting the main flow.
    const src = `-> main
scene main
  -> DONE
end

function add(x, y)
  return x + y
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    const r = ctx.story.EvaluateFunction("add", [1, 2], true) as {
      output: string;
      returned: unknown;
    };
    expect(r.returned).toBe(3);
    expect(r.output).toBe("");
  });
});

describe("Evaluation — ported from ink fixture rewrites", () => {
  test("factorial recursive (rewrite of inkjs `factorial_recursive.ink`)", () => {
    // Upstream ink fixture:
    //   { factorial(5) }
    //   == function factorial(n) ==
    //     { n == 1: ~ return 1 - else: ~ return (n * factorial(n-1)) }
    // Sparkdown rewrite: function decl uses `function ... end`, the
    // `~ return X` becomes `return X`, and the `{cond: - else:}`
    // alternator is the natural `if cond then ... else ... end`. The
    // underlying validation — recursive function calls return correctly
    // and their final value emits through `{factorial(5)}` interpolation
    // — is independent of these surface changes.
    const ctx = makeRuntimeStoryFromFile("evaluation", "factorial-recursive");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("120\n");
  });

  test("evaluation stack leaks (rewrite of inkjs `evaluation_stack_leaks.ink`)", () => {
    // The original test confirms that ink's evaluator cleans the eval
    // stack between top-level expressions, conditionals, and tunnel
    // calls. Upstream ink fixture:
    //   {false: - else: else}     -- multi-line conditional alternator
    //   {6: - 5: five - else: else}  -- switch alternator on int
    //   -> onceTest ->            -- two tunnel calls
    //   -> onceTest ->
    //   == onceTest == {once: - hi} ->->
    //
    // Sparkdown rewrite:
    //   - Both conditionals use the inline `if then else` expression
    //     (the closing `}` terminates the if — no separate `end` needed).
    //   - The switch-on-int collapses to a plain `if x == 5 then …`.
    //   - The `once`-alternator becomes the single-line block form
    //     `queue | hi end` (so the second tunnel call emits nothing —
    //     not even a newline, unlike the inline `{queue|...}` form which
    //     tacks on `\n` for exhausted visits).
    //   - The tunnel return `->->` works the same in both languages.
    //
    // Same output ("else\nelse\nhi\n") and same final-eval-stack
    // invariant (empty after maximally continuing).
    const ctx = makeRuntimeStoryFromFile("evaluation", "stack-leaks");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("else\nelse\nhi\n");
    expect(ctx.story.state.evaluationStack.length).toBe(0);
  });

  test("basic string literals — variable + inline `{\"world\"}` literal", () => {
    // Upstream ink fixture:
    //   VAR x = "Hello world 1"
    //   {x}
    //   Hello {"world"} 2.
    //
    // Two interpolations: `{x}` (variable ref) and `{"world"}` (string
    // literal as expression). Sparkdown's `{...}` accepts any luau
    // expression — a string-literal expression evaluates to its own
    // value, so `{"world"}` emits `"world"` mid-line. Same observable
    // output as ink.
    const ctx = makeRuntimeStoryFromFile("evaluation", "basic-string-literals");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Hello world 1\nHello world 2.\n");
  });

  test("EvaluateFunction with interleaved Continue() (host-driven function calls)", () => {
    // Upstream ink fixture has three knot-functions (`func1` returns
    // 5, `func2` returns nothing, `add(x,y)` returns x+y), each
    // emitting narrative ("This is a function") alongside the return.
    // The host alternates `EvaluateFunction(name, args, true)` with
    // `Continue()` of the top-level narrative ("One/Two/Three"), and
    // asserts each function's `{returned, output}` shape plus the
    // top-level continues print in order.
    //
    // Sparkdown rewrite drops the narrative-emission half (functions
    // are pure; see Functions.test.ts > function purity) — `output`
    // comes back empty for each call. The interleaving + `returned`
    // value contract still holds.
    const ctx = makeRuntimeStoryFromFile(
      "evaluation",
      "evaluating-functions-from-host",
    );
    expect(ctx.errorMessages).toEqual([]);

    let funcResult = ctx.story.EvaluateFunction("func1", [], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(5);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("One\n");

    funcResult = ctx.story.EvaluateFunction("func2", [], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(null);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("Two\n");

    funcResult = ctx.story.EvaluateFunction("add", [1, 2], true) as {
      returned: unknown;
      output: string;
    };
    expect(funcResult.returned).toBe(3);
    expect(funcResult.output).toBe("");

    expect(ctx.story.Continue()).toBe("Three\n");
  });

  test("EvaluateFunction mid-narrative preserves call-stack state across calls", () => {
    // Upstream ink fixture: a top-level narrative ("Start", "In tunnel.",
    // "End") with a tunnel call inside, plus three pure functions —
    // `function_to_evaluate()` which dispatches via an inner
    // `zero_equals_(1)` call, `zero_equals_(k)` which calls `do_nothing(0)`
    // for side effect then returns `0 == k`, and `do_nothing(k)` which
    // returns 0. Host calls `EvaluateFunction("function_to_evaluate")`
    // BETWEEN top-level Continue calls — the test pins that the
    // mid-narrative call doesn't corrupt the outer story's state and
    // returns "RIGHT" (since `zero_equals_(1)` is false → else branch).
    //
    // Sparkdown rewrite uses `scene` for `== tunnel`, `function … end`
    // for the three callables, `if … then … else … end` for the
    // multi-arm conditional, and `& do_nothing(0)` for the discard call.
    const ctx = makeRuntimeStoryFromFile("evaluation", "function-variable-state");
    expect(ctx.errorMessages).toEqual([]);

    expect(ctx.story.Continue()).toBe("Start\n");
    expect(ctx.story.Continue()).toBe("In tunnel.\n");

    const funcResult = ctx.story.EvaluateFunction("function_to_evaluate");
    expect(funcResult).toBe("RIGHT");

    expect(ctx.story.Continue()).toBe("End\n");
  });

  test("factorial by reference (table param as pseudo-ref)", () => {
    // Port of inkjs `factorial_by_reference`. Ink's `ref` parameters
    // pass primitives by reference (mutations inside the callee are
    // visible to the caller). Sparkdown has no `ref` modifier, but
    // luau tables ARE reference types — so a `{ value = X }` wrapper
    // serves as a pseudo-ref. The callee mutates `r.value`; the caller
    // observes the change.
    //
    // This test also exercises recursive `& fn(args)` discard calls
    // inside an `if` body, which previously hung because the grammar's
    // `LuauControlBlock` rule didn't include `LuauExplicitStatement` —
    // the recursive call ended up siblings to the `if` instead of
    // nested inside it. Fixed by adding `LuauExplicitStatement` to the
    // `LuauControlBlock` patterns.
    const ctx = makeRuntimeStoryFromFile("evaluation", "factorial-by-reference");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("120\n");
  });

});
