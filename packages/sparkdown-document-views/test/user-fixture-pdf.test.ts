// Diagnostic for the 2026-06-13 user reproducer — verifies the PDF
// export shows the blank-line separator between the dialogue and the
// following action, not just the preview.
import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";
import { extractPdfText } from "./helpers/pdfText";

const USER_FIXTURE = `  \n  BUNNY:\n    I-I know...\n    \n  A beat.\n  \n`;

describe("user reproducer 2026-06-13 — PDF / reading copy export", () => {
  it("dumps tokens, reading copy, and pdf extract for inspection", () => {
    const tokens = new ScreenplayParser().parse(USER_FIXTURE);
    console.log("\nTOKENS:", JSON.stringify(tokens, null, 2));
    console.log("\nREADING COPY:");
    console.log(generateScreenplayReadingCopy(tokens));
    console.log("\nPDF EXTRACT:");
    console.log(extractPdfText(USER_FIXTURE));
  });

  it("PDF export: blank line between BUNNY's dialogue and `A beat.` action", () => {
    const pdf = extractPdfText(USER_FIXTURE);
    const lines = pdf.split("\n");
    const dialogueIdx = lines.findIndex((l) =>
      l.includes("<dialogue> I-I know"),
    );
    const actionIdx = lines.findIndex((l) =>
      l.includes("<action> A beat."),
    );
    expect(dialogueIdx, `pdf:\n${pdf}`).toBeGreaterThan(-1);
    expect(actionIdx, `pdf:\n${pdf}`).toBeGreaterThan(dialogueIdx);
    expect(
      lines.slice(dialogueIdx + 1, actionIdx).some((l) => l === ""),
      `expected blank line between dialogue and action; got: ${JSON.stringify(lines.slice(dialogueIdx + 1, actionIdx))}`,
    ).toBe(true);
  });

  it("reading copy: blank line between BUNNY's dialogue and `A beat.` action", () => {
    const out = generateScreenplayReadingCopy(
      new ScreenplayParser().parse(USER_FIXTURE),
    );
    expect(out).toMatch(/I-I know\.\.\.\n\nA beat\./);
  });
});
