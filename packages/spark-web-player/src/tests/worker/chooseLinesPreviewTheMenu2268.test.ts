import { describe, expect, it } from "vitest";
import { playFrom, previewAt } from "./playFromLine";

const CAPTION = `scene start
  choose
    ALICE:
      Listen carefully. >
      [[mia]]
      Will you help?
    * [Yes.]
      Thank you.
  end
end
`;

const RESPONSE = `scene start
  choose
    * [North.] You turn north.
    * [South.]
  end
end
`;

const DIVERT = `scene start
  choose
    * [North.] -> start
    * [South.]
  end
end
`;

const GATED = `scene start
  choose
    ALICE:
      Listen carefully. >
      Where now?
    if true then
      * [North.]
      * [South.]
    end
  end
  After.
end
`;

const MENU = ["Will you help?", "Yes."];
const GATED_MENU = ["Where now?", "North.", "South."];
const SPEAKER = ["Listen carefully."];
const COMPASS = ["North.", "South."];

describe("the preview at a choose block's structural lines", () => {
  it.each([
    ["the choose line", CAPTION, 1, MENU, ["Listen carefully.", "Thank you."]],
    ["the caption's speaker line", CAPTION, 2, SPEAKER, ["Will you help?", "Yes."]],
    ["the block's end", CAPTION, 8, MENU, ["Listen carefully.", "Thank you."]],
    ["an option line with response text", RESPONSE, 2, COMPASS, ["You turn north."]],
    ["an option line with a divert", DIVERT, 2, COMPASS, []],
    ["a bare option line", CAPTION, 6, MENU, ["Thank you."]],
    ["the question line", CAPTION, 5, MENU, ["Thank you."]],
    ["the speaker's line", CAPTION, 3, SPEAKER, ["Will you help?"]],
    ["the choose line of a block whose options sit inside an if", GATED, 1, GATED_MENU, ["Listen carefully.", "After."]],  ] as const)(
    "at %s, shows what the game shows there",
    async (_name, source, line, shown, hidden) => {
      const text = await previewAt(source, line);
      for (const words of shown) {
        expect(text).toContain(words);
      }
      for (const words of hidden) {
        expect(text).not.toContain(words);
      }
    },
    120_000,
  );
});

describe("PLAY from a choose block's structural lines", () => {
  it.each([
    ["the choose line", CAPTION, 1, "Listen carefully.ALICE"],
    ["the caption's speaker line", CAPTION, 2, "Will you help?ALICEYes."],
    ["the block's end", CAPTION, 8, "Thank you."],
    ["an option line with response text", RESPONSE, 2, "You turn north."],
    ["an option line with a divert", DIVERT, 2, "South."],
  ] as const)("from %s, starts where it did", async (_name, source, line, text) => {
    const outcome = await playFrom(source, line);
    expect(outcome.started).toBe(true);
    expect(outcome.text).toBe(text);
  }, 120_000);
});
