// A multiple declaration evaluates every value before it binds any name, as
// Luau does (I-1409): a later value that reads an earlier name sees it
// unassigned.
import { describe, expect, it } from "vitest";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, programSession, storyBeats } from "./programHarness";

const play = (text: string) => {
  const { program } = compileScript(text);
  expect(errorsOf(program)).toEqual([]);
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text);
};

const READ_X = ["function readX()", "  return tostring(x)", "end", ""].join("\n");

describe("a multiple declaration binds after its values", () => {
  it("for a store", () => {
    expect(play(`${READ_X}store x, y = 1, readX()\n\nValue {y} then {x}.\n`)).toEqual([
      "Value nil then 1.\n",
    ]);
  });

  it("for a store whose last value is a spread call", () => {
    const script = [
      READ_X,
      "function g()",
      "  return readX(), 7",
      "end",
      "",
      "store x, y, z = 1, g()",
      "",
      "Value {x}, {y} and {z}.",
      "",
    ].join("\n");
    expect(play(script)).toEqual(["Value 1, nil and 7.\n"]);
  });

  it("for a store whose earlier value is a spread call cut to one value", () => {
    const script = [
      READ_X,
      "function pair()",
      "  return 2, 3",
      "end",
      "",
      "store x, y, z = pair(), 1, readX()",
      "",
      "Value {x}, {y} and {z}.",
      "",
    ].join("\n");
    expect(play(script)).toEqual(["Value 2, 1 and nil.\n"]);
  });

  it("keeps the order when an edit adds a name to the list", () => {
    const beats = (root: ProgramRoot) =>
      storyBeats(new ProgramStory(root)).beats.map((b) => b.text);
    const before = `${READ_X}store x = 1\n\nValue {x}.\n`;
    const after = `${READ_X}store x, y = 1, readX()\n\nValue {y} then {x}.\n`;
    const session = programSession(before);
    expect(beats(session.root)).toEqual(["Value 1.\n"]);
    session.edit("store x = 1", "store x, y = 1, readX()");
    const edited = beats(session.edit("Value {x}.", "Value {y} then {x}."));
    expect(errorsOf(session.program)).toEqual([]);
    expect(edited).toEqual(play(after));
    expect(edited).toEqual(["Value nil then 1.\n"]);
  });

  // Locals take another path and already bind after their values; these
  // keep them in step with the store's order.
  it.each([
    ["a top-level local list", "local a, b = 1, a\n\nValue {b}.\n", "Value nil.\n"],
    [
      "a local list in a function",
      "function f()\n  local a = 0\n  local a, b = 1, a\n  return b\nend\nValue {f()}.\n",
      "Value 0.\n",
    ],
    [
      "a const list in a function",
      "function f()\n  const a, b = 1, a\n  return b\nend\nValue {f()}.\n",
      "Value nil.\n",
    ],
  ])("for %s", (_, script, expected) => {
    expect(play(script)).toEqual([expected]);
  });
});
