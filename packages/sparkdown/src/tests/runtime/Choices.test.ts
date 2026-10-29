import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromFile,
} from "./runtimeTestHarness";

describe("Choices (ported from inkjs)", () => {
  test("choice text appears in currentChoices[0].text", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "choice-diverts-to-done");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("choice");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("choice");
  });

  test("[suppressed] bracket splits label from chosen output", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "weave-options");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices[0]?.text).toBe("Hello.");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("Hello, world.\n");
  });

  test("sticky choices stay sticky after one is chosen", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "sticky-choices-stay-sticky",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(2);
  });

  test("`{cond}` guards filter which choices appear", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "conditional-choices");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  test("choice thread forking — picking a threaded choice resumes flow inside the thread's continuation", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "choice-thread-forking",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Side enter"',
      '"Hub leave"',
    ]);

    ctx.story.ChooseChoiceIndex(0);
    let after = "";
    while (ctx.story.canContinue) after += ctx.story.Continue();
    expect(after).toBe('"Side enter" Going deep.\nBack in side_resume.\n');
  });

  test("choice count reflects threads contributing choices", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "choice-count-with-threads",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("0\n1\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Side one"',
      '"Hub one"',
      '"Hub two"',
    ]);
  });
  test("default (fallback) choice fires when no visible choices remain", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "default-choices");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.length).toBe(2);

    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("After choice\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.length).toBe(1);

    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "After choice\nThis is default.\n",
    );
  });

  test("default simple gather: `* ->` auto-fires and flows to gather", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "default-simple-gather");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("x\n");
  });

  test("fallback choice on thread fires when no visible sibling remains", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "fallback-choice-on-thread",
    );
    expect(ctx.errorMessages).toEqual([]);
    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("Fallback fired.\n");
    expect(ctx.story.currentChoices).toEqual([]);
  });
  test("has-read condition uses scene visit count as boolean", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "has-read-on-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("visible choice");
  });
  test("`{expr}` interpolation inside choice text resolves per section", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "logic-in-choices");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices[0]?.text).toBe(
      "'Hello Joe, your name is Joe.'",
    );
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "'Hello Joe,' I said, knowing full well that his name was Joe.\n",
    );
  });

  test("non-text in choice inner content (`option text[].` + interpolation)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "non-text-in-choice-inner-content",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe(
      "option text. Conditional bit. Next.\n",
    );
  });
  test("once-only choices can link back to self via labeled visit count", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "once-only-choices-can-link-back-to-self",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("First choice");

    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("Second choice");

    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.errorMessages).toEqual([]);
  });
  test("once only choices with own content (3 once-only choices)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "once-only-choices-with-own-content",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(3);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(2);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(1);
    ctx.story.ChooseChoiceIndex(0);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.length).toBe(0);
  });
  test("inner fallback bypasses the outer gather", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "should-not-gather-due-to-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("opt\ntext\n");
  });

  test("various default choices (named divert + empty divert)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "various-default-choices",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("1\n2\n3\n");
  });

  test("a fallback choice a thread registered is followed after the line", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "state-rollback-over-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Text.\n");
    expect(ctx.story.Continue()).toBe("5\n");
  });
  test("blank-bracket choice (`* []`) emits a warning", () => {
    const { warningMessages } = collectDiagnostics(
      `-> main\nscene main\n  choose\n    * []\n  end\n`,
    );
    expect(warningMessages.some((m) => /Blank choice/.test(m))).toBe(true);
  });

  test("tags in choice attach to label and chosen output separately", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "tags-in-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentTags!.length).toBe(0);
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.tags).toEqual(["one", "two"]);
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.Continue()).toBe("one three");
    expect(ctx.story.currentTags!).toEqual(["one", "three"]);
  });

  test("`{expr}` interpolation inside choice tag content", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "dynamic-tags-in-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentTags!.length).toBe(0);
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe("choice");
    expect(ctx.story.currentChoices[0]?.tags).toEqual(["tag aaabbb"]);
  });

  test("choice text on the line after the choice mark + label", () => {
    const ctx = makeRuntimeStoryFromFile("choices", "newline-after-choice");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices.length).toBe(1);
    expect(ctx.story.currentChoices[0]?.text).toBe(
      "I did have one interesting fact about bricklaying, if you don't mind me spending taking a fair bit of time to lay the groundwork for it.",
    );
  });

  test("fallback choices remain hidden after state save/load", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "state-rollback-over-default-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Text.\n");
    expect(ctx.story.currentChoices.length).toBe(0);

    const saved = ctx.story.state.ToJson() as string;
    ctx.story.state.LoadJson(saved);

    expect(ctx.story.currentChoices.length).toBe(0);

    expect(ctx.story.Continue()).toBe("5\n");
  });

  test("sequential choose blocks (rewrite of inkjs `- * x` gather-choice pattern)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "choices",
      "sequential-choose-blocks",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.currentChoices[0]?.text).toBe("hello");
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).toBe("hello\n");
    expect(ctx.story.currentChoices[0]?.text).toBe("world");
  });
});

describe.skip("Choices — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("nested choice error (sparkdown allows nested choose-in-if)", () => {});

  test("empty choice warning (grammar-ambiguous with multi-line choice text)", () => {});
});
