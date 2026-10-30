import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

type Case = {
  name: string;
  source: string;
  beforeNeedle: string;
  afterNeedle: string;
};

const CASES: Case[] = [
  {
    name: "single dialogue → action",
    source:
      `BUNNY:\n` +
      `  Hello, world.\n` +
      `  \n` +
      `He looks around.\n`,
    beforeNeedle: "Hello, world.",
    afterNeedle: "He looks around.",
  },
  {
    name: "dual dialogue → action",
    source:
      `RAFFLES [<]:\n` +
      `  You mean--\n` +
      `  \n` +
      `JACK [>]:\n` +
      `  YUP.\n` +
      `  \n` +
      `The crew scatters.\n`,
    beforeNeedle: "YUP",
    afterNeedle: "The crew scatters.",
  },
  {
    name: "action → single dialogue",
    source:
      `He looks around.\n` +
      `  \n` +
      `BUNNY:\n` +
      `  Hello, world.\n`,
    beforeNeedle: "He looks around.",
    afterNeedle: "Hello, world.",
  },
  {
    name: "single dialogue → single dialogue (different character)",
    source:
      `BUNNY:\n` +
      `  Hello.\n` +
      `  \n` +
      `RAFFLES:\n` +
      `  Hi back.\n`,
    beforeNeedle: "Hello.",
    afterNeedle: "Hi back.",
  },
];

describe("block-transition squish — blank line between blocks must remain visible", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const pdf = extractPdfText(c.source);
      const r = renderPreview(c.source);

      const pdfLines = pdf.split("\n");
      const pdfBefore = pdfLines.findIndex((l) => l.includes(c.beforeNeedle));
      const pdfAfter = pdfLines.findIndex((l) => l.includes(c.afterNeedle));
      expect(pdfBefore, `pdf missing "${c.beforeNeedle}"`).toBeGreaterThan(-1);
      expect(pdfAfter, `pdf missing "${c.afterNeedle}"`).toBeGreaterThan(
        pdfBefore,
      );
      expect(
        pdfLines.slice(pdfBefore + 1, pdfAfter).some((l) => l === ""),
        `pdf: no blank line between "${c.beforeNeedle}" and "${c.afterNeedle}"`,
      ).toBe(true);

      const before = c.beforeNeedle;
      const after = c.afterNeedle;
      const beforeIdxCH = r.contentHTML.indexOf(before);
      const afterIdxCH = r.contentHTML.indexOf(after);
      expect(beforeIdxCH, `rendered DOM missing "${before}"`).toBeGreaterThan(-1);
      expect(afterIdxCH, `rendered DOM missing "${after}"`).toBeGreaterThan(
        beforeIdxCH,
      );
      const between = r.contentHTML.slice(beforeIdxCH, afterIdxCH);
      const emptyCmLine = between.match(
        /<div class="cm-line[^"]*"[^>]*>(?:<img[^>]*>|<span[^>]*><\/span>|<br[^>]*>|\s)*<\/div>/g,
      );
      expect(
        (emptyCmLine?.length ?? 0) > 0,
        `rendered DOM: no empty separator cm-line between "${before}" and "${after}". Snippet: ${between.slice(0, 600)}`,
      ).toBe(true);
    });
  }
});
