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
  "choice label":
    "a choice whose header ends at the line break reads the next line as its label whatever it holds, and choice text has no line comment",
  "closes an open Luau body":
    "the line is a beat that ends a Luau body left open without its end or closing brace, so commenting it out puts the line back inside that body",
};

const FIXTURES = loadGrammarCorpus();

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
