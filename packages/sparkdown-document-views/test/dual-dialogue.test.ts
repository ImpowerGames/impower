// Back-to-back dual dialogue: two consecutive left/right pairs.
// Reported bug: only the first pair renders; the second pair vanishes
// from the preview. We dump pdf + preview text + rendered DOM so the
// failure mode is visible.

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { extractPreviewText } from "./helpers/previewText";
import { formatRender, renderPreview } from "./helpers/renderPreview";

const FIXTURE =
  `RAFFLES [<]:\n` +
  `  You mean--\n` +
  `\n` +
  `JACK [>]:\n` +
  `  YUP.  We got reshoots all weekend.\n` +
  `  So it happens today!\n` +
  `\n` +
  `RAFFLES [<]:\n` +
  `  But--\n` +
  `\n` +
  `JACK [>]:\n` +
  `  (cutting him off)\n` +
  `  Ehp, ehp, ehp!\n`;

// Same content but with TRAILING WHITESPACE on the inter-pair blank
// lines, matching what an editor leaves behind when the user indents
// into a dialogue block and deletes back to nothing. The single-block
// squish fix (ScreenplayParser + screenplayFormatting) handles this
// shape for plain dialogue; verifying the dual-dialogue path here.
const FIXTURE_WS =
  `RAFFLES [<]:\n` +
  `  You mean--\n` +
  `  \n` +
  `JACK [>]:\n` +
  `  YUP.  We got reshoots all weekend.\n` +
  `  So it happens today!\n` +
  `  \n` +
  `RAFFLES [<]:\n` +
  `  But--\n` +
  `  \n` +
  `JACK [>]:\n` +
  `  (cutting him off)\n` +
  `  Ehp, ehp, ehp!\n`;

describe("back-to-back dual dialogue", () => {
  it("renders BOTH pairs (text and content)", () => {
    const pdf = extractPdfText(FIXTURE);
    const preview = extractPreviewText(FIXTURE);
    const r = renderPreview(FIXTURE);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "dual-dialogue.txt"),
      `## fixture\n${FIXTURE}\n## pdf\n${pdf}\n## preview\n${preview}\n## rendered\n${formatRender(r)}\n`,
    );

    // Sanity: PDF must contain all four character cues and their content.
    expect(pdf).toContain("RAFFLES");
    expect(pdf).toContain("JACK");
    expect(pdf).toContain("You mean--");
    expect(pdf).toContain("YUP");
    expect(pdf).toContain("But--");
    expect(pdf).toContain("Ehp, ehp, ehp!");
    expect(pdf).toContain("(cutting him off)");

    // Dual widget is rendered as a block decoration — a sibling of
    // cm-lines under .cm-content, not inside one. Verify both pairs'
    // grid containers are present with the expected content.
    const gridMatches = r.contentHTML.match(/<div style="[^"]*display: grid[^"]*">/g);
    expect(gridMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(r.contentHTML).toContain("You mean--");
    expect(r.contentHTML).toContain("But--");
    expect(r.contentHTML).toContain("cutting him off");
  });

  it("emits a blank-line separator between a dual-dialogue pair and a following action when the blank line carries indent", () => {
    const source =
      `RAFFLES [<]:\n` +
      `  You mean--\n` +
      `  \n` +
      `JACK [>]:\n` +
      `  YUP.\n` +
      `  \n` +
      `The crew scatters.\n`;
    const pdf = extractPdfText(source);
    const preview = extractPreviewText(source);
    const r = renderPreview(source);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "dual-dialogue-to-action.txt"),
      `## fixture\n${source}\n## pdf\n${pdf}\n## preview\n${preview}\n## rendered\n${formatRender(r)}\n`,
    );

    // The action line must be separated from the dual-dialogue pair by
    // a blank line in both the PDF token stream and the preview text.
    const pdfLines = pdf.split("\n");
    const yupIdx = pdfLines.findIndex((l) => l.includes("YUP"));
    const actionIdx = pdfLines.findIndex((l) =>
      l.includes("<action> The crew scatters."),
    );
    expect(yupIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(yupIdx);
    expect(
      pdfLines.slice(yupIdx + 1, actionIdx).some((l) => l === ""),
      `pdf: expected blank line between YUP (idx ${yupIdx}) and action (idx ${actionIdx}); got ${JSON.stringify(pdfLines.slice(yupIdx + 1, actionIdx))}`,
    ).toBe(true);

    // Preview rendering: the dual widget is a BLOCK widget rendered
    // as a sibling of cm-lines. The action line is in its own cm-line.
    // There must be at least one empty cm-line between them — visual
    // blank that prevents the widget and action from squishing together.
    expect(r.contentHTML).toContain("YUP");
    expect(r.contentHTML).toContain("The crew scatters.");
    const yupIdxCH = r.contentHTML.indexOf("YUP");
    const actionIdxCH = r.contentHTML.indexOf("The crew scatters.");
    expect(yupIdxCH).toBeGreaterThan(-1);
    expect(actionIdxCH).toBeGreaterThan(yupIdxCH);
    const between = r.contentHTML.slice(yupIdxCH, actionIdxCH);
    // Match an empty cm-line (with only widgetBuffer markers / spans,
    // no actual text content beyond &nbsp;-like whitespace).
    const emptyCmLineMatches = between.match(
      /<div class="cm-line[^"]*"[^>]*>(?:<img[^>]*>|<span[^>]*><\/span>|\s)*<\/div>/g,
    );
    expect(
      (emptyCmLineMatches?.length ?? 0) > 0,
      `expected an empty separator cm-line between the dual widget and the action; got: ${between.slice(0, 500)}`,
    ).toBe(true);
  });

  it("emits a blank-line separator between pairs even when the source blank line carries indent", () => {
    const pdf = extractPdfText(FIXTURE_WS);
    const preview = extractPreviewText(FIXTURE_WS);
    const r = renderPreview(FIXTURE_WS);
    const dir = resolve(__dirname, "snapshots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "dual-dialogue-ws.txt"),
      `## fixture\n${FIXTURE_WS}\n## pdf\n${pdf}\n## preview\n${preview}\n## rendered\n${formatRender(r)}\n`,
    );

    // PDF: separators must appear between consecutive dual-dialogue
    // pairs. Each pair is "<character dual=l>...<character dual=r>...".
    // We look for the gap between a dual=r block and the next dual=l
    // block, and require at least one blank line in between.
    const pdfLines = pdf.split("\n");
    let lastRightIdx = -1;
    for (let i = 0; i < pdfLines.length; i++) {
      const line = pdfLines[i]!;
      if (line.includes("dual=r>")) lastRightIdx = i;
      if (line.includes("<character dual=l>") && lastRightIdx >= 0) {
        const between = pdfLines.slice(lastRightIdx + 1, i);
        expect(
          between.some((l) => l === ""),
          `pdf: expected a blank line between dual=r at idx ${lastRightIdx} and the next <character dual=l> at idx ${i} but got ${JSON.stringify(between)}`,
        ).toBe(true);
      }
    }

    // Preview: render must still show both pairs — the squish bug here
    // is "separator missing", but verify the second pair is still
    // visible too (regression check on the prior fix). Dual widgets
    // are blocks; check both grid containers render with content.
    const gridMatches2 = r.contentHTML.match(/<div style="[^"]*display: grid[^"]*">/g);
    expect(gridMatches2?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(r.contentHTML).toContain("You mean--");
    expect(r.contentHTML).toContain("But--");
    expect(r.contentHTML).toContain("cutting him off");
  });
});
