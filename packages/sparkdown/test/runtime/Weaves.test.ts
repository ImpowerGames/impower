import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
  runToEnd,
} from "./runtimeTestHarness";

describe("Weaves (ported from inkjs)", () => {
  test("choose...then...end block (sparkdown new syntax)", () => {
    const ctx = makeRuntimeStoryFromFile("weaves", "choose-then-block");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["Hi", "Hey"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("Hi\nShe nods.\n");
  });

  test("unbalanced weave indentation (* * * nesting)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "weaves",
      "unbalanced-weave-indentation",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["First"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("First\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "Very indented",
    ]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("Very indented\nEnd\n");
  });

  test("weave gathers (nested * + - - gathers)", () => {
    const ctx = makeRuntimeStoryFromFile("weaves", "weave-gathers");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "one",
      "four",
    ]);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("one\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["two"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("two\nthree\nsix\n");
  });

  test("duplicate label anchor names emit a compile-time error", () => {
    const { errorMessages } = collectDiagnostics(
      `\nscene start\n  label x\n  one\n  label x\n  two\n`,
    );
    expect(errorMessages.some((m) => /same label name `x`/.test(m))).toBe(
      true,
    );
  });

  test("gather + choices + gather (rewrite of inkjs `conditional_choice_in_weave_2`)", () => {
    const ctx = makeRuntimeStoryFromFile("weaves", "conditional-choice-in-weave-2");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("first gather\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "the main gather\nbottom gather\n",
    );
  });

  test("conditional choice in weave (rewrite using `* if cond`)", () => {
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
    const ctx = makeRuntimeStoryFromFile("weaves", "weave-within-sequence");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("choice\nnextline\n");
  });
});
