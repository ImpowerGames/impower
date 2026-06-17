// Diagnostic test for "dialogue lines squished together without line
// breaks". We dump both the PDF and the preview extractor outputs for a
// fixture mirroring the user's report so the bug is visible. This is a
// scratch file — we'll convert it into pass/fail assertions once the
// expected behavior is locked down.
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { renderPreview } from "./helpers/renderPreview";

// The "blank" lines below have trailing whitespace ("      ") rather than
// being clean `\n`. This mirrors what the editor produces when the user
// indents into a dialogue block and then deletes back to nothing — Java/
// JavaScript editors don't usually strip trailing whitespace on save, so
// the indent persists on the otherwise-blank line. The grammar wraps that
// whitespace as `BlockLineBlank > Indent`, which used to confuse both the
// PDF parser (ScreenplayParser) and the preview decorator into thinking
// the line had real content — dropping the inter-block separator.
const FIXTURE =
  `RAFFLES:\n` +
  `  [[raffles_concerned~coat]]\n` +
  `  ((sfx_emotional_modest_embarrassed_rev_0))\n` +
  `  ((play music mus_m_group unmute over 5))\n` +
  `  Really...?   \n` +
  `  ...Nothing?? >\n` +
  `  [[raffles_unsure~coat]]\n` +
  `  <!>(beat)\n` +
  `  ... >\n` +
  `  [[raffles_unsure~coat]]\n` +
  `  (gestures with ball)\n` +
  `  ..."A Sticky Wicket"?\n` +
  `      \n` +
  `BUNNY:\n` +
  `  [[bunny_realization~jacket]]\n` +
  `  <!>(realizing)\n` +
  `  Oh! >\n` +
  `  [[bunny_point~jacket]]\n` +
  `  That weird baseball show.\n`;

describe("dialogue squish", () => {
  it("emits a blank-line separator between consecutive dialogue blocks even when the source 'blank' line has trailing whitespace", () => {
    const pdf = extractPdfText(FIXTURE);
    const preview = extractPreviewText(FIXTURE);
    const render = renderPreview(FIXTURE);

    // The bug: separators between consecutive dialogue blocks were dropped
    // when the "blank" line between them was actually whitespace-only
    // (which the editor leaves behind whenever the user indents and then
    // deletes back to nothing). Lock in the fix on both paths: PDF and
    // preview must each show at least one blank line between consecutive
    // character cues.
    const assertBlankBetweenCharacters = (label: string, output: string) => {
      const lines = output.split("\n");
      const indices: number[] = [];
      lines.forEach((line, i) => {
        if (line.startsWith("<character>")) indices.push(i);
      });
      expect(
        indices.length,
        `${label} should contain at least 2 character cues`,
      ).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < indices.length; i++) {
        const prev = indices[i - 1]!;
        const curr = indices[i]!;
        const between = lines.slice(prev + 1, curr);
        expect(
          between.some((l) => l === ""),
          `${label}: expected a blank line between <character> at index ${prev} and <character> at index ${curr}, got: ${JSON.stringify(between)}`,
        ).toBe(true);
      }
    };
    assertBlankBetweenCharacters("pdf", pdf);
    assertBlankBetweenCharacters("preview", preview);

    // The preview decorator must also tag the whitespace-only blank line
    // with the `collapse` class so the bottom-border separator decoration
    // is applied — that's the user-visible separator in the rendered
    // preview pane.
    const collapseLines = render.lines.filter((l) =>
      l.html.includes('class="cm-line collapse"'),
    );
    expect(collapseLines.length).toBeGreaterThanOrEqual(1);
  });
});
