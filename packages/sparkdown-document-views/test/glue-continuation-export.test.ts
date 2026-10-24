// The player decides each `..` join as the story runs, and the screenplay
// export prints every branch of the script, so the export cannot know which
// line a mark joins: it prints every line on its own, with its own kind and
// cue, and prints no glue mark. Where a mark stood at a line's start or end,
// no space is left over. A `..` that is text prints as written.

import { describe, expect, it } from "vitest";
import { extractPdfText } from "./helpers/pdfText";

const lines = (source: string) =>
  extractPdfText(source)
    .split("\n")
    .filter((l) => l !== "");

describe("screenplay export of `..` glue", () => {
  it("prints a `..` line after a one-line speech as a line of its own", () => {
    expect(lines(`HERO: Glue only first\n.. glue only second.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Glue only first",
      "<action> glue only second.",
    ]);
    expect(lines(`HERO: Glue first ..\n.. glue second.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Glue first",
      "<action> glue second.",
    ]);
  });

  it("prints a `..` line inside a dialogue block with no leading space", () => {
    expect(lines(`HERO:\n  Block first\n  .. block second.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Block first",
      "<dialogue> block second.",
    ]);
    expect(lines(`HERO:\n  Block first ..\n  .. block second.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Block first",
      "<dialogue> block second.",
    ]);
    expect(
      lines(
        `HERO: Inline first ..\nHERO:\n  .. block second.\n  block third.\n`,
      ),
    ).toEqual([
      "<character> HERO",
      "<dialogue> Inline first",
      "<character> HERO",
      "<dialogue> block second.",
      "<dialogue> block third.",
    ]);
  });

  it("prints each speech with its cue and no trailing mark", () => {
    expect(lines(`HERO: Trailing first ..\nHERO: trailing second.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Trailing first",
      "<character> HERO",
      "<dialogue> trailing second.",
    ]);
    expect(lines(`HERO: Hello ..\nBOB: .. It's me.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Hello",
      "<character> BOB",
      "<dialogue> It's me.",
    ]);
  });

  it("prints glued action lines as separate paragraphs", () => {
    expect(lines(`Action first\n.. action second.\n`)).toEqual([
      "<action> Action first",
      "<action> action second.",
    ]);
    expect(lines(`Action first..\n..action second.\n`)).toEqual([
      "<action> Action first",
      "<action> action second.",
    ]);
  });

  it("prints the parts on each side of a `>` break with no marks", () => {
    expect(lines(`HERO: Hold on .. > .. tight.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Hold on",
      "<dialogue> tight.",
    ]);
    expect(lines(`HERO: Hold on .. >\n.. tight.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Hold on",
      "<action> tight.",
    ]);
  });

  it("prints a `..` that is text", () => {
    expect(lines(`HERO: a..b and a .. b\n`)).toEqual([
      "<character> HERO",
      "<dialogue> a..b and a .. b",
    ]);
    expect(lines(`Wait...\n...and then\n`)).toEqual([
      "<action> Wait...",
      "<action> ...and then",
    ]);
  });

  it("prints block lines without glue as separate lines", () => {
    expect(lines(`HERO:\n  Plain one.\n  Plain two.\n`)).toEqual([
      "<character> HERO",
      "<dialogue> Plain one.",
      "<dialogue> Plain two.",
    ]);
  });
});
