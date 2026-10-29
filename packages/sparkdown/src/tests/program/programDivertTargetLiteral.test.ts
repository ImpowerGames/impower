import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const script = (target: string) =>
  ["-> start", "scene start", `  & local d = -> ${target}`, "  Hi.", "  fin", "", "end", ""].join(
    "\n",
  );

describe("an unresolved divert-target literal in an expression", () => {
  it("to a missing target is an error at the literal, and the story plays", () => {
    const { program } = compileScript(script("nowhere"));
    expect(errorsOf(program)).toEqual([[2, "target not found: `-> nowhere`"]]);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
      "Hi.\n",
    ]);
  });

  it("to a builtin global is an error at the literal", () => {
    const { program } = compileScript(script("game"));
    const errors = errorsOf(program);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(([line]) => line === 2)).toBe(true);
  });
});
