// Reading copy should keep display blocks indented under their header
// mark so the structure is visually obvious:
//
//   RAFFLES:
//     Some dialogue.
//
//   ^:
//     OPENING CREDITS SEQUENCE
//     RAFFLES & BUNNY
//
// Headers that fit on one line (`$: INT. KITCHEN`, `%: CUT TO:`,
// `^: Single line title`) stay inline — there's no body to indent.

import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const readingCopy = (source: string) =>
  generateScreenplayReadingCopy(new ScreenplayParser().parse(source));

describe("reading copy — indent display blocks under their header", () => {
  it("dialogue body indented under character cue", () => {
    const out = readingCopy(
      `RAFFLES:\n` +
        `  You mean--\n` +
        `  (beat)\n` +
        `  ... A sticky wicket?\n`,
    );
    expect(out).toContain("RAFFLES:\n");
    expect(out).toContain("\n  You mean--\n");
    expect(out).toContain("\n  (beat)\n");
    expect(out).toContain("\n  ... A sticky wicket?\n");
    // No body line should appear flush-left (a regression would put
    // "You mean--" at column 0).
    expect(out).not.toMatch(/^You mean--/m);
    expect(out).not.toMatch(/^\(beat\)/m);
  });

  it("multi-line centered title body indented under the `^:` mark", () => {
    // BlockTitle: `^:` on its own line followed by indented body lines.
    const out = readingCopy(
      `^:\n` + `  OPENING CREDITS SEQUENCE\n` + `  RAFFLES & BUNNY\n`,
    );
    expect(out).toContain("^:\n");
    expect(out).toContain("\n  OPENING CREDITS SEQUENCE\n");
    expect(out).toContain("\n  RAFFLES & BUNNY\n");
  });

  it("single-line title stays inline (no indent)", () => {
    // InlineTitle: `^: text on the same line`.
    const out = readingCopy(`^: Single Line Title\n`);
    expect(out).toContain("^: Single Line Title\n");
  });

  it("action lines are NOT indented", () => {
    const out = readingCopy(
      `He walks into the room.\n` + `He sits down.\n`,
    );
    expect(out).toMatch(/^He walks into the room\.$/m);
    expect(out).toMatch(/^He sits down\.$/m);
    expect(out).not.toMatch(/^ {2}He /m);
  });

  it("scene heading `$:` stays a single line (no body to indent)", () => {
    const out = readingCopy(
      `BUNNY:\n  Hello.\n\n$: INT. KITCHEN - NIGHT\n\nAction.\n`,
    );
    expect(out).toMatch(/^\$: INT\. KITCHEN - NIGHT$/m);
  });

  it("dual dialogue body indented under both character cues", () => {
    const out = readingCopy(
      `RAFFLES [<]:\n  You mean--\n\nJACK [>]:\n  YUP.\n  So it goes.\n`,
    );
    expect(out).toContain("RAFFLES [<]:\n");
    expect(out).toContain("\n  You mean--\n");
    expect(out).toContain("JACK [>]:\n");
    expect(out).toContain("\n  YUP.\n");
    expect(out).toContain("\n  So it goes.\n");
  });
});
