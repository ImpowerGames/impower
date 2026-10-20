// I-826: a script that replaces a stdlib namespace with its own table
// (`math = { abs = function(a, b) ... end }`) gets every argument of a
// call to its member, as in Luau: the call no longer stops at the
// builtin's own arity, so `math.abs(1, 2)` passes 2 as the second.
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const decl =
  'math = { abs = function(a, b) return tostring(a) .. "/" .. tostring(b) end }';

function run(body: string): { text: string; errors: string[] } {
  const ctx = makeRuntimeStoryFromSource(`${decl}\n${body}\n`);
  const errors: string[] = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.ContinueMaximally();
  return { text, errors };
}

describe("replaced namespace member receives every argument", () => {
  test.each([
    ["two literals", "Got {math.abs(1, 2)}.", "Got 1/2.\n"],
    [
      "a call spreading two values",
      "function two()\n  return 1, 2\nend\nGot {math.abs(two())}.",
      "Got 1/2.\n",
    ],
    [
      "a call returning nothing then a literal",
      "function none()\nend\nGot {math.abs(none(), 2)}.",
      "Got nil/2.\n",
    ],
  ])("%s", (_, body, expected) => {
    const { text, errors } = run(body);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  // A variadic builtin's replacement takes a call that returned nothing
  // before the last argument as nil, not as no argument.
  test("a variadic member's replacement", () => {
    const ctx = makeRuntimeStoryFromSource(
      [
        'math = { max = function(a, b) return tostring(a) .. "/" .. tostring(b) end }',
        "function none()",
        "end",
        "Got {math.max(none(), 2)}.",
        "",
      ].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Got nil/2.\n");
  });

  // A member the replacement does not hold is the builtin's, which takes
  // its own parameters as before.
  test.each([
    ["more arguments than it takes", "Got {math.floor(2.5, 9)}.", "Got 2.\n"],
    ["its own arguments", "Got {math.floor(2.5)}.", "Got 2.\n"],
  ])("a member the replacement lacks, with %s", (_, body, expected) => {
    const { text, errors } = run(body);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("a member the replacement lacks, with no argument, raises", () => {
    const { errors } = run("Got {math.floor()}.");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing argument #1 to 'floor'");
  });
});

describe("an unreplaced namespace member keeps its parameters", () => {
  test.each([
    ["math.abs(-3, 2)", "Got 3.\n"],
    ["math.abs(-3)", "Got 3.\n"],
  ])("%s", (expr, expected) => {
    const ctx = makeRuntimeStoryFromSource(`Got {${expr}}.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(expected);
  });

  test("math.abs() raises", () => {
    const ctx = makeRuntimeStoryFromSource("Got {math.abs()}.\n");
    const errors: string[] = [];
    ctx.story.onError = (m: string) => errors.push(m);
    ctx.story.ContinueMaximally();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("missing argument #1 to 'abs'");
  });
});
