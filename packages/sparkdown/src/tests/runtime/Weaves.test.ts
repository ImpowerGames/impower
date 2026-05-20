// Ported from inkjs `src/tests/specs/ink/Weaves.spec.ts`.
//
// Choice text capture + `[suppressed]` bracket form are done — the
// passing tests below exercise them. Weave-specific tests still
// skipped because they need:
//   - `ChoiceConditional` (`{cond}` guard on `*`)
//   - shuffle/alternator with embedded choices
//   - duplicate-label compile diagnostic
// See docs/runtime/DEFERRED.md.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
  runToEnd,
} from "./runtimeTestHarness";

describe("Weaves (ported from inkjs)", () => {
  test("choose...then...end block (sparkdown new syntax)", () => {
    // Sparkdown's block-based weave: a `choose` block wraps the
    // choices, `then` introduces the gather body, `end` closes. After
    // picking either choice, the chosen text emits, then control
    // falls through to the `then` body ("She nods.") before the
    // outer `-> DONE`. Validates `lowerSparkdownChooseBlock` end-to-end.
    const ctx = makeRuntimeStoryFromFile("weaves", "choose-then-block");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["Hi", "Hey"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("Hi\nShe nods.\n");
  });

  test("unbalanced weave indentation (* * * nesting)", () => {
    // `* * * First` is depth-3, `* * * * Very indented` is depth-4
    // (nested under First), `- - End` is a depth-2 gather that closes
    // both. Initially only "First" is visible; after choosing it, the
    // depth-4 child "Very indented" surfaces; choosing that lands on
    // the gather. Exercises the depth-nesting hookup in `lowerChoice`
    // / `lowerGather` (`indentationDepth` set from the mark's `*` /
    // `+` / `-` count).
    const ctx = makeRuntimeStoryFromFile(
      "weaves",
      "unbalanced-weave-indentation",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["First"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("First\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "Very indented",
    ]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("Very indented\nEnd\n");
  });

  test("weave gathers (nested * + - - gathers)", () => {
    // Top-level `* one` / `* four` choices (depth 1). Inside `one`
    // there's a nested `* * two` (depth 2) plus a `- - three` gather
    // closing the depth-2 path. `- six` is the depth-1 gather closing
    // the top level. Choosing "one" then "two" should produce the
    // chain: two → three → six.
    const ctx = makeRuntimeStoryFromFile("weaves", "weave-gathers");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "one",
      "four",
    ]);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["two"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("two\nthree\nsix\n");
  });

  // `weave_options` (the `* Hello[.], world.` bracket-split test) is
  // covered by Choices.test.ts > "[suppressed] bracket splits label
  // from chosen output".

  test("duplicate label anchor names emit a compile-time error", () => {
    // Two `label x` declarations in the same scope trip inkjs's
    // `CheckForWeavePointNamingCollisions` check during `ExportRuntime`.
    // The diagnostic surfaces via sparkdown's compile pipeline.
    const { errorMessages } = collectDiagnostics(
      `-> main\nscene main\n  label x\n  one\n  label x\n  two\n`,
    );
    expect(errorMessages.some((m) => /same label name `x`/.test(m))).toBe(
      true,
    );
  });

  test("gather + choices + gather (rewrite of inkjs `conditional_choice_in_weave_2`)", () => {
    // Upstream ink fixture:
    //   - first gather
    //       * [option 1]
    //       * [option 2]
    //   - the main gather
    //   {false:
    //       * unreachable option -> END
    //   }
    //   - bottom gather
    //
    // Three flat-weave gathers separated by a choice list and a
    // false conditional. Sparkdown rewrite places the post-pick
    // gathers inside the `then` body of a `choose ... then ... end`
    // block. The false conditional is dropped — its arm was a choice
    // that would have been registered in the outer weave (flat-weave
    // semantics), which sparkdown doesn't replicate. The observable
    // output ("first gather\n" before pick; "the main gather\nbottom
    // gather\n" after pick) is identical.
    const ctx = makeRuntimeStoryFromFile("weaves", "conditional-choice-in-weave-2");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("first gather\n");
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "the main gather\nbottom gather\n",
    );
  });

  test("conditional choice in weave (rewrite using `* if cond`)", () => {
    // Upstream ink fixture:
    //   - start
    //    {
    //       - true: * [go to a stitch] -> a_stitch
    //    }
    //   - gather should be seen
    //   -> DONE
    //   = a_stitch
    //       result
    //       -> END
    //
    // Ink's `{cond: * choice}` inline-conditional-with-embedded-choice
    // relies on the choice being registered in the outer weave's
    // choice list while execution continues past the conditional.
    // Sparkdown achieves the same observable behavior via `* if cond
    // text` (ChoiceConditional) — the choice only appears when the
    // condition is true, and the surrounding narrative still runs
    // before the choose block presents.
    const ctx = makeRuntimeStoryFromFile("weaves", "conditional-choice-in-weave");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "start\ngather should be seen\n",
    );
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("go to a stitch");

    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("result\n");
  });

  test("weave within sequence (rewrite of `{shuffle: -* choice nextline -> END}`)", () => {
    // Upstream ink fixture wraps a single-arm shuffle alternator around
    // a choice block:
    //   { shuffle:
    //     - * choice
    //       nextline
    //       -> END
    //   }
    //
    // The shuffle alternator only has one arm, so the "shuffle"
    // bit is moot — what matters is the choice + chosen output +
    // terminator triple. Sparkdown's `choose ... then ... end` form
    // expresses the same shape without the alternator wrapper.
    const ctx = makeRuntimeStoryFromFile("weaves", "weave-within-sequence");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("choice\nnextline\n");
  });
});
