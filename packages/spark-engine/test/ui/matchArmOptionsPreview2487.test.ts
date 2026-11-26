import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const ONE_LINE_ARMS = `scene start
  choose
    Prompt.
    match "b"
      | a = * A
      | b = * B
    end
    * Outer
  end
end
`;

const NESTED_CHOOSE_ARM = `scene start
  choose
    Prompt.
    match "b"
      | a = * A
      | b =
        do
          choose
            * Z
              Took Z.
          end
        end
    end
    * Outer
  end
end
`;

const BLOCK_ARMS = `scene start
  choose
    Prompt.
    match "b"
      | a =
        * A
      | b =
        * B
    end
    * Outer
  end
end
`;

const cases = [
  ["one-line arms", ONE_LINE_ARMS, ["B", "Outer"], [1, 2, 3, 4, 5, 6, 7, 8]],
  ["an arm holding a nested choose", NESTED_CHOOSE_ARM, ["Z", "Outer"], [1, 2, 3, 4, 12, 13, 14]],
  ["block arms", BLOCK_ARMS, ["B", "Outer"], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
] as const;

const previewed = async (source: string, line: number) => {
  const h = createHarness(source, 0, { reactive: true, autoOpenAll: false });
  await h.ready;
  await h.preview(line);
  return (h.game as any)._previewShownDescription;
};

describe("a choose block whose preamble holds a match with option arms (#2487)", () => {
  describe.each(cases)("with %s", (_name, source, options, lines) => {
    test("previews the caption with the options the match selects at the scene's line", async () => {
      expect(await previewed(source, 0)).toEqual({
        kind: "action",
        words: "Prompt.",
        options,
      });
    });

    test("previews the same menu on the block's own lines", async () => {
      for (const line of lines) {
        expect(await previewed(source, line), `line ${line}`).toEqual({
          kind: "action",
          words: "Prompt.",
          options,
        });
      }
    });

    test("plays the caption and the selected options as one beat", async () => {
      const h = createHarness(source, 0, { reactive: true, autoOpenAll: false });
      await h.ready;
      h.game.start();
      const story = h.game.story;
      expect((story.currentText ?? "").trim()).toBe("Prompt.");
      expect(story.currentChoices.map((choice) => choice.text)).toEqual(options);
    });
  });
});
