import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const SOURCE = `??? as raffles (O.S.):\n  You don't remember me?\n\nBUNNY as raffles: I can do his voice.\n`;

describe("a cue that names its speaker with `as` prints only the shown name (#2283)", () => {
  it("the screenplay's character line holds the shown name and the parenthetical", () => {
    const characters = new ScreenplayParser()
      .parse(SOURCE)
      .filter((token: any) => token.tag === "dialogue_character")
      .map((token: any) => token.text);
    expect(characters).toEqual(["??? (O.S.)", "BUNNY"]);
  });

  it("the reading copy holds the shown name and the parenthetical, never the speaker", () => {
    const out = generateScreenplayReadingCopy(new ScreenplayParser().parse(SOURCE));
    expect(out).toContain("??? (O.S.):\n");
    expect(out).toContain("BUNNY:\n  I can do his voice.\n");
    expect(out).not.toContain("as raffles");
  });
});
