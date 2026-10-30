import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const tokensOf = (source: string) => new ScreenplayParser().parse(source);

describe("spaced `>` break in the screenplay export", () => {
  it("keeps both halves of a mid-line break and prints no `>`", () => {
    const tokens = tokensOf(`HERO: Hi. > Bye.\n`);
    const dialogue = tokens
      .filter((t) => t.tag === "dialogue_content")
      .map((t) => t.text ?? "");
    expect(dialogue.join(" ")).toContain("Hi.");
    expect(dialogue.join(" ")).toContain("Bye.");
    expect(dialogue.join(" ")).not.toContain(">");
  });

  it("prints no `>` for a lone `>`, `> Hello` or a block break", () => {
    const copy = generateScreenplayReadingCopy(
      tokensOf(`HERO: Hi.\n>\n> Hello\nHERO:\n  One. > Two.\n  >\n  Three.\n`),
    );
    for (const word of ["Hi.", "Hello", "One.", "Two.", "Three."]) {
      expect(copy).toContain(word);
    }
    expect(copy).not.toContain(">");
  });
});
