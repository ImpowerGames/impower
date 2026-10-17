// A multiple assignment whose targets are not all names (#1299): every
// target, a field, an index, a field of what a call returns or of a
// parenthesized value, receives its positional value (`a, t.x = 1, 2`), as
// in Luau. The script runs it in a function, which has no `&` marker (#1374).
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

/** A script whose `run` makes `t` and `o`, runs `assignment` on its line 5
 *  and returns `result`, and shows what `run` returns. */
const script = (assignment: string, result = 'tostring(a) .. "/" .. tostring(t.x)') =>
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
  ].join("\n");

/** The lines the story of `script(assignment, result)` shows, with the
 *  errors its run reports, after a compile that reports no error. */
const shows = (assignment: string, result?: string) => {
  const { program } = compileScript(script(assignment, result));
  expect(errorsOf(program)).toEqual([]);
  const { beats, errors } = storyBeats(new ProgramStory(program.chunks!));
  return { lines: beats.map((b) => b.text), errors };
};

describe("a multiple assignment with a target that is not a name (#1299)", () => {
  it.each([
    ["a, t.x = 1, 2", "Got 1/2.\n"],
    ["t.x, a = 1, 2", "Got 2/1.\n"],
    ["a, o:get().x = 1, 2", "Got 1/2.\n"],
    ["o:get().x, a = 1, 2", "Got 2/1.\n"],
    ["a, (t).x = 1, 2", "Got 1/2.\n"],
    ["(t).x, a = 1, 2", "Got 2/1.\n"],
  ])("stores each value of `%s` into its own target", (assignment, line) => {
    expect(shows(assignment)).toEqual({ lines: [line], errors: [] });
  });

  it.each([
    ["a, o:get()[1] = 1, 2", "Got 1/2.\n"],
    ["o:get()[1], a = 1, 2", "Got 2/1.\n"],
  ])("stores each value of `%s` into its own index", (assignment, line) => {
    expect(
      shows(assignment, 'tostring(a) .. "/" .. tostring(t[1])'),
    ).toEqual({ lines: [line], errors: [] });
  });

  // Every target's table and key are taken before the first store, so a
  // store into an earlier target cannot change where a later one stores.
  it("takes a later target's table before an earlier target replaces it (`t, o:get().x = 2, 1`)", () => {
    // `o:get()` returns the table `t` held before `t` became 2.
    expect(
      shows(
        "local u = t\n  t, o:get().x = 2, 1",
        'tostring(u.x) .. "/" .. tostring(t)',
      ),
    ).toEqual({ lines: ["Got 1/2.\n"], errors: [] });
  });

  it("takes a later target's key before an earlier target replaces it (`k, t[k] = \"y\", 1`)", () => {
    // `t[k]` stores into `t.x`, the key `k` held before it became "y".
    expect(
      shows(
        'local k = "x"\n  k, t[k] = "y", 1',
        'k .. "/" .. tostring(t.x) .. "/" .. tostring(t.y)',
      ),
    ).toEqual({ lines: ["Got y/1/nil.\n"], errors: [] });
  });

  // A target that is not a name, a field or an index cannot be stored into,
  // and the statement reports an error rather than dropping the target.
  it.each([
    ["a, o:get() = 1, 2", "Assigned expression must be a variable or a field"],
    ["a, (t) = 1, 2", "Assigned expression must be a variable or a field"],
    ["(a), t.x = 1, 2", "Assigned expression must be a variable or a field"],
    ["a, 1 = 1, 2", "Expected identifier when parsing expression, got '1'"],
  ])("reports an error on `%s`", (assignment, message) => {
    const { program } = compileScript(script(assignment));
    expect(errorsOf(program)).toEqual([[5, message]]);
  });
});
