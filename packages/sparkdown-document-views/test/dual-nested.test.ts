import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { renderPreview } from "./helpers/renderPreview";

const FIXTURE =
  `== scene_a\n` +
  `  BUNNY:\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    I can do crime!\n` +
  `\n` +
  `  RAFFLES [<]:\n` +
  `    B--\n` +
  `\n` +
  `  BUNNY [>]:\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    Would'ya QUIT Bunny-ing me??\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    I REFUSE TO BE 'BUNNY'-ED!\n` +
  `\n` +
  `  RAFFLES:\n` +
  `    Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

describe("dual dialogue inside an indented (nested) block", () => {
  it("dual pair still renders when cue lines are indented", () => {
    extractPdfText(FIXTURE);
    extractPreviewText(FIXTURE);
    const r = renderPreview(FIXTURE);

    expect(r.contentHTML).toContain("B--");
    expect(r.contentHTML).toContain("Would'ya QUIT Bunny-ing me??");
    expect(r.contentHTML).toContain("I REFUSE TO BE 'BUNNY'-ED!");

    expect(r.contentHTML).toMatch(
      /<div style="[^"]*display: grid[^"]*">[^]*?Would'ya QUIT/,
    );
  });
});
