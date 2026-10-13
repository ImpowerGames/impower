// A display line that starts with an interpolation is one beat, and the tags
// written after it are that beat's own (#1746). Such a line used to parse as
// a top-level interpolation statement followed by a separate action, so it
// showed as two beats and its tags went to the second one, or, with nothing
// after the interpolation, to the next line's beat.

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { compileScript, storyBeats } from "../program/programHarness";

const URI = "inmemory:///main.sd";

const script = (lines: string[]) =>
  ['store x = "Hi"', ...lines, "After.", ""].join("\n");

// Each beat's text and the tags it carries, on the program engine.
const programBeats = (lines: string[]) => {
  const { program } = compileScript(script(lines));
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => [
    b.text,
    b.tags,
  ]);
};

// The same, on the runtime story.
const runtimeBeats = (lines: string[]) => {
  const ctx = makeRuntimeStoryFromSource(script(lines), URI);
  expect(ctx.errorMessages).toEqual([]);
  const out: [string, string[]][] = [];
  while (ctx.story.canContinue) {
    const text = ctx.story.Continue() ?? "";
    const tags = (ctx.story.currentTags ?? []).map((tag) => tag.trim());
    if (text || tags.length > 0) out.push([text, tags]);
  }
  return out;
};

const engines = [
  ["program engine", programBeats],
  ["runtime story", runtimeBeats],
] as const;

describe("a display line that starts with an interpolation", () => {
  const cases: [string, [string, string[]][]][] = [
    ["{x} there # t", [["Hi there\n", ["t"]]]],
    ["{x} there# t", [["Hi there\n", ["t"]]]],
    ["{x} # t", [["Hi\n", ["t"]]]],
    ["{x}# t", [["Hi\n", ["t"]]]],
    ["{x} there", [["Hi there\n", []]]],
    ["{x}", [["Hi\n", []]]],
  ];
  for (const [engine, beats] of engines) {
    for (const [line, expected] of cases) {
      test(`is one beat with its own tags on the ${engine}: ${line}`, () => {
        expect(beats([line])).toEqual([...expected, ["After.\n", []]]);
      });
    }
  }
});

// Whatever follows the interpolation reads as it would after plain text: the
// line shows as the same line with the value written in its place.
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
  for (const [engine, beats] of engines) {
    for (const lines of cases) {
      test(`on the ${engine}: ${JSON.stringify(lines)}`, () => {
        const plain = lines.map((line) => line.replace(/\{x\}/g, "Hi"));
        expect(beats(lines)).toEqual(beats(plain));
      });
    }
  }
});
