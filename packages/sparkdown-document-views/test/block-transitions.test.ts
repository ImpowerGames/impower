// Per user report: "still seeing the dialogue squishing problem when the
// blank line is at the same indent level for dual dialogues. Also seeing
// it if the dialogue is followed by a different display statement like
// action text. Make sure your fix works for all display statement types.
// Each display statement type has a block form, not just dialogue. And
// can be followed by any other type of statement."
//
// Sparkdown's grammar groups "block" forms (BlockDialogue, BlockAction,
// BlockTransitional, BlockHeading, ...) so that any trailing whitespace-
// only line is parsed as a BlockLineBlank INSIDE the block. The block
// node's `to` extends through that trailing blank line. When the
// preview replaces the block's whole range with a widget (dual dialogue
// does this), the blank line is consumed by the widget and there's no
// visible vertical separator before the next block. When the block uses
// per-line decorations (single dialogue, plain action), the blank line
// stays as its own cm-line but with opacity:0 (PREVIEW_THEME default)
// it still occupies line-height — which IS the visible separator. So
// the bug isn't fundamentally "blank lines invisible" — it's "widgets
// consume the trailing blank line that would have been the separator."
//
// This test sweeps the transitions the user described.

import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

// The "blank" lines below carry indent (`  \n` instead of `\n`) — that's
// what the editor leaves behind whenever a user types indented content
// and deletes back to nothing.

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

// "Visible separator" between two blocks in the rendered preview means
// the cm-line containing afterNeedle is on a different visual row than
// the cm-line containing beforeNeedle — i.e., they don't share a parent
// widget. We check that there's at least one cm-line entry between
// them in the formatRender output that isn't part of either.
const indexOfLineContaining = (lines: { html: string }[], needle: string) =>
  lines.findIndex((l) => l.html.includes(needle));

describe("block-transition squish — blank line between blocks must remain visible", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const pdf = extractPdfText(c.source);
      const r = renderPreview(c.source);

      // (1) PDF must show a blank line between the two anchors.
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

      // (2) Rendered DOM: visible vertical separation must exist
      // between the two anchors. Dual dialogue renders as a block
      // widget (sibling of cm-lines) so beforeNeedle isn't in any
      // cm-line in that case — we need to look at the raw cm-content
      // HTML to find the anchor positions, then assert that an empty
      // cm-line (or collapse cm-line) sits between them.
      const before = c.beforeNeedle;
      const after = c.afterNeedle;
      const beforeIdxCH = r.contentHTML.indexOf(before);
      const afterIdxCH = r.contentHTML.indexOf(after);
      expect(beforeIdxCH, `rendered DOM missing "${before}"`).toBeGreaterThan(-1);
      expect(afterIdxCH, `rendered DOM missing "${after}"`).toBeGreaterThan(
        beforeIdxCH,
      );
      const between = r.contentHTML.slice(beforeIdxCH, afterIdxCH);
      // Match any cm-line whose body has no actual text — only
      // widgetBuffer images, empty spans, and whitespace. That empty
      // line is what gives visible separation.
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
