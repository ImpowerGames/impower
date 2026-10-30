import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const SCRIPT = `---\ntitle: The Heist\ntypecheck: strict\nauthor: A. J. Raffles\n---\n\nHe walks into the room.\n`;

describe("the typecheck front matter field", () => {
  it("is not among the title page's metadata", () => {
    const tags = new ScreenplayParser().parse(SCRIPT).map((t) => t.tag);
    expect(tags).toContain("meta:title");
    expect(tags).toContain("meta:author");
    expect(tags).not.toContain("meta:typecheck");
  });

  it("is left out of the reading copy's front matter", () => {
    const out = generateScreenplayReadingCopy(new ScreenplayParser().parse(SCRIPT));
    expect(out).toContain("title: The Heist\n");
    expect(out).toContain("author: A. J. Raffles\n");
    expect(out).not.toContain("typecheck");
  });
});
