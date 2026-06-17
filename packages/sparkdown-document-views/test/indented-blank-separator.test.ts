// User-reported regression (2026-06-12, second issue):
//
// "When a blank line after a dialogue is on the same indentation
//  level as the dialogue above it, the dialogue eats the blank
//  separator entirely.
//
//     CHARACTER:
//       dialogue
//
//  This should display after the blank line above, but it doesn't.
//  The blank line doesn't get rendered at all."
//
// Affects both the preview AND the screenplay export, so the root
// cause is in the parser / typesetter layer that they share.
//
// This sweeps the relevant outputs: PDF token stream, reading-copy
// markdown, and rendered preview DOM.

import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";
import { extractPdfText } from "./helpers/pdfText";
import { renderPreview } from "./helpers/renderPreview";

const readingCopy = (source: string) =>
  generateScreenplayReadingCopy(new ScreenplayParser().parse(source));

// The user's exact fixture: a single-character dialogue followed by
// an INDENTED blank line (`  \n`, NOT `\n`), then an action line.
// What an editor leaves behind when the user types into the dialogue
// block, hits Enter to start a new line, and then deletes content
// back to nothing — the indent persists.
const FIXTURE_DIALOGUE_THEN_ACTION =
  `CHARACTER:\n` +
  `  dialogue\n` +
  `  \n` +
  `This should display after the blank line above.\n`;

const FIXTURE_DIALOGUE_THEN_DIALOGUE =
  `BUNNY:\n` +
  `  Hello.\n` +
  `  \n` +
  `RAFFLES:\n` +
  `  Hi back.\n`;

const FIXTURE_DIALOGUE_THEN_SCENE_HEADING =
  `BUNNY:\n` +
  `  Hello, kitchen.\n` +
  `  \n` +
  `$: INT. BEDROOM - NIGHT\n`;

const FIXTURE_DIALOGUE_THEN_TRANSITIONAL =
  `BUNNY:\n` +
  `  See you.\n` +
  `  \n` +
  `%: CUT TO:\n`;

describe("indented-blank separator after dialogue (user bug 2026-06-12)", () => {
  it("PDF: dialogue → action — blank line preserved between blocks", () => {
    const pdf = extractPdfText(FIXTURE_DIALOGUE_THEN_ACTION);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> dialogue"));
    const after = lines.findIndex((l) =>
      l.includes("<action> This should display"),
    );
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between dialogue and action; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("PDF: dialogue → dialogue — blank line preserved between speakers", () => {
    const pdf = extractPdfText(FIXTURE_DIALOGUE_THEN_DIALOGUE);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> Hello."));
    const after = lines.findIndex((l) => l.includes("<character> RAFFLES"));
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between two speakers; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("PDF: dialogue → scene heading — blank line preserved", () => {
    const pdf = extractPdfText(FIXTURE_DIALOGUE_THEN_SCENE_HEADING);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) =>
      l.includes("<dialogue> Hello, kitchen."),
    );
    const after = lines.findIndex((l) =>
      l.includes("INT. BEDROOM - NIGHT"),
    );
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between dialogue and scene heading; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("PDF: dialogue → transitional — blank line preserved", () => {
    const pdf = extractPdfText(FIXTURE_DIALOGUE_THEN_TRANSITIONAL);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> See you."));
    const after = lines.findIndex((l) => l.includes("CUT TO"));
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between dialogue and transitional; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("reading copy: dialogue → action — blank line preserved between blocks", () => {
    const out = readingCopy(FIXTURE_DIALOGUE_THEN_ACTION);
    // Expect an empty line between the dialogue content and the
    // following action text.
    expect(out).toMatch(/dialogue\n\nThis should display/);
  });

  it("reading copy: dialogue → dialogue — blank line preserved between speakers", () => {
    const out = readingCopy(FIXTURE_DIALOGUE_THEN_DIALOGUE);
    expect(out).toMatch(/Hello\.\n\nRAFFLES:/);
  });

  it("preview DOM: dialogue → action — empty cm-line between blocks", () => {
    const r = renderPreview(FIXTURE_DIALOGUE_THEN_ACTION);
    const dialogueIdx = r.lines.findIndex((l) => l.text.includes("dialogue"));
    const actionIdx = r.lines.findIndex((l) =>
      l.text.includes("This should display"),
    );
    expect(dialogueIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(dialogueIdx);
    const between = r.lines.slice(dialogueIdx + 1, actionIdx);
    expect(
      between.some((l) => l.text.trim() === ""),
      `preview: no empty cm-line between dialogue and action. Intervening: ${JSON.stringify(between.map((l) => l.text))}`,
    ).toBe(true);
  });

  // Nested case: everything inside a scene means cues are at column 2,
  // dialogue body at column 4, and the trailing indented blank is at
  // column 4 (matching the body indent, NOT the cue indent).
  // NOTE: the scene declaration is `scene NAME` (no trailing colon) — that
  // is the keyword's syntax. A trailing `:` would start a block-action whose
  // indented body is parsed as action text, not nested dialogue.
  const NESTED_DIALOGUE_THEN_ACTION =
    `scene ACT_ONE\n` +
    `  BUNNY:\n` +
    `    Hello, world.\n` +
    `    \n` +
    `  He looks around.\n`;

  it("PDF (nested in scene): dialogue → action — blank line preserved", () => {
    const pdf = extractPdfText(NESTED_DIALOGUE_THEN_ACTION);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) =>
      l.includes("<dialogue> Hello, world."),
    );
    const after = lines.findIndex((l) =>
      l.includes("<action> He looks around."),
    );
    expect(before, `pdf: ${JSON.stringify(lines)}`).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between dialogue and action (nested); got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("reading copy (nested in scene): dialogue → action — blank line preserved", () => {
    const out = readingCopy(NESTED_DIALOGUE_THEN_ACTION);
    expect(out).toMatch(/Hello, world\.\n\nHe looks around\./);
  });

  it("preview DOM (nested in scene): dialogue → action — empty cm-line between", () => {
    const r = renderPreview(NESTED_DIALOGUE_THEN_ACTION);
    const dialogueIdx = r.lines.findIndex((l) =>
      l.text.includes("Hello, world."),
    );
    const actionIdx = r.lines.findIndex((l) =>
      l.text.includes("He looks around."),
    );
    expect(dialogueIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(dialogueIdx);
    const between = r.lines.slice(dialogueIdx + 1, actionIdx);
    expect(
      between.some((l) => l.text.trim() === ""),
      `preview (nested): no empty cm-line between dialogue and action. Intervening: ${JSON.stringify(between.map((l) => l.text))}`,
    ).toBe(true);
  });

  // Dialogue body that itself contains a directive line then real
  // content, then the same-indent blank, then action. The directive
  // line could affect where the "last content line" boundary lands.
  const DIRECTIVE_DIALOGUE_THEN_ACTION =
    `BUNNY:\n` +
    `  [[show backdrop kitchen]]\n` +
    `  Hello.\n` +
    `  \n` +
    `He looks around.\n`;

  it("PDF (directive in dialogue): dialogue → action — blank line preserved", () => {
    const pdf = extractPdfText(DIRECTIVE_DIALOGUE_THEN_ACTION);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> Hello."));
    const after = lines.findIndex((l) =>
      l.includes("<action> He looks around."),
    );
    expect(before, `pdf: ${JSON.stringify(lines)}`).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between dialogue and action; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  it("reading copy (directive in dialogue): dialogue → action — blank line preserved", () => {
    const out = readingCopy(DIRECTIVE_DIALOGUE_THEN_ACTION);
    expect(out).toMatch(/Hello\.\n\nHe looks around\./);
  });

  // Multiple indented blank lines between two dialogues. The PDF
  // collapses consecutive blanks, but a separator should still appear.
  const MULTIPLE_BLANKS =
    `BUNNY:\n` +
    `  Hello.\n` +
    `  \n` +
    `  \n` +
    `RAFFLES:\n` +
    `  Hi.\n`;

  it("PDF (multiple blanks): dialogue → dialogue — separator preserved", () => {
    const pdf = extractPdfText(MULTIPLE_BLANKS);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> Hello."));
    const after = lines.findIndex((l) => l.includes("<character> RAFFLES"));
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between two dialogues; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  // Same character cue twice in a row.
  const SAME_CHARACTER_REPEAT =
    `BUNNY:\n` +
    `  Hello.\n` +
    `  \n` +
    `BUNNY:\n` +
    `  Anyone there?\n`;

  it("PDF (same character repeated): dialogue → dialogue — separator preserved", () => {
    const pdf = extractPdfText(SAME_CHARACTER_REPEAT);
    const lines = pdf.split("\n");
    const before = lines.findIndex((l) => l.includes("<dialogue> Hello."));
    // Find the SECOND BUNNY (after the first dialogue).
    const after = lines.findIndex(
      (l, i) => i > before && l.includes("<character> BUNNY"),
    );
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(
      lines.slice(before + 1, after).some((l) => l === ""),
      `expected blank line between same character's dialogues; got: ${JSON.stringify(lines.slice(before + 1, after))}`,
    ).toBe(true);
  });

  // Dialogue at end of file with trailing indented blank.
  const DIALOGUE_AT_EOF =
    `BUNNY:\n` +
    `  Final words.\n` +
    `  \n`;

  it("PDF (dialogue at EOF): produces a character + dialogue token", () => {
    const pdf = extractPdfText(DIALOGUE_AT_EOF);
    expect(pdf).toContain("<character> BUNNY");
    expect(pdf).toContain("<dialogue> Final words.");
  });

  it("reading copy (dialogue at EOF): dialogue body still indented", () => {
    const out = readingCopy(DIALOGUE_AT_EOF);
    expect(out).toContain("BUNNY:\n");
    expect(out).toMatch(/\n {2}Final words\.\n/);
  });

  // Direct user-fixture as quoted in their bug report (LITERAL text):
  //   "CHARACTER:\n  dialogue\n  \n"
  // No following content — exact fixture they pasted. Useful to verify
  // the parser still emits the trailing separator even at EOF.
  it("debug: dump tokens for the user's exact literal fixture", () => {
    const fixture = `CHARACTER:\n  dialogue\n  \n`;
    const tokens = new ScreenplayParser().parse(fixture);
    console.log("USER-LITERAL TOKENS:", JSON.stringify(tokens, null, 2));
    // Also dump for the +ACTION variant for comparison.
    const tokensWithAction = new ScreenplayParser().parse(
      fixture + `This should display.\n`,
    );
    console.log(
      "USER-LITERAL + ACTION TOKENS:",
      JSON.stringify(tokensWithAction, null, 2),
    );
  });
});
