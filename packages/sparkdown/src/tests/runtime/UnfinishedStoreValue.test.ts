import { describe, expect, test } from "vitest";
import { compileScript } from "../program/programHarness";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

const TAIL = "Well, then,\nStory follows.\n";

function runSavingEachStep(story: TestStory): string {
  let out = "";
  while (story.canContinue) {
    out += story.Continue();
    story.state.toJson();
  }
  return out;
}

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
    const tail = TAIL.replace(/\n/g, eol);

    test(`followed by story lines reports one error at the end of its line and runs (${name})`, () => {
      const src = `store y =${eol}${tail}`;
      expect(errorStarts(src)).toEqual(["0:9"]);
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe(TAIL);
    });

    test(`declares the store nil, and a later assignment assigns it (${name})`, () => {
      const src =
        `store y =${eol}y is {y == nil}.${eol}& y = 2${eol}y is {y}.${eol}`;
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe("y is true.\ny is 2.\n");
    });

    test(`at the end of the file reports one error at the end of its line and compiles (${name})`, () => {
      const src = `${tail}store y =${eol}`;
      expect(errorStarts(src)).toEqual(["2:9"]);
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      expect(runSavingEachStep(story)).toBe(TAIL);
    });
  }

  test("`store p, q =` declares both stores nil and runs", () => {
    const src = `store p, q =\n& q = 3\np is {p == nil}, q is {q}.\n${TAIL}`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe(`p is true, q is 3.\n${TAIL}`);
  });

  test("`store p, q = 1` leaves the missing slot nil", () => {
    const src = `store p, q = 1\np is {p}, q is {q == nil}.\n`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toEqual([]);
    expect(runSavingEachStep(story)).toBe("p is 1, q is true.\n");
  });
});
