import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "./programHarness";

const shown = (body: string): string[] => {
  const lines = body.trimEnd().split("\n").map((line) => `  ${line}`);
  const { program } = compileScript(["scene start", ...lines, "end", ""].join("\n"));
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
