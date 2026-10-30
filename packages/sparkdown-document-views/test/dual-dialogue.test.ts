import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

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
    const r = renderPreview(FIXTURE);

    expect(pdf).toContain("RAFFLES");
    expect(pdf).toContain("JACK");
    expect(pdf).toContain("You mean--");
    expect(pdf).toContain("YUP");
    expect(pdf).toContain("But--");
    expect(pdf).toContain("Ehp, ehp, ehp!");
    expect(pdf).toContain("(cutting him off)");

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
    const r = renderPreview(source);

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

    expect(r.contentHTML).toContain("YUP");
    expect(r.contentHTML).toContain("The crew scatters.");
    const yupIdxCH = r.contentHTML.indexOf("YUP");
    const actionIdxCH = r.contentHTML.indexOf("The crew scatters.");
    expect(yupIdxCH).toBeGreaterThan(-1);
    expect(actionIdxCH).toBeGreaterThan(yupIdxCH);
    const between = r.contentHTML.slice(yupIdxCH, actionIdxCH);
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
    const r = renderPreview(FIXTURE_WS);

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

    const gridMatches2 = r.contentHTML.match(/<div style="[^"]*display: grid[^"]*">/g);
    expect(gridMatches2?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(r.contentHTML).toContain("You mean--");
    expect(r.contentHTML).toContain("But--");
    expect(r.contentHTML).toContain("cutting him off");
  });
});
