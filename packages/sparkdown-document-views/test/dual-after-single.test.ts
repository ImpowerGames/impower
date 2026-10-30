import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

const FIXTURE =
  `BUNNY:\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  I can do crime!\n` +
  `\n` +
  `RAFFLES [<]:\n` +
  `  B--\n` +
  `\n` +
  `BUNNY [>]:\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  Would'ya QUIT Bunny-ing me??\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  I REFUSE TO BE 'BUNNY'-ED!\n` +
  `\n` +
  `RAFFLES:\n` +
  `  Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

describe("dual dialogue after single dialogue (user fixture)", () => {
  it("renders the dual pair (B--  ||  Would'ya QUIT...)", () => {
    const pdf = extractPdfText(FIXTURE);
    const r = renderPreview(FIXTURE);

    expect(pdf).toContain("BUNNY");
    expect(pdf).toContain("RAFFLES");
    expect(pdf).toContain("I can do crime!");
    expect(pdf).toContain("B--");
    expect(pdf).toContain("Would'ya QUIT Bunny-ing me??");
    expect(pdf).toContain("I REFUSE TO BE 'BUNNY'-ED!");
    expect(pdf).toContain("you wanted to movie hop");

    expect(r.contentHTML).toContain("B--");
    expect(r.contentHTML).toContain("Would'ya QUIT Bunny-ing me??");
    expect(r.contentHTML).toContain("I REFUSE TO BE 'BUNNY'-ED!");

    expect(r.contentHTML).toMatch(
      /<div style="[^"]*display: grid[^"]*">[^]*?Would'ya QUIT/,
    );
  });
});
