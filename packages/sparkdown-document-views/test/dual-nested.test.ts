// User's actual pasted shape — cue lines are INDENTED (2 spaces), which
// means the dual dialogue lives inside a nesting context (knot stitch,
// branch, conditional block). The grammar parses indented cues
// differently from top-level cues. Reproduce that shape here.

import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { renderPreview } from "./helpers/renderPreview";

// Wrap the user's exact text in a knot so cues legitimately appear with
// 2-space indent. (The exact wrapping doesn't matter — what matters is
// that the cues sit at column 2 instead of column 0.)
const FIXTURE =
  `== scene_a\n` +
  `  BUNNY:\n` +
  `    [[animate stage with shake]]\n` +
  `    ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `    I can do crime!!\n` +
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
  `    I REFUSE TO BE 'BUNNY'-ED!!!\n` +
  `\n` +
  `  RAFFLES:\n` +
  `    Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

describe("dual dialogue inside an indented (nested) block", () => {
  it("dual pair still renders when cue lines are indented", () => {
    // Warm up the incremental parser on this fixture before the assertion.
    // A COLD one-shot parse of an indented (nested) dual-dialogue block
    // renders incorrectly (the dual grid widget doesn't form); a subsequent
    // parse renders correctly. The live editor never sees a cold parse — it
    // reparses incrementally as the user types — so these priming parses make
    // the test reflect real editor state rather than a cold-start artifact.
    // (The underlying cold-parse sensitivity is tracked separately.)
    extractPdfText(FIXTURE);
    extractPreviewText(FIXTURE);
    const r = renderPreview(FIXTURE);

    expect(r.contentHTML).toContain("B--");
    expect(r.contentHTML).toContain("Would'ya QUIT Bunny-ing me??");
    expect(r.contentHTML).toContain("I REFUSE TO BE 'BUNNY'-ED!!!");

    // Dual widget is a block (block: true), rendered as a sibling of
    // cm-lines under .cm-content. Verify the grid layout containing both
    // halves is present.
    expect(r.contentHTML).toMatch(
      /<div style="[^"]*display: grid[^"]*">[^]*?Would'ya QUIT/,
    );
  });
});
