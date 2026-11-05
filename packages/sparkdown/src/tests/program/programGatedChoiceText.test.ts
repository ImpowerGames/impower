import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyRun } from "./programHarness";

const script = (options: string) => `store key = true

scene start
  choose
${options}
  end
  After.
end
`;

const choiceTexts = (options: string, collapseWhitespace: boolean) => {
  const { program } = compileScript(script(options));
  const story = new ProgramStory(program.chunks!);
  story.collapseWhitespace = collapseWhitespace;
  story.processEscapes = false;
  story.ContinueMaximally();
  return story.currentChoices.map((choice) => choice.text);
};

describe.each([true, false])("choice text with collapseWhitespace %s", (collapse) => {
  it("gives a gated option the same text as an ungated one", () => {
    expect(
      choiceTexts(
        "    * if key [Show the key.]\n      Shown.\n    * [Wait.]\n      Waited.",
        collapse,
      ),
    ).toEqual(["Show the key.", "Wait."]);
  });

  it("keeps the inner space of a gated option with start text", () => {
    expect(
      choiceTexts(
        "    * if key Show [the key.]\n      Shown.\n    * Show [the lock.]\n      Waited.",
        collapse,
      ),
    ).toEqual(["Show the key.", "Show the lock."]);
  });

  it("echoes a chosen gated option without a leading space", () => {
    const { program } = compileScript(
      script("    * if key Show the key.\n      Shown.\n    * Wait.\n      Waited."),
    );
    const story = new ProgramStory(program.chunks!);
    story.collapseWhitespace = collapse;
    story.processEscapes = false;
    const run = storyRun(story, [0]);
    expect(run.errors).toEqual([]);
    expect(run.beats.map((beat) => beat.text.trimEnd())).toEqual([
      "Show the key.",
      "Shown.",
      "After.",
    ]);
  });

  it("gives an unbracketed gated option the same text as an ungated one", () => {
    expect(
      choiceTexts(
        "    * if key Show the key.\n      Shown.\n    * Wait.\n      Waited.",
        collapse,
      ),
    ).toEqual(["Show the key.", "Wait."]);
  });
});
