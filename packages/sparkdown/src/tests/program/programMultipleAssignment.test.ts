// A multiple assignment whose targets are not all names (#1299): every
// target, a field, an index, a field of what a call returns or of a
// parenthesized value, receives its positional value in both the implicit
// (`a, t.x = 1, 2`) and the explicit (`& a, t.x = 1, 2`) form, as in Luau.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

/** The lines a story shows when `run` makes `t` and `o`, runs `assignment`
 *  and returns `result`, with the errors its compile and its run report. */
const shows = (assignment: string, result = 'tostring(a) .. "/" .. tostring(t.x)') => {
  const { program } = compileScript(
    [
      "function run()",
      "  local t = { x = 0 }",
      "  local o = {}",
      "  function o:get() return t end",
      "  local a",
      `  ${assignment}`,
      `  return ${result}`,
      "end",
      "Got {run()}.",
      "",
    ].join("\n"),
  );
  expect(errorsOf(program)).toEqual([]);
  const { beats, errors } = storyBeats(new ProgramStory(program.chunks!));
  return { lines: beats.map((b) => b.text), errors };
};

describe("a multiple assignment with a target that is not a name (#1299)", () => {
  it.each([
    ["a, t.x = 1, 2", "Got 1/2.\n"],
    ["t.x, a = 1, 2", "Got 2/1.\n"],
    ["& a, t.x = 1, 2", "Got 1/2.\n"],
    ["& t.x, a = 1, 2", "Got 2/1.\n"],
    ["a, o:get().x = 1, 2", "Got 1/2.\n"],
    ["o:get().x, a = 1, 2", "Got 2/1.\n"],
    ["a, (t).x = 1, 2", "Got 1/2.\n"],
    ["(t).x, a = 1, 2", "Got 2/1.\n"],
    ["& a, o:get().x = 1, 2", "Got 1/2.\n"],
    ["& o:get().x, a = 1, 2", "Got 2/1.\n"],
  ])("stores each value of `%s` into its own target", (assignment, line) => {
    expect(shows(assignment)).toEqual({ lines: [line], errors: [] });
  });

  it.each([
    ["a, o:get()[1] = 1, 2", "Got 1/2.\n"],
    ["o:get()[1], a = 1, 2", "Got 2/1.\n"],
    ["& a, o:get()[1] = 1, 2", "Got 1/2.\n"],
  ])("stores each value of `%s` into its own index", (assignment, line) => {
    expect(
      shows(assignment, 'tostring(a) .. "/" .. tostring(t[1])'),
    ).toEqual({ lines: [line], errors: [] });
  });

  it("evaluates every target's table and key before it stores (`o:get().x, t = 1, 2`)", () => {
    // The call in the first target runs before the second target replaces
    // `t`, so the field is stored into the table `t` was.
    expect(
      shows(
        "local u = t\n  o:get().x, t = 1, 2",
        'tostring(u.x) .. "/" .. tostring(t)',
      ),
    ).toEqual({ lines: ["Got 1/2.\n"], errors: [] });
  });
});
