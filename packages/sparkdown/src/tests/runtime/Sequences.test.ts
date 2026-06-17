// Ported from inkjs `src/tests/specs/ink/Sequences.spec.ts`.
//
// Sparkdown provides three alternator forms with complementary roles:
//
//   1. **Inline `{...}` form** — `{queue|"a"|"b"|"c"}` etc. Inside
//      `{...}` interpolation, ALL content is Luau-expression-typed.
//      Arms are expressions; text arms use string literals. Suitable
//      for expression contexts (RHS of `local x = ...`, function
//      bodies, etc.). The `end` keyword is optional — the closing
//      `}` terminates the alternator.
//
//   2. **Block form** — top-level statement form in scene/branch
//      bodies. Arms are *display content* (text + nested `{interp}`),
//      suitable for narrative. Supports two shapes:
//        - Multi-line: `queue\n  | A\n  | B\n  | C\nend`. Each arm is
//          its own statement; arms can hold full display content
//          including diverts (`| -> someKnot`), nested control blocks,
//          interpolations, etc.
//        - Single-line: `queue | A | B | C end` on one line. Arms hold
//          simple display text (no diverts or nested blocks — those
//          require the multi-line shape). Parsed by a dedicated grammar
//          rule (`LuauSparkdownSingleLine{Sequential,Conditional}
//          AlternatorBlock`) selected by a `(?=[|])` lookahead after
//          the keyword.
//
//   3. **Inline-glued form** — `Before .. queue|A|B|C .. After.`.
//      Mid-line display-text alternator spliced into a narrative line.
//      The leading `..` and trailing `..` are required delimiters: they
//      mark where the alternator begins and ends so the surrounding text
//      isn't absorbed. Arms hold bare display content (no quotes), same
//      as the block form. This is the form authors reach for when they
//      want a one-line text alternator inline with narrative; the
//      single-line block form `queue | a | b | c end` is preferred when
//      the alternator is its own statement.
//
// Ink's `{a|b|c}` maps onto sparkdown's *inline* form with string
// literals (`{chain|"a"|"b"|"c"}`). Ink's `{!a|b|c}` (once-only) maps
// onto `{queue|"a"|"b"|"c"}`. Ink's `{&a|b|c}` (cycle) maps onto
// `{cycle|"a"|"b"|"c"}`. The `shuffle` modifier is a sparkdown
// extension applied to any of the three: `{shuffle queue|...|...|...}`.
//
// At grammar/lowerer level: the inline form is parsed as
// `LuauSequentialAlternatorBlock` (or `LuauConditionalAlternatorBlock`)
// inside `LuauInterpolatedStringExpression_content`. The block form
// is parsed as `LuauSparkdownSequentialAlternatorBlock` (or the
// Conditional variant) for multi-line shape, and
// `LuauSparkdownSingleLineSequentialAlternatorBlock` (or Conditional)
// for the single-line shape. The inline-glued form is parsed as
// `LuauSparkdownInlineGluedSequentialAlternatorBlock` (or Conditional)
// inside display-content rules (`DisplayLine`, `InlineTextAndLogic`).
// All rule families share the same `_begin` / `_content` / `_end`
// shape and go through the same lowerer family —
// `lowerSparkdown{Sequential,Conditional}AlternatorBlock` — which
// derives its child-name prefix from `nodeRef.node.name`, so it
// handles every variant uniformly. The display lowerer
// (`lowerLuauInterpolatedStringExpression` and the
// `buildDisplayContent` segment loop) detects inline alternator blocks
// via `tryLowerInlineAlternator` and inline-glued blocks via the
// `inlineGluedAlt` body-segment kind, routing both through the same
// lowerer family.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Sequences — inline `{...}` form (expression arms)", () => {
  test("queue plays through arms once, then emits nothing", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-queue");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\n\n\n");
  });

  test("cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-cycle");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\nA\nB\nC\nA\n");
  });

  test("chain plays through, then sticks on the last arm", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-chain");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nC\nC\nC\n");
  });
});

describe("Sequences — inline-glued form (`..keyword|a|b|c..`)", () => {
  // The inline-glued form is the third syntactic shape for alternators.
  // It sits between the inline `{...}` form (expression-typed) and the
  // multi-line block form (display-text on its own statement lines):
  // `Before .. queue|A|B|C .. After.` lets authors splice a display-text
  // alternator into the middle of a narrative line. The leading `..` and
  // trailing `..` are required delimiters — they tell the grammar where
  // the alternator construct begins and ends. Arms hold bare display
  // content (no quotes), same as the block form. The closing `..` is
  // consumed as part of the alternator injection so it doesn't appear in
  // the output text.
  test("inline-glued queue plays once, then emits nothing between the surrounding text", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-queue");
    expect(ctx.errorMessages).toEqual([]);
    // Five visits: arms A, B, C, then empty for the remaining two. When
    // the queue is exhausted the alternator emits nothing — the runtime
    // collapses the surrounding whitespace so the line reads "Before
    // After." rather than "Before  After." with a double-space gap.
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore After.\nBefore After.\n",
    );
  });

  test("inline-glued cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-cycle");
    expect(ctx.errorMessages).toEqual([]);
    // Seven visits across three arms — cycles back to A on the fourth.
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore A After.\nBefore B After.\nBefore C After.\nBefore A After.\n",
    );
  });

  test("inline-glued chain plays through, then sticks on the last arm", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-chain");
    expect(ctx.errorMessages).toEqual([]);
    // Five visits: A, B, C, C, C — chain keeps emitting the final arm.
    expect(ctx.story.ContinueMaximally()).toBe(
      "Before A After.\nBefore B After.\nBefore C After.\nBefore C After.\nBefore C After.\n",
    );
  });

  test("inline-glued shuffle queue emits each arm once in some order", () => {
    // `shuffle queue` plays each arm exactly once in a randomly-shuffled
    // order, then emits nothing. Result is non-deterministic per run, but
    // the *set* of emitted arms across the first 3 visits is always
    // {A, B, C}. The 4th and 5th visits emit empty (queue exhausted).
    // Verify the set property of the first three rather than pinning a
    // specific order.
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-shuffle");
    expect(ctx.errorMessages).toEqual([]);
    const output = ctx.story.ContinueMaximally();
    const lines = output.split("\n").filter((line) => line.length > 0);
    // Pick out the first three lines (the populated arms) and confirm
    // they form the set {A, B, C} in some order.
    const populated = lines.slice(0, 3);
    const arms = populated.map((line) =>
      line.replace(/^Got /, "").replace(/ ?!$/, "").trim(),
    );
    expect([...arms].sort()).toEqual(["A", "B", "C"]);
  });

  test("plural.category(n) is directly callable as a stdlib function", () => {
    // Authors can call `plural.category(n)` directly to get the CLDR
    // category name as a string, independent of any alternator. The
    // language is read from `lang.current`. Here we verify both English
    // and Arabic rule sets — Arabic has all six categories, so it
    // exercises the full predicate.
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "plural-category-direct",
    );
    expect(ctx.errorMessages).toEqual([]);
    // English: 0→other, 1→one, 2→other.
    // Arabic: 0→zero, 1→one, 2→two, 5→few (n%100 in [3,10]),
    //         15→many (n%100 in [11,99]).
    expect(ctx.story.ContinueMaximally()).toBe(
      "other\none\nother\nzero\none\ntwo\nfew\nmany\n",
    );
  });

  test("inline-glued plural respects lang.current at runtime — French CLDR rules", () => {
    // French CLDR rules: `one` applies to n ∈ {0, 1}, `other` to n ≥ 2.
    // Same fixture as the English test but with `lang.current = "fr"` at
    // scene entry. Visit 1 (n=1) → "pomme"; visits 2 and 3 → "pommes".
    // This validates that `plural.category` consults the runtime
    // `lang.current` store, not a compile-time default.
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-french",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Vous avez 1 pomme\nVous avez 2 pommes\nVous avez 3 pommes\n",
    );
  });

  test("inline-glued plural with positional arms (no `key=`) — `|apple|apples`", () => {
    // Two-arm positional sugar: the lowerer treats `|apple|apples` as
    // `|one=apple|else=apples`. Works for languages whose CLDR rules
    // collapse to singular-vs-plural (English, French, Spanish, German,
    // Italian, Portuguese). Authors needing finer categories (Russian,
    // Arabic, Welsh) use named keys.
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-positional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 apple in the basket.\nYou have 2 apples in the basket.\nYou have 3 apples in the basket.\n",
    );
  });

  test("inline-glued plural with single positional arm — always catch-all", () => {
    // One-arm positional plural: the single arm runs regardless of `n`.
    // Useful when authors want plural-aware text but only have one
    // form (e.g. invariant English nouns like "fish" / "sheep").
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "inline-glued-plural-positional-single",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 item\nYou have 2 item\nYou have 3 item\n",
    );
  });

  test("inline-glued plural matches CLDR categories with bare display-text arms", () => {
    // `plural(n)|one=apple|other=apples` — the key side of each arm is a
    // bare identifier (CLDR plural category name), and the value side is
    // display text (no quotes needed, same as block-form arms). This is
    // the natural shape for pluralization in narrative: arm content is
    // text, the arm's gate is the plural category name. The compile
    // pipeline emits an outer `Conditional(init=plural.category(n))`
    // with per-category branches whose bodies are `Text` nodes; at
    // runtime, `plural.category(n)` consults `lang.current` (default
    // "en") to pick CLDR rules — see `engine/PluralRules.ts`.
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-glued-plural");
    expect(ctx.errorMessages).toEqual([]);
    // Three visits with n=1, n=2, n=3. English plural rules: n=1 → "one",
    // n>1 → "other". So we get "1 apple" then "2 apples" then "3 apples".
    expect(ctx.story.ContinueMaximally()).toBe(
      "You have 1 apple in the basket.\nYou have 2 apples in the basket.\nYou have 3 apples in the basket.\n",
    );
  });
});

describe("Sequences — block form (display-text arms)", () => {
  test("block-form queue with bare-word display arms", () => {
    // Multi-line block form in scene body: each arm holds bare display
    // text (no quotes needed). The arm content is lowered as display
    // content, same machinery the scene body itself uses. This is the
    // canonical sparkdown shape for narrative alternators.
    const ctx = makeRuntimeStoryFromFile("sequences", "block-display-text");
    expect(ctx.errorMessages).toEqual([]);
    // Five visits: queue produces "apple", "banana", "cherry", then
    // the empty arms emit no content (unlike the inline form which
    // tacks on a trailing newline per call). The block form's display-
    // text arms are pure content — when the queue exhausts, nothing
    // is emitted at all.
    expect(ctx.story.ContinueMaximally()).toBe("apple\nbanana\ncherry\n");
  });

  test("single-line block-form queue (`queue | a | b | c end` on one line)", () => {
    // Single-line block form: all arms and the closing `end` keyword
    // on one line. Grammar-wise, the `LuauSparkdownAlternatorArm` rule
    // terminates each arm at the next `|` or ` end` so subsequent
    // separators aren't absorbed as text. Lowering is identical to
    // the multi-line shape — same `Sequence(Once)` with Text bodies.
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-queue");
    expect(ctx.errorMessages).toEqual([]);
    // Five visits: apple, banana, cherry, then nothing for the
    // remaining two (queue exhausted).
    expect(ctx.story.ContinueMaximally()).toBe(
      "apple\nbanana\ncherry\n",
    );
  });

  test("single-line block-form cycle wraps around indefinitely", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-cycle");
    expect(ctx.errorMessages).toEqual([]);
    // Seven visits across three arms — cycle restarts at A.
    expect(ctx.story.ContinueMaximally()).toBe(
      "A\nB\nC\nA\nB\nC\nA\n",
    );
  });

  test("single-line block-form plural with named keys", () => {
    // Single-line conditional alternator with display-text arms keyed
    // by CLDR category. Validates that the `LuauAlternatorSeparator`'s
    // `key=` capture still fires inside the arm rule's terminator
    // (the rule's begin pattern `(?=\S)(?![|])` correctly skips the
    // separator-with-key sequence `| one = `, leaving the equals-sign
    // capture to the separator rule).
    const ctx = makeRuntimeStoryFromFile("sequences", "single-line-block-plural");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "apple\napples\napples\n",
    );
  });
});

describe("Sequences — empty arms (porting `blanks_in_inline_sequences`)", () => {
  // Ink's `{a||b}` syntax has an empty middle arm — the alternator's
  // second visit emits nothing, then the third visit picks up "b".
  // Sparkdown's `{}` is Luau-expression-typed so bare-text arms don't
  // work there; the equivalent shape is the single-line block form
  // `chain | a | | b end` (consecutive `|` separators produce an empty
  // arm between them). The lowerer's `lowerArms` walks separators
  // sequentially — two adjacent separators create an arm with an
  // empty body, so when the chain reaches that arm the runtime emits
  // no output for that visit.
  test("chain with empty middle arm: `chain | a | | b end`", () => {
    const ctx = makeRuntimeStoryFromFile(
      "sequences",
      "empty-middle-arm-chain",
    );
    expect(ctx.errorMessages).toEqual([]);
    // Five visits: "a", then empty, then "b", then "b" (chain sticks),
    // then "b" again. The empty visit emits nothing — no newline,
    // no blank line.
    expect(ctx.story.ContinueMaximally()).toBe(
      "a\nb\nb\nb\n",
    );
  });
});

describe("Sequences — shuffle variants", () => {
  // The `shuffle` modifier composes with all three sequential
  // alternator keywords (`queue`, `cycle`, `chain`). The combination
  // is non-deterministic per run but the *set* of emitted arms is
  // always {A, B, C} — these tests assert the set invariant rather
  // than pinning a specific shuffled order. (Ink's spec test
  // `all_sequence_types.ink` seeds the PRNG and asserts exact output;
  // sparkdown's set-based assertions are seed-independent and don't
  // need to thread `math.randomseed` through every fixture.)

  test("shuffle queue plays each arm once in some order, then emits nothing", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-queue");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    // First 3 visits: a permutation of {A, B, C}. Visits 4–5: empty
    // (queue exhausted, no content). Total non-empty lines: 3.
    expect(lines).toHaveLength(3);
    expect([...lines].sort()).toEqual(["A", "B", "C"]);
  });

  test("shuffle cycle wraps with each cycle reshuffled", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-cycle");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    // 6 visits across 2 cycles — each cycle emits a permutation of
    // {A, B, C}. Total of 6 emissions, the multiset has 2 each of A/B/C.
    expect(lines).toHaveLength(6);
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const line of lines) counts[line] = (counts[line] ?? 0) + 1;
    expect(counts).toEqual({ A: 2, B: 2, C: 2 });
  });

  test("shuffle chain plays each arm once in some order, then sticks on last", () => {
    const ctx = makeRuntimeStoryFromFile("sequences", "inline-shuffle-chain");
    expect(ctx.errorMessages).toEqual([]);
    const lines = ctx.story
      .ContinueMaximally()
      .split("\n")
      .filter((s) => s.length > 0);
    // 5 visits. First 3: a permutation of {A, B, C}. Visits 4–5:
    // repeat the last emitted arm (chain semantics). So lines 1–3
    // are a permutation, and line 4 == line 5 == line 3.
    expect(lines).toHaveLength(5);
    expect([lines[0], lines[1], lines[2]].sort()).toEqual(["A", "B", "C"]);
    expect(lines[3]).toBe(lines[2]);
    expect(lines[4]).toBe(lines[2]);
  });
});
