// A `store` with more names than values (#1325): a name with no value holds
// nil, and a call or `...` that would have to give the names after it its
// further values is an error on the statement, never a compile with no
// program and no diagnostic, nor one that quietly gives those names nil.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const play = (text: string) => {
  const { program } = compileScript(text);
  expect(errorsOf(program)).toEqual([]);
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text);
};

const SPREAD = "A `store` takes one value for each name: a call or `...` gives a store only its first value";

describe("a store with more names than values", () => {
  it("gives a name with no value nil", () => {
    expect(play("store a, b\n\nValue {a} and {b}.\n")).toEqual(["Value nil and nil.\n"]);
    expect(play("store a, b = 1\n\nValue {a} and {b}.\n")).toEqual(["Value 1 and nil.\n"]);
    expect(play("store a, b = 3, 4\n\nValue {a} and {b}.\n")).toEqual(["Value 3 and 4.\n"]);
  });

  it("reports a call that would give the names after it its further values", () => {
    const { program } = compileScript(
      [
        "function pair()",
        "  return 3, 4",
        "end",
        "",
        "store a, b = pair()",
        "",
        "Value {a} and {b}.",
        "",
      ].join("\n"),
    );
    expect(errorsOf(program)).toEqual([[4, SPREAD]]);
  });

  it("takes a parenthesized call's one value without an error", () => {
    expect(
      play("function pair()\n  return 3, 4\nend\n\nstore a, b = (pair())\n\nValue {a} and {b}.\n"),
    ).toEqual(["Value 3 and nil.\n"]);
  });
});
