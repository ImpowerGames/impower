// A `..` glue mark is not a word of the script: the screenplay export prints
// no `..` where it marks a join, whether it ends a line, begins one (after a
// cue's colon too) or stands on either side of a `>` break. A `..` right after
// a top-level interpolation is text the player shows, so it is printed.

import { describe, expect, it } from "vitest";
import ScreenplayParser from "../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayReadingCopy } from "../../sparkdown-screenplay/src/utils/generateScreenplayReadingCopy";

const copyOf = (source: string) =>
  generateScreenplayReadingCopy(new ScreenplayParser().parse(source));

describe("`..` glue marks in the screenplay export", () => {
  it("prints no mark that joins", () => {
    const copy = copyOf(
      `HERO: Hold on .. > .. tight.\n\nHERO:\n  Abso.. >..lutely.\n\nYou see a ..\n.. rusty key.\n\nALICE: .. It's me.\n`,
    );
    for (const words of [
      "Hold on",
      "tight.",
      "Abso",
      "lutely.",
      "You see a",
      "rusty key.",
      "It's me.",
    ]) {
      expect(copy).toContain(words);
    }
    expect(copy).not.toContain("..");
  });

  it("prints a `..` the player shows after an interpolation", () => {
    expect(copyOf(`{3} .. and more.\n`)).toContain(".. and more.");
  });
});
