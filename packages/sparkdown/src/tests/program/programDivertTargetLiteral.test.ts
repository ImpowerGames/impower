// A divert-target literal in an expression whose target does not resolve to a
// flow (#457): the compile makes a program and an error at the literal says
// what is wrong, or it makes none and an error at the literal says why. Since
// the one compile path (#705) the program engine does not serialize the
// story, so the literal no longer aborts the compile; this pins that.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const script = (target: string) =>
  ["scene start", `  & local d = -> ${target}`, "  Hi.", "  fin", "", "end", ""].join(
    "\n",
  );

describe("an unresolved divert-target literal in an expression", () => {
  it("to a missing target is an error at the literal, and the story plays", () => {
    const { program } = compileScript(script("nowhere"));
    expect(errorsOf(program)).toEqual([[1, "target not found: `-> nowhere`"]]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
      "Hi.\n",
    ]);
  });

  it("to a builtin global is an error at the literal", () => {
    const { program } = compileScript(script("game"));
    const errors = errorsOf(program);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(([line]) => line === 1)).toBe(true);
  });
});
