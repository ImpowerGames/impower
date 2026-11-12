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
  `  Side /* inline note */ /* inline note */ by side.\n` +
  `  Go *far /* styled note */ away* home.\n` +
  `  RAFFLES:\n` +
  `    Good /* aside note */ evening.\n` +
  `    Very **good /* styled note */ indeed**.\n` +
  `  choose\n` +
  `    + Go /* choice note */ left\n` +
  `      done\n` +
  `    + Run /* [choice note] -> next */ home\n` +
  `      done\n` +
  `    + Stay /* choice note\n` +
  `      choice note */ put\n` +
  `      done\n` +
  `  end\n` +
  `  Lead /* inline note \\\n` +
  `  inline note */ on.\n` +
  `end\n`;

const HIDDEN = ["hidden line", "inline note", "aside note", "choice note", "styled note", "/*", "*/"];

const SPAN_MARKS = ["*", "**", "***", "_", "^", "~~", "::"];

describe("a story block comment in the screenplay", () => {
  it("is left out of the PDF export", () => {
    const pdf = extractPdfText(SCRIPT);
    expect(pdf).toContain("Before the passage.");
    expect(pdf).toContain("After the passage.");
    expect(pdf).toContain("Hello there.");
    expect(pdf).toContain("Side by side.");
    expect(pdf).toContain("Good evening.");
    expect(pdf).toContain("Go left");
    expect(pdf).toContain("Run home");
    expect(pdf).toContain("Stay put");
    expect(pdf).toContain("Lead on.");
    for (const text of HIDDEN) expect(pdf).not.toContain(text);
    for (const text of ["-> next", "[", "]"]) expect(pdf).not.toContain(text);
  });

  it("leaves a line comment in choice text out of the PDF export, with the bracket and arrow inside it", () => {
    const pdf = extractPdfText(
      `scene start\n  choose\n    + Sit // [choice note] -> next\n      done\n  end\nend\n`,
    );
    expect(pdf).toContain("+ Sit");
    for (const text of ["//", "choice note", "-> next", "["]) expect(pdf).not.toContain(text);
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

  it.each(SPAN_MARKS)("inside a %s span is left out of the screenplay and the PDF export, keeping the span", (mark) => {
    const script = (line: string) =>
      `scene start\n  Go ${line} home\n  RAFFLES:\n    Say ${line} again\n  done\nend\n`;
    const commented = script(`${mark}far /* secret */ away${mark}`);
    const plain = script(`${mark}far away${mark}`);
    const parser = new ScreenplayParser();
    expect(parser.parse(commented)).toEqual(parser.parse(plain));
    expect(extractPdfText(commented)).toBe(extractPdfText(plain));
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
