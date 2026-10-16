// A `store` with more names than values (#1325, #1920): a name with no value
// holds nil, and a call as the last value gives the names after it its
// further values, as Luau's `local a, b = f()` does, evaluating the call once.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

const play = (text: string) => {
  const { program } = compileScript(text);
  expect(errorsOf(program)).toEqual([]);
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text);
};

const FUNCTIONS = [
  "function pair()",
  "  return 3, 4",
  "end",
  "function triple()",
  "  return 5, 6, 7",
  "end",
  "",
].join("\n");

describe("a store with more names than values", () => {
  it("gives a name with no value nil", () => {
    expect(play("store a, b\n\nValue {a} and {b}.\n")).toEqual(["Value nil and nil.\n"]);
    expect(play("store a, b = 1\n\nValue {a} and {b}.\n")).toEqual(["Value 1 and nil.\n"]);
    expect(play("store a, b = 3, 4\n\nValue {a} and {b}.\n")).toEqual(["Value 3 and 4.\n"]);
  });

  it("gives the names after a call its further values", () => {
    expect(play(`${FUNCTIONS}store a, b = pair()\n\nValue {a} and {b}.\n`)).toEqual([
      "Value 3 and 4.\n",
    ]);
    expect(
      play(`${FUNCTIONS}store a, b, c = 1, pair()\n\nValue {a}, {b} and {c}.\n`),
    ).toEqual(["Value 1, 3 and 4.\n"]);
  });

  it("gives nil to the names a call has no value for and drops its extra values", () => {
    expect(
      play(`${FUNCTIONS}store a, b, c = pair()\n\nValue {a}, {b} and {c}.\n`),
    ).toEqual(["Value 3, 4 and nil.\n"]);
    expect(play(`${FUNCTIONS}store a, b = triple()\n\nValue {a} and {b}.\n`)).toEqual([
      "Value 5 and 6.\n",
    ]);
  });

  it("evaluates the call once", () => {
    expect(
      play(
        [
          "store calls = 0",
          "function counted()",
          "  calls = calls + 1",
          "  return calls, calls * 10",
          "end",
          "",
          "store a, b = counted()",
          "",
          "Value {a} and {b} after {calls} call.",
          "",
        ].join("\n"),
      ),
    ).toEqual(["Value 1 and 10 after 1 call.\n"]);
  });

  // A store's values run when the story starts, outside any function, so
  // its `...` has no values to give the names after it.
  it("reports a `...` that would give the names after it its further values", () => {
    const { program } = compileScript("store a, b = ...\n\nValue {a} and {b}.\n");
    expect(errorsOf(program)).toContainEqual([
      0,
      "A `store` takes one value for each name: `...` gives a store only its first value",
    ]);
  });

  it("takes a parenthesized call's one value without an error", () => {
    expect(play(`${FUNCTIONS}store a, b = (pair())\n\nValue {a} and {b}.\n`)).toEqual([
      "Value 3 and nil.\n",
    ]);
  });
});
