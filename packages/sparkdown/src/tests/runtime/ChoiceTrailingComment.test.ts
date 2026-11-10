import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const choiceTexts = (choiceLine: string) => {
  const source = `scene start
  -> main
end
scene main
  choose
    ${choiceLine}
      Hi.
      done
  end
end
`;
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.Continue();
  return ctx.story.currentChoices.map((c) => c.text);
};

describe("trailing `//` comment after a choice's text", () => {
  test("is dropped from the choice text", () => {
    expect(choiceTexts("+ Go left // note")).toEqual(["Go left"]);
  });

  test("is dropped after suppressed text", () => {
    expect(choiceTexts("+ Go [left] now // note")).toEqual(["Go left"]);
  });

  test("is dropped from the output after picking a suppressed-text choice", () => {
    const ctx = makeRuntimeStoryFromSource(`scene start
  choose
    + Go [left] now // note
      Hi.
      done
  end
end
`);
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(ctx.story.ContinueMaximally()).not.toContain("note");
  });

  test("is dropped before a divert-free end with no space after the marks", () => {
    expect(choiceTexts("+ Go left //")).toEqual(["Go left"]);
  });

  test("leaves `//` with no surrounding space as text", () => {
    expect(choiceTexts("+ Go http://x")).toEqual(["Go http://x"]);
  });

  test("leaves floor division inside an interpolation as code", () => {
    expect(choiceTexts("+ Take {7 // 2} apples")).toEqual(["Take 3 apples"]);
  });

  test("leaves `//` inside an interpolated string as text", () => {
    expect(choiceTexts('+ Say {"a // b"}')).toEqual(["Say a // b"]);
  });
});
