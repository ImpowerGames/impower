// A `.sd` file's `typecheck:` front matter field tells the compiler how
// strictly to type check the file's Luau. It says nothing about the script,
// so it never reaches the title page: not the parser's metadata tokens that
// the PDF, HTML and preview title pages are laid out from, and not the
// front matter of the reading copy.

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
