// #1592 — a `store` declaration whose value the parser could not read
// (`store y =` with nothing after the `=`) is reported once, at the end of
// its line, where its Luau meets its end of input (#1907), and
// the story still runs: the store is declared nil and the lines after it
// play as story lines, as they do after an unfinished `& x =` or `local x =`.

import { describe, expect, test } from "vitest";
import { compileScript } from "../program/programHarness";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

const TAIL = "Well, then,\nStory follows.\n";

// Runs the story to its end, saving its state after every step as the
// preview does, and returns what it showed.
function runSavingEachStep(story: TestStory): string {
  let out = "";
  while (story.canContinue) {
    out += story.Continue();
    story.state.toJson();
  }
  return out;
}

function startScene(eol: string, ...lines: string[]): string {
  return `scene start${eol}${lines.map((l) => `  ${l}${eol}`).join("")}end${eol}`;
}

// The error diagnostics of a compile, with their zero-based start positions.
function errorStarts(src: string): string[] {
  const { program } = compileScript(src);
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => (d as { severity?: number }).severity === 1)
    .map((d) => {
      const { line, character } = (
        d as { range: { start: { line: number; character: number } } }
      ).range.start;
      return `${line}:${character}`;
    });
}

describe("an unfinished `store` value", () => {
  for (const [eol, name] of [
    ["\n", "LF"],
    ["\r\n", "CRLF"],
  ] as const) {
    const tailLines = TAIL.trimEnd().split("\n");

    test(`followed by story lines reports one error at the end of its line and runs (${name})`, () => {
      const src = `store y =${eol}${startScene(eol, ...tailLines)}`;
      expect(errorStarts(src)).toEqual(["0:9"]);
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe(TAIL);
    });

    test(`declares the store nil, and a later assignment assigns it (${name})`, () => {
      const src =
        `store y =${eol}` +
        startScene(eol, "y is {y == nil}.", "& y = 2", "y is {y}.");
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe("y is true.\ny is 2.\n");
    });

    test(`at the end of the file reports one error at the end of its line and compiles (${name})`, () => {
      const src = `${startScene(eol, ...tailLines)}store y =${eol}`;
      expect(errorStarts(src)).toEqual(["4:9"]);
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe(TAIL);
    });
  }

  test("`store p, q =` declares both stores nil and runs", () => {
    const src =
      "store p, q =\n" +
      startScene(
        "\n",
        "& q = 3",
        "p is {p == nil}, q is {q}.",
        ...TAIL.trimEnd().split("\n"),
      );
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe(`p is true, q is 3.\n${TAIL}`);
  });

  test("`store p, q = 1` leaves the missing slot nil", () => {
    const src =
      "store p, q = 1\n" +
      startScene("\n", "p is {p}, q is {q == nil}.");
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toEqual([]);
    expect(runSavingEachStep(story)).toBe("p is 1, q is true.\n");
  });
});
