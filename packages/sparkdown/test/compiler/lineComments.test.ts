import { describe, expect, test } from "vitest";
import { loadGrammarCorpus } from "./languageEquality";
import {
  formatLineCommentFailures,
  lineCommentResults,
  type SkipReason,
} from "./lineComments";

const SKIPPED_LINE_CLASSES: Record<SkipReason, string> = {
  blank: "the editor comments no blank line, so there is nothing to read",
  "title page":
    "front matter is read by its own field rules, and a marker inside it changes the title page rather than commenting a line",
  comment: "the line starts inside an existing comment, where toggling removes a comment instead of adding one",
  string: "the line starts inside a string that an earlier line opened, so a marker there is string text",
  "closes an open Luau body":
    "the line is a beat that ends a Luau body left open without its end or closing brace, so commenting it out puts the line back inside that body",
};

const FIXTURES = loadGrammarCorpus();

describe("a line inside a story block comment", () => {
  test("is skipped as a line inside an existing comment", async () => {
    const results = await lineCommentResults(
      ["scene start", "  /* one", "  two", "three */", "  four", "end", ""].join("\n"),
    );
    expect(results.map((r) => [r.line, r.skipped])).toEqual([
      [1, undefined],
      [2, undefined],
      [3, "comment"],
      [4, "comment"],
      [5, undefined],
      [6, undefined],
      [7, "blank"],
    ]);
    expect(results.filter((r) => r.readAsComment === false)).toEqual([]);
  });
});

describe("a line comment written at the start of a line comments it out", () => {
  for (const luauFile of [false, true]) {
    describe(luauFile ? ".luau root" : ".sd root", () => {
      for (const fixture of FIXTURES) {
        test(fixture.name, async () => {
          const results = await lineCommentResults(fixture.source, { luauFile });
          expect(
            results.filter((r) => r.skipped && !SKIPPED_LINE_CLASSES[r.skipped]),
          ).toEqual([]);
          expect(
            results.filter((r) => r.readAsComment === false),
            formatLineCommentFailures(results),
          ).toEqual([]);
        });
      }
    });
  }
});
