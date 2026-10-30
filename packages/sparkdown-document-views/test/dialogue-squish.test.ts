import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { renderPreview } from "./helpers/renderPreview";

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

    const collapseLines = render.lines.filter((l) =>
      l.html.includes('class="cm-line collapse"'),
    );
    expect(collapseLines.length).toBeGreaterThanOrEqual(1);
  });
});
