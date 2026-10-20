// A display line that is only an inline conditional shows what the same
// conditional shows when other text shares the line (#1103): its matching
// branch, or nothing at all, never the text `nil`.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "./programHarness";

const shown = (text: string): string[] => {
  const { program } = compileScript(text);
  expect(program.chunks).toBeDefined();
  const { beats, errors } = storyBeats(new ProgramStory(program.chunks!));
  expect(errors).toEqual([]);
  return beats.map((beat) => beat.text);
};

describe("a whole-line inline conditional (#1103)", () => {
  it("shows nothing for a whole line with no matching branch, then an inline one", () => {
    expect(
      shown(`{if false then "hidden"}\nX {if false then "inline"}.\nDone.\n`),
    ).toEqual(["X .\n", "Done.\n"]);
  });

  it("shows nothing for a whole line with no matching branch on its own", () => {
    expect(shown(`{if false then "hidden"}\nDone.\n`)).toEqual(["Done.\n"]);
  });

  it("shows nothing for an inline conditional with no matching branch", () => {
    expect(shown(`X {if false then "inline"}.\nDone.\n`)).toEqual([
      "X .\n",
      "Done.\n",
    ]);
  });

  it("shows a whole line's matching branch on its own line", () => {
    expect(shown(`{if true then "shown"}\nDone.\n`)).toEqual([
      "shown\n",
      "Done.\n",
    ]);
  });
});
