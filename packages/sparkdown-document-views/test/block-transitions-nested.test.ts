import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

describe("nested-indent single-dialogue → action squish", () => {
  it("dialogue inside a 4-space-indented parent, body at 6-space indent, blank line at 6-space indent, action at 4-space indent", () => {
    const source =
      `    RAFFLES:\n` +
      `      [[raffles_confident~coat]]\n` +
      `      (tucking scripts away)\n` +
      `      Oh Bunny,  we're not going to DDP... >\n` +
      `      [[raffles_flirty~coat]]\n` +
      `      I said Danby and I were close,  didn't I? >\n` +
      `      [[raffles_happy~coat]]\n` +
      `      We'll just pop by for a visit!\n` +
      `      \n` +
      `    He ((sfx_shoes_stopping)) stops and gestures to...\n`;
    const pdf = extractPdfText(source);
    const r = renderPreview(source);

    const pdfLines = pdf.split("\n");
    const lastDialogueIdx = pdfLines.findIndex((l) =>
      l.includes("pop by for a visit!"),
    );
    const actionIdx = pdfLines.findIndex((l) => l.includes("stops and gestures"));
    expect(lastDialogueIdx, "pdf: missing last dialogue line").toBeGreaterThan(
      -1,
    );
    expect(actionIdx, "pdf: missing action line").toBeGreaterThan(
      lastDialogueIdx,
    );
    expect(
      pdfLines.slice(lastDialogueIdx + 1, actionIdx).some((l) => l === ""),
      `pdf: no blank line between dialogue and action; got ${JSON.stringify(pdfLines.slice(lastDialogueIdx + 1, actionIdx))}`,
    ).toBe(true);

    const beforeIdx = r.lines.findIndex((l) =>
      l.html.includes("pop by for a visit!"),
    );
    const afterIdx = r.lines.findIndex((l) =>
      l.html.includes("stops and gestures"),
    );
    expect(beforeIdx, "DOM missing dialogue body").toBeGreaterThan(-1);
    expect(afterIdx, "DOM missing action").toBeGreaterThan(beforeIdx);
    const between = r.lines.slice(beforeIdx + 1, afterIdx);
    expect(
      between.some((l) => l.text.trim() === ""),
      `DOM: no empty cm-line between dialogue body (idx ${beforeIdx}) and action (idx ${afterIdx}). Intervening: ${JSON.stringify(between.map((l) => l.text))}`,
    ).toBe(true);

    const directiveOnlyLines = r.lines.filter(
      (l) =>
        l.text.trim().length === 0 &&
        !l.html.includes("cm-line collapse") &&
        !l.html.match(/^<div class="cm-line"><br><\/div>$/),
    );
    for (const line of directiveOnlyLines) {
      const outerStyleMatch = line.html.match(
        /^<div class="cm-line"[^>]*style="([^"]*)"/,
      );
      const outerStyle = outerStyleMatch ? outerStyleMatch[1]! : "";
      expect(
        outerStyle.includes("display: none"),
        `directive-only cm-line ${line.index} still has visible block layout — should have display:none on its outer style. Got style="${outerStyle}" html=${line.html.slice(0, 200)}`,
      ).toBe(true);
    }
  });
});
