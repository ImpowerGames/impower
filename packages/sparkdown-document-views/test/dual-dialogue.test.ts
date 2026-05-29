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

    // The rendered DOM is allowed to contain the text either way — the
    // PREVIEW_THEME sets `.cm-line { opacity: 0 }` as a default and the
    // reveal decoration (line attribute `style="opacity: 1"`) is what
    // makes a line visible. Parent opacity:0 propagates to children
    // via CSS compositing, so the inner block styles' "opacity: 1"
    // can't rescue an opacity:0 cm-line. Check the OUTER cm-line
    // attribute directly.
    const dialogueLines = r.lines.filter((l) =>
      l.html.includes("cutting him off") ||
      l.html.includes("You mean--") ||
      l.html.includes("But--"),
    );
    expect(dialogueLines.length).toBeGreaterThanOrEqual(2);
    const OUTER_CM_LINE_OPACITY_1 =
      /^<div class="cm-line"[^>]*style="[^"]*\bopacity:\s*1\b/;
    for (const line of dialogueLines) {
      expect(
        OUTER_CM_LINE_OPACITY_1.test(line.html),
        `dual-dialogue cm-line ${line.index} has no opacity:1 on the OUTER cm-line — PREVIEW_THEME's opacity:0 default makes the entire widget invisible. html: ${line.html.slice(0, 200)}`,
      ).toBe(true);
    }
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

    // (extractPreviewText doesn't surface widget-rendered dialogue
    // content — the dialogue source lines look "empty" to its per-line
    // walk. Use the rendered DOM to verify the preview's visual
    // separation instead.)
    const yupIdx_dom = r.lines.findIndex((l) => l.html.includes("YUP"));
    const actionIdx_dom = r.lines.findIndex((l) =>
      l.html.includes("The crew scatters."),
    );
    expect(yupIdx_dom, "rendered DOM missing YUP").toBeGreaterThan(-1);
    expect(actionIdx_dom, "rendered DOM missing action").toBeGreaterThan(
      yupIdx_dom,
    );
    const between_dom = r.lines.slice(yupIdx_dom + 1, actionIdx_dom);
    expect(
      between_dom.some((l) => l.text.trim() === ""),
      `rendered DOM: no empty cm-line between YUP and action — widget squished them`,
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

    // Preview: render must still show both pairs at opacity:1 — the
    // squish bug here is "separator missing", but verify the second
    // pair is still visible too (regression check on the prior fix).
    const OUTER_CM_LINE_OPACITY_1 =
      /^<div class="cm-line"[^>]*style="[^"]*\bopacity:\s*1\b/;
    const visiblePairs = r.lines.filter(
      (l) =>
        OUTER_CM_LINE_OPACITY_1.test(l.html) &&
        (l.html.includes("You mean--") ||
          l.html.includes("But--") ||
          l.html.includes("cutting him off")),
    );
    expect(visiblePairs.length).toBeGreaterThanOrEqual(2);
  });
});
