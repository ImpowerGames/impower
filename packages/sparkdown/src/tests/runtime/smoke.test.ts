// Smoke test for the runtime harness. Verifies the basic
// "compile a `.sd` fixture, run, capture output" loop works end-to-end
// before we start porting the inkjs specs in earnest.

import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("runtime test harness smoke", () => {
  test("compiles and runs a minimal dialogue line", () => {
    const ctx = makeRuntimeStoryFromFile("smoke", "hello");
    expect(ctx.errorMessages).toEqual([]);
    const output = runToEnd(ctx.story);
    // Dialogue lines emit the speaker tag plus the text. We don't care about
    // the exact whitespace here — just that the body is present and no errors
    // surfaced during compilation.
    expect(output).toContain("hello world");
  });

  test("unary `not` and short-circuit `and`/`or` dispatch at runtime", () => {
    // Exercises the keyword operators end-to-end after the rename from
    // `!`/`&&`/`||` to `not`/`and`/`or`. With `x = false`, `not x` is true,
    // so `true and "yes"` returns "yes", and `"yes" or "no"` short-circuits
    // to "yes". The variable operand defeats compile-time constant folding,
    // so this exercises the runtime native-function lookup under the new
    // keyword names.
    const ctx = makeRuntimeStoryFromFile("smoke", "not-runtime");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story).trim()).toBe("yes");
  });

  test("scenes without explicit `-> DONE` auto-terminate cleanly", () => {
    // SparkdownCompiler auto-appends `Divert(Done)` to any non-function
    // scene / branch whose body doesn't end with a `Divert` /
    // `TunnelOnwards` / `ReturnType`. Authors get to skip the trailing
    // `-> DONE` boilerplate on most scenes.
    const ctx = makeRuntimeStoryFromSource(
      `-> main\nscene main\n  Hello world.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Hello world.\n");
    expect(ctx.story.canContinue).toBe(false);
  });

  test("branches without explicit `-> DONE` auto-terminate cleanly", () => {
    // Same auto-DONE behavior applies to `branch` (stitch) blocks.
    const ctx = makeRuntimeStoryFromSource(
      `-> main.opener\nscene main\n  branch opener\n    Greetings.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Greetings.\n");
    expect(ctx.story.canContinue).toBe(false);
  });

  test("`->` is accepted as a divert-target type annotation", () => {
    // Sparkdown's analogue of ink's typed-divert parameter `function
    // f(-> target)` is `function f(target: ->) ... end`. The type
    // annotation is informational — sparkdown's runtime accepts any
    // value as a divert-target if used as one (see
    // `tunnel-onwards-variable-target` in `Diverts.test.ts`).
    const ctx = makeRuntimeStoryFromSource(`-> outer ->

scene outer
  This is outer
  -> cut_to(-> the_esc)

scene cut_to(escape: ->)
  ->-> escape

scene the_esc
  This is the_esc
  -> END
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toMatch(
      "This is outer\nThis is the_esc\n",
    );
  });

  test("table-typed store: read + property-access via dotted name", () => {
    // Sparkdown's property-access fallback in `Story.ts > VariableReference`
    // lets authors read `obj.field` on a stored table without the
    // bracket-indexer form. Used in tandem with the `StorePropertyAssignment`
    // path for writes (`& obj.field = X`), this gives luau-idiomatic
    // table access for read+write.
    const ctx = makeRuntimeStoryFromSource(`store t = { value = 10 }
{t.value}
& mutate(t)
{t.value}
-> DONE
function mutate(x)
  & x.value = 99
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("10\n99\n");
  });

  test("property mutations are rolled back across newline-lookahead snapshots", () => {
    // The runtime takes a state snapshot at every newline so it can
    // look ahead one line and decide whether to commit the newline or
    // keep accumulating. Variable assignments are snapshot-safe (they
    // go through the patch's `SetGlobal`), but `StoreIndex` mutates an
    // ObjectValue's internal Map in place — that mutation needs an
    // explicit undo log on the patch, otherwise re-running the bytecode
    // after a rewind observes already-mutated state.
    //
    // With print-before / print-after surrounding the assignment, the
    // runtime DOES rewind (it speculatively ran the second `{t.value}`
    // during lookahead before realising the assignment line emits
    // nothing of its own). Without the undo log, `t.value` would
    // advance twice — once during lookahead, once after rewind — so
    // `5 * 5` would land at `625` (= 5^4) instead of `25`. With the fix,
    // it lands at the correct `25`.
    const ctx = makeRuntimeStoryFromSource(`store t = { value = 5 }
{t.value}
& t.value = t.value * t.value
{t.value}
-> DONE
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("5\n25\n");
  });

  test("diverts inside alternator arms route through `lower()` dispatch", () => {
    // `lowerArmContent` now recognizes `ArmDivert` (the alternator-arm
    // context-bounded variant of `Divert` introduced in the grammar)
    // and routes it through the main lowerer dispatch — so `-> X`
    // inside `{chain | -> X | other end}` becomes a real `Divert`
    // ParsedObject, not literal `Text("-> X")`. Critical for the
    // flat-weave-style "alternator arm pivots to another path" idiom.
    const ctx = makeRuntimeStoryFromSource(
      `-> main
scene main
  start
  {chain | -> next | second visit end}
  -> DONE

scene next
  arrived
  -> DONE
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    // First Continue runs main's "start", then the chain's first arm
    // (the divert) which transfers to `next`, which emits "arrived".
    expect(ctx.story.ContinueMaximally()).toBe("start\narrived\n");
  });

  test("divert to a label inside a branch resolves (cross-stitch path lookup)", () => {
    // Validates that sparkdown DOES support diverting to a labeled
    // weave-point inside a `branch` (`scene.branch.label`). The path
    // resolver's deep-search in `Path.GetChildFromContext` falls
    // through to `FlowBase.ContentWithNameAtLevel` which checks the
    // stitch's `_rootWeave.WeavePointNamed(...)` for both labeled
    // gathers and labeled choices (any IWeavePoint with an identifier).
    const ctxGather = makeRuntimeStoryFromSource(`-> main.sub.hello_label
scene main
  branch sub
    label hello_label
    Hello.
`);
    expect(ctxGather.errorMessages).toEqual([]);

    const ctxChoice = makeRuntimeStoryFromSource(`-> main.sub.target
scene main
  branch sub
    choose
      + (target) hello
    end
    after
`);
    expect(ctxChoice.errorMessages).toEqual([]);
  });
});
