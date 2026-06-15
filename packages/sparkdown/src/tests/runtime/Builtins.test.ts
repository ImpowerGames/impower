// Ported from inkjs `src/tests/specs/ink/Builtins.spec.ts`.
//
// Sparkdown exposes math builtins under Luau-style names (`math.floor`,
// `math.ceil`, `math.pow`, `math.min`, `math.max`, `math.random`,
// `math.randomseed`) rather than ink's all-caps form (`FLOOR`, `CEILING`,
// ...). The lowerer translates `math.floor(x)` etc. to the runtime's
// existing `NativeFunctionCall` opcodes via `stdlibMapping.ts` — no
// engine changes. Other ink builtins (TURNS, TURNS_SINCE, READ_COUNT,
// RANDOM, SEED_RANDOM) keep their ink names today; only the math family
// got luau-style aliases.
//
// Read-count / visit-count / turns-since tests depend on ink-specific
// fixture shapes (knots-as-functions, bare `~ func()` calls, multi-target
// tunnels) which need rewrites that go beyond simple translation. Those
// are skipped with notes.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Builtins (ported from inkjs)", () => {
  test("count.turns() returns the current turn count", () => {
    // `count.turns()` is the Luau-style alias for ink's `TURNS()`
    // builtin, registered in INK_BUILTIN_ALIASES. The first Continue()
    // advances the turn counter; we expect `0` on the first emission
    // since the counter is 0-based at story start.
    const ctx = makeRuntimeStoryFromFile("builtins", "count-turns");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("0\n");
  });

  test("math.floor and math.ceil", () => {
    // Sparkdown maps `math.floor(x)` / `math.ceil(x)` onto the inkjs
    // runtime's `FLOOR` / `CEILING` native ops via `stdlibMapping.ts`
    // (lowerer-level translation — no engine changes). Same fixture covers
    // nested calls (`math.floor(math.ceil(1.2))`) to exercise the
    // method-call pair detection inside parenthetical arg lists. The
    // inkjs original also tested `INT(...)` separately, but luau has no
    // INT primitive — `math.floor` covers the truncating-int role.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "floor-ceiling-and-casts",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("1\n2\n2\n1\n2\n1\n");
  });

  test("read count survives across tunnel callstack", () => {
    // `{first}` interpolates the visit count of scene `first`. After
    // a tunnel call into `second` and back, the read count should
    // stay at 1 (we only entered `first` once). Tests that the
    // tunnel mechanism doesn't double-count visits.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-across-callstack",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "1) Seen first 1 times.\nIn second.\n2) Seen first 1 times.\n",
    );
  });

  test("read count across threads", () => {
    // Spawning a thread that visits a scene should increment that
    // scene's visit count just like a normal divert would. Before the
    // `<- aside` line, `count.visits(-> aside)` is 0; after the thread
    // executes (emitting "Inside aside." and reaching `-> DONE`), the
    // count is 1. Verifies that thread-spawn doesn't skip the
    // read-count bookkeeping.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-across-thread",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("0\nInside aside.\n1\n");
  });

  test("count.visited(-> t) — boolean has-the-reader-been-here shorthand", () => {
    // `count.visited(-> t)` lowers to `READ_COUNT(t) > 0` and yields
    // a genuine boolean — the explicit "unvisited/visited" check now
    // that Lua truthiness no longer treats a 0 read count as falsy in
    // Luau code. Works in interpolations, Luau `if` conditions, and
    // composes with `not`.
    const ctx = makeRuntimeStoryFromFile("builtins", "visited-shorthand");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "false\nInside aside.\ntrue\nSeen it.\nNever been there.\n",
    );
  });

  test("read count dot-separated path", () => {
    // Upstream ink fixture:
    //   -> hi ->
    //   -> hi ->
    //   -> hi ->
    //   { hi.stitch_to_count }
    //   == hi ==
    //   = stitch_to_count
    //   hi
    //   ->->
    //
    // Ink auto-routes `-> hi` to the first stitch (`stitch_to_count`).
    // Sparkdown doesn't auto-route through `scene hi` to the first
    // `branch` — explicit `-> hi.stitch_to_count` is required. The
    // dotted-path read-count `{hi.stitch_to_count}` resolves to the
    // visit count of the branch container, which after 3 tunnel calls
    // should be 3.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-dot-separated-path",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("hi\nhi\nhi\n3\n");
  });

  test("read count via variable divert target (`store x = -> knot; -> x(arg)`)", () => {
    // Three tunnel calls through a variable that holds a divert-target
    // (`store x = -> knot`). Each call passes a different arg. The
    // `READ_COUNT(...)` and bare-name `{knot}` forms all return the
    // visit count of the underlying scene.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "read-count-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "Count start - 0 0 0\n1\n2\n3\nCount end - 3 3 3\n",
    );
  });

  test("turns since nested (choice depth-driven TURNS_SINCE)", () => {
    // Upstream ink fixture nests `* (then) stuff` then `* * (next) more
    // stuff` inside `=== empty_world ===`, with `TURNS_SINCE(-> then)`
    // interpolated before the outer choice, between picking it and the
    // inner choice, and inside the inner choice. Expected counts are
    // -1 (never visited), 0 (just visited this turn), 1 (visited last
    // turn).
    //
    // Sparkdown rewrite uses nested `choose ... then ... end` blocks
    // instead of `*` / `* *` shortcut nesting. The outer choice carries
    // label `(then)`. `count.turns(-> then)` is the luau alias for
    // ink's `TURNS_SINCE(-> then)`. `countAllVisits: true` forces visit
    // bookkeeping on the labeled choice container — without it the
    // compiler only tracks containers that appear in a `READ_COUNT` /
    // `{name}` lookup, and the `TURNS_SINCE` builtin reads visit
    // counts at runtime, after compile-time tracking has already been
    // decided.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "turns-since-nested",
      { countAllVisits: true },
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("-1 = -1\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("stuff\n0 = 0\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("more stuff\n1 = 1\n");
  });

  test("turns since with variable target", () => {
    // Upstream ink fixture wraps `TURNS_SINCE(x)` in a user function
    // `=== function beats(x) === ~ return TURNS_SINCE(x)` and calls
    // `{beats(-> start)}` from inside `start`. The wrapping forces a
    // divert-target value to flow through a function parameter, which
    // is still deferred in sparkdown's compiler (see "divert-target-as-
    // value" in the open-items list).
    //
    // The underlying behavior the test verifies — `TURNS_SINCE(-> start)`
    // returning 0 before any choice, then 1 after a choice — doesn't
    // depend on the function wrapper. We inline `count.turns(-> start)`
    // directly to exercise the same TURNS_SINCE bookkeeping the upstream
    // test cares about, without the divert-target-through-parameter
    // detour.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "turns-since-variable-target",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("0\n0\n");
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("1\n");
  });

  test("turns (choice loop)", () => {
    // Upstream ink fixture:
    //   -> c
    //   - (top)
    //   + (c) [choice]
    //       {TURNS()}
    //       -> top
    // A self-looping sticky choice that emits the turn count each
    // iteration. Initial `-> c` diverts straight into the choice body,
    // bypassing the first choice-presentation. The test loops 10x,
    // expecting Continue to emit `i\n` (0..9) before each pick.
    //
    // Sparkdown rewrite flattens the divert-into-choice trick: emit
    // `{count.turns()}` at the top of the loop, present the choice,
    // then loop back. `[choice]` brackets keep the post-pick text empty
    // so picking emits nothing — only the next iteration's turn count.
    const ctx = makeRuntimeStoryFromFile("builtins", "turns-choice-loop");
    expect(ctx.errorMessages).toEqual([]);
    for (let i = 0; i < 10; i++) {
      expect(ctx.story.Continue()).toBe(`${i}\n`);
      ctx.story.ChooseChoiceIndex(0);
    }
  });

  test("visit counts when choosing (VisitCountAtPathString)", () => {
    // Upstream ink fixture has two knots; the test exercises
    // `VisitCountAtPathString(name)` before and after `ChoosePathString`,
    // a Continue, a ChooseChoiceIndex, and a second Continue — verifying
    // that visit counts increment only when control actually enters the
    // named container. The `VisitCountAtPathString` runtime API is
    // available on `state` (inherited from inkjs's `StoryState`).
    //
    // Sparkdown rewrite uses `scene` for `=== knot ===` and a
    // single-choice `choose` block for the `* [Next] -> TestKnot2`
    // weave shape. Same observable visit-count semantics.
    //
    // `countAllVisits: true` mirrors the upstream `compileStory(name, true)`
    // — without it the compiler only marks containers that the source
    // references via `READ_COUNT` / `{knot}` / `TURNS_SINCE`. Here the
    // fixture never reads a visit count inline, so `VisitCountAtPathString`
    // would return 0 forever. See the `RuntimeTestOptions.countAllVisits`
    // jsdoc in `runtimeTestHarness.ts`.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "visit-counts-when-choosing",
      { countAllVisits: true },
    );
    expect(ctx.errorMessages).toEqual([]);
    const state = ctx.story.state;

    expect(state.VisitCountAtPathString("TestKnot")).toBe(0);
    expect(state.VisitCountAtPathString("TestKnot2")).toBe(0);

    ctx.story.ChoosePathString("TestKnot", true, []);
    expect(state.VisitCountAtPathString("TestKnot")).toBe(1);
    expect(state.VisitCountAtPathString("TestKnot2")).toBe(0);

    ctx.story.Continue();
    expect(state.VisitCountAtPathString("TestKnot")).toBe(1);
    expect(state.VisitCountAtPathString("TestKnot2")).toBe(0);

    ctx.story.ChooseChoiceIndex(0);
    expect(state.VisitCountAtPathString("TestKnot")).toBe(1);
    expect(state.VisitCountAtPathString("TestKnot2")).toBe(0);

    ctx.story.Continue();
    expect(state.VisitCountAtPathString("TestKnot")).toBe(1);
    expect(state.VisitCountAtPathString("TestKnot2")).toBe(1);
  });

  test("visit count bug due to nested containers", () => {
    // Upstream ink fixture:
    //   - (gather) {gather}
    //   * choice
    //   - {gather}
    // The `(gather)` labeled gather is referenced twice via `{gather}`
    // interpolation — once before the choice, once after. The visit
    // count should be 1 both times because the gather is only entered
    // once (the second `-` is a different unnamed gather, not a
    // re-entry of `(gather)`).
    //
    // Sparkdown rewrite uses `label gather` (the labeled-flow form) +
    // `choose` block. `countAllVisits: true` forces visit tracking on
    // the labeled container so the interpolation can read it without
    // a `READ_COUNT(...)` reference to force the bookkeeping.
    const ctx = makeRuntimeStoryFromFile(
      "builtins",
      "visit-count-bug-nested-containers",
      { countAllVisits: true },
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("1\n");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("choice\n1\n");
  });
});

describe("Builtins — ported from ink fixture rewrites", () => {
  test("turns since (rewrite of inkjs `turns_since.ink`)", () => {
    // Upstream ink fixture:
    //   { TURNS_SINCE(-> test) }     -- before test is called
    //   ~ test()                      -- call function
    //   { TURNS_SINCE(-> test) }     -- right after
    //   * [choice 1]                  -- choice → 1 turn passes
    //   - { TURNS_SINCE(-> test) }
    //   * [choice 2]                  -- another → 2 turns pass
    //   - { TURNS_SINCE(-> test) }
    //   == function test == ~ return
    //
    // Sparkdown rewrite:
    //   - `=== function test === ~ return` → `function test() end`
    //   - `~ test()` discard-call → `& test()`
    //   - `TURNS_SINCE(-> X)` → `count.turns(-> X)` (stdlib alias)
    //   - Flat-weave `* [c] - gather` → `choose + [c1] + [c2] then ... end`
    //     block (sparkdown's block-structured choice form)
    const ctx = makeRuntimeStoryFromFile("builtins", "turns-since");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("-1\n0\n");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("1\n");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("2\n");
  });
});
