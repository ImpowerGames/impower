import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";

const ARM_DIALOGUE =
  `scene s\n` +
  `  queue\n` +
  `    | GUIDE (softly):\n` +
  `        Welcome back.\n` +
  `        It has been a while.\n` +
  `    | Other line.\n` +
  `  end\n` +
  `end\n`;

const BRANCH_DIALOGUE =
  `scene s\n` +
  `  if true then\n` +
  `    GUIDE (softly):\n` +
  `      Welcome back.\n` +
  `      It has been a while.\n` +
  `  else\n` +
  `    Other line.\n` +
  `  end\n` +
  `end\n`;

const dialogueLines = (output: string): string[] =>
  output
    .split("\n")
    .filter(
      (line) =>
        line.includes("GUIDE") ||
        line.includes("Welcome back.") ||
        line.includes("It has been a while.") ||
        line.includes("Other line."),
    );

describe("a block dialogue opened right after an alternator arm's bar", () => {
  it("prints its lines as dialogue, as the same dialogue in an if branch does", () => {
    expect(dialogueLines(extractPdfText(BRANCH_DIALOGUE))).toEqual([
      "<character> GUIDE (softly)",
      "<dialogue> Welcome back.",
      "<dialogue> It has been a while.",
      "<action> Other line.",
    ]);
    expect(dialogueLines(extractPdfText(ARM_DIALOGUE))).toEqual([
      "<character> GUIDE (softly)",
      "<dialogue> Welcome back.",
      "<dialogue> It has been a while.",
      "<action> Other line.",
    ]);
  });

  it("ends the dialogue at the next arm's bar even when that bar is indented deeper", () => {
    const deeperArm = ARM_DIALOGUE.replace("    | Other line.", "      | Other line.");
    expect(dialogueLines(extractPdfText(deeperArm))).toEqual([
      "<character> GUIDE (softly)",
      "<dialogue> Welcome back.",
      "<dialogue> It has been a while.",
      "<action> Other line.",
    ]);
  });

  it("reads the lines as dialogue at one level under the bar's line, as the formatter writes them", () => {
    expect(dialogueLines(extractPdfText(ARM_DIALOGUE.replaceAll("        ", "      ")))).toEqual([
      "<character> GUIDE (softly)",
      "<dialogue> Welcome back.",
      "<dialogue> It has been a while.",
      "<action> Other line.",
    ]);
  });
});
