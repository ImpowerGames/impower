import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "../program/programHarness";

const script = (lines: string[]) =>
  ['store x = "Hi"', ...lines, "After.", ""].join("\n");

const beats = (lines: string[]) => {
  const { program } = compileScript(script(lines));
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => [
    b.text,
    b.tags,
  ]);
};

describe("a display line that starts with an interpolation", () => {
  const cases: [string, [string, string[]][]][] = [
    ["{x} there # t", [["Hi there\n", ["t"]]]],
    ["{x} there# t", [["Hi there\n", ["t"]]]],
    ["{x} # t", [["Hi\n", ["t"]]]],
    ["{x}# t", [["Hi\n", ["t"]]]],
    ["{x} there", [["Hi there\n", []]]],
    ["{x}", [["Hi\n", []]]],
  ];
  for (const [line, expected] of cases) {
    test(`is one beat with its own tags: ${line}`, () => {
      expect(beats([line])).toEqual([...expected, ["After.\n", []]]);
    });
  }
});

describe("a line that starts with an interpolation shows as plain text would", () => {
  const cases: string[][] = [
    ["{x} {x} there # t"],
    ["{x}{x}"],
    ["{x} ..   more"],
    ["{x} ..", ".. there # t"],
    ["{x} .. # t", ".. there"],
    ["{x} > there # t"],
    ["{x} there > # t"],
    ["{x} there // a note"],
    ["  {x} there # t"],
  ];
  for (const lines of cases) {
    test(JSON.stringify(lines), () => {
      const plain = lines.map((line) => line.replace(/\{x\}/g, "Hi"));
      expect(beats(lines)).toEqual(beats(plain));
    });
  }
});
