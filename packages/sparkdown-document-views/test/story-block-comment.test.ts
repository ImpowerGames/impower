import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

const SCRIPT =
  `scene start\n` +
  `  Before the passage.\n` +
  `  /* first hidden line\n` +
  `  second hidden line\n` +
  `  third hidden line */\n` +
  `  After the passage.\n` +
  `  Hello /* inline note */ there.\n` +
  `  RAFFLES:\n` +
  `    Good /* aside note */ evening.\n` +
  `  choose\n` +
  `    + Go /* choice note */ left\n` +
  `      done\n` +
  `  end\n` +
  `end\n`;

const HIDDEN = ["hidden line", "inline note", "aside note", "choice note", "/*", "*/"];

describe("a story block comment in the screenplay", () => {
  it("is left out of the PDF export", () => {
    const pdf = extractPdfText(SCRIPT);
    expect(pdf).toContain("Before the passage.");
    expect(pdf).toContain("After the passage.");
    expect(pdf).toContain("Hello there.");
    expect(pdf).toContain("Good evening.");
    expect(pdf).toContain("Go left");
    for (const text of HIDDEN) expect(pdf).not.toContain(text);
  });

  it("lays out a whole-line block comment as the same lines of // comments", () => {
    const block =
      `scene start\n` +
      `  Before.\n` +
      `  /* one\n` +
      `  two */\n` +
      `  After.\n` +
      `  done\n` +
      `end\n`;
    const lines =
      `scene start\n` +
      `  Before.\n` +
      `  // one\n` +
      `  // two\n` +
      `  After.\n` +
      `  done\n` +
      `end\n`;
    expect(extractPdfText(block)).toBe(extractPdfText(lines));
  });

  it("is left out of the reading copy", () => {
    const out = generateScreenplayReadingCopy(new ScreenplayParser().parse(SCRIPT));
    expect(out).toContain("After the passage.");
    for (const text of HIDDEN) expect(out).not.toContain(text);
  });

  it("is not shown in the screenplay preview", () => {
    const r = renderPreview(SCRIPT);
    const shown = r.lines.map((l) => l.text).join("\n");
    expect(shown).toContain("Before the passage.");
    expect(shown).toContain("After the passage.");
    for (const text of HIDDEN) expect(shown).not.toContain(text);
  });
});
