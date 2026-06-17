// User-reported regression (2026-06-12):
//   "Still having instances where dual dialogue is not displaying in
//    the screenplay preview." Fixture:
//
//      BUNNY:                     <- single dialogue
//        [[directive]]
//        ((sfx))
//        I can do crime!!
//
//      RAFFLES [<]:               <- dual LEFT
//        B--
//
//      BUNNY [>]:                 <- dual RIGHT (multi-line, directives interleaved)
//        [[directive]]
//        ((sfx))
//        Would'ya QUIT Bunny-ing me??
//        [[directive]]
//        ((sfx))
//        I REFUSE TO BE 'BUNNY'-ED!!!
//
//      RAFFLES:                   <- single dialogue
//        Bunny, I asked ...
//
// Suspected culprits:
//   1. Single-dialogue → dual-dialogue transition leaves stale state in
//      prevDialogueSpec.
//   2. Multi-content-line RIGHT half with directive lines between
//      content lines causes findBlockContentEnd / reveal to miss content.

import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

const FIXTURE =
  `BUNNY:\n` +
  `  [[animate stage with shake]]\n` +
  `  ((m_todo_sfx_emotional_yelling+temp_sfx_smack))\n` +
  `  I can do crime!!\n` +
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
  `  I REFUSE TO BE 'BUNNY'-ED!!!\n` +
  `\n` +
  `RAFFLES:\n` +
  `  Bunny, I asked if you wanted to movie hop once and you nearly had a panic attack.\n`;

describe("dual dialogue after single dialogue (user fixture)", () => {
  it("renders the dual pair (B--  ||  Would'ya QUIT...)", () => {
    const pdf = extractPdfText(FIXTURE);
    const r = renderPreview(FIXTURE);

    // Sanity: PDF must contain all the visible cues and content.
    expect(pdf).toContain("BUNNY");
    expect(pdf).toContain("RAFFLES");
    expect(pdf).toContain("I can do crime!!");
    expect(pdf).toContain("B--");
    expect(pdf).toContain("Would'ya QUIT Bunny-ing me??");
    expect(pdf).toContain("I REFUSE TO BE 'BUNNY'-ED!!!");
    expect(pdf).toContain("you wanted to movie hop");

    // The dual-dialogue widget must place BOTH cues + their content
    // somewhere in the rendered DOM. Apostrophes inside <span> text
    // are NOT entity-encoded — span text content is raw text. (Attributes
    // are encoded, hence the `[&lt;]` / `[&gt;]` we see in the cue chips.)
    expect(r.contentHTML).toContain("B--");
    expect(r.contentHTML).toContain("Would'ya QUIT Bunny-ing me??");
    expect(r.contentHTML).toContain("I REFUSE TO BE 'BUNNY'-ED!!!");

    // The dual-dialogue widget is a BLOCK widget (Decoration.replace
    // with block: true) — it renders as a sibling of cm-line elements,
    // not inside one. Verify the widget div lives directly under
    // cm-content with the expected grid layout.
    expect(r.contentHTML).toMatch(
      /<div style="[^"]*display: grid[^"]*">[^]*?Would'ya QUIT/,
    );
  });
});
