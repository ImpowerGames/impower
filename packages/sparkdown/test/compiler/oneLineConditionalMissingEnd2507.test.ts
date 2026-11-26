import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const SEQUENTIAL_MESSAGE =
  "This one-line alternator is missing its closing `end` keyword. Without it, the lines below it are read as part of this one-line alternator, up to the next `scene`, `branch` or the end of the file.";
const missingEnd = (keyword: string) =>
  `This one-line \`${keyword}\` is missing its closing \`end\` keyword at the end of its line.`;

const scene = (...lines: string[]) =>
  ["scene start", '  local mood = "happy"', ...lines.map((line) => `  ${line}`), "  After.", "end", ""].join("\n");

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { diagnostics: [...ctx.errorMessages, ...ctx.warningMessages], out: ctx.story.ContinueMaximally() };
};

describe("a one-line match or plural missing its closing end", () => {
  test.each([
    ["match(mood) | happy = A. | other = B.", "match", "A.\nAfter.\n"],
    ["match mood | happy = A. | other = B.", "match", "A.\nAfter.\n"],
    ["match(mood) | A. | B.", "match", "A.\nAfter.\n"],
    ["plural(2) | one = A. | other = B.", "plural", "B.\nAfter.\n"],
  ])("`%s` reports its missing end and still plays the line below", (line, keyword, out) => {
    expect(run(scene(line))).toEqual({ diagnostics: [missingEnd(keyword)], out });
  });

  test("a one-line queue keeps its own message", () => {
    expect(run(scene("queue | A. | B.")).diagnostics[0]).toBe(SEQUENTIAL_MESSAGE);
  });

  test("a head line whose arms continue below reports its missing end before the stray lines", () => {
    expect(run(scene("match(mood) | happy = A.", "| other = B.", "end")).diagnostics).toEqual([
      missingEnd("match"),
      "statement must be inside a scene or branch; the top level holds declarations only",
      "Expected <eof>, got 'end'",
    ]);
  });

  test.each([
    ["match(mood) | happy = A. | other = B. end"],
    ["plural(2) | one = A. | other = B. end"],
    ["match(mood)", "| happy = A.", "| other = B.", "end"],
    ["cycle | match(mood) | happy = A. | other = B. end | C. end"],
  ])("`%s` reports nothing", (...lines) => {
    expect(run(scene(...lines)).diagnostics).toEqual([]);
  });
});
