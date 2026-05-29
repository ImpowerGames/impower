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

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview, formatRender } from "./helpers/renderPreview";

const dir = resolve(__dirname, "snapshots");
mkdirSync(dir, { recursive: true });

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
      writeFileSync(
        resolve(
          dir,
          `block-transition-${c.name.replace(/[^a-z0-9]+/gi, "-")}.txt`,
        ),
        `## fixture\n${c.source}\n## pdf\n${pdf}\n## rendered\n${formatRender(r)}\n`,
      );

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

      // (2) Rendered DOM: there must be at least one cm-line between
      // the line containing beforeNeedle and the line containing
      // afterNeedle, and that intervening cm-line must be empty (no
      // text content). That empty cm-line is what gives the visible
      // vertical separation — even at opacity:0 it still occupies the
      // default cm-line line-height and reads as blank space. If a
      // widget consumed the source's trailing blank line, the two
      // blocks become adjacent cm-lines with no empty cm-line between.
      const beforeIdx = indexOfLineContaining(r.lines, c.beforeNeedle);
      const afterIdx = indexOfLineContaining(r.lines, c.afterNeedle);
      expect(
        beforeIdx,
        `rendered DOM missing "${c.beforeNeedle}"`,
      ).toBeGreaterThan(-1);
      expect(
        afterIdx,
        `rendered DOM missing "${c.afterNeedle}"`,
      ).toBeGreaterThan(-1);
      const between = r.lines.slice(beforeIdx + 1, afterIdx);
      expect(
        between.some((l) => l.text.trim() === ""),
        `rendered DOM: no empty cm-line between "${c.beforeNeedle}" (idx ${beforeIdx}) and "${c.afterNeedle}" (idx ${afterIdx}) — the widget consumed the trailing blank line, leaving the blocks squished. Intervening lines: ${JSON.stringify(between.map((l) => l.text))}`,
      ).toBe(true);
    });
  }
});
