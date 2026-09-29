// In a `local` with several names and several values, everything after the
// `=` is the value list, as Luau reads it: a later value that is a name or a
// boolean is a value, not another name being declared (#1116).

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const run = (body: string) => {
  const ctx = makeRuntimeStoryFromSource(
    `Value {f()}.\nfunction f()\n${body
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\nend\n`,
  );
  return { errors: ctx.errorMessages, output: ctx.story.ContinueMaximally() };
};

describe("a local's value list", () => {
  test.each([
    ["a name", "local x = 5\nlocal a, b = 1, x\nreturn b", "Value 5.\n"],
    ["a name first", "local x = 5\nlocal a, b = x, 1\nreturn a + b", "Value 6.\n"],
    ["two names", "local x, y = 2, 3\nlocal a, b = x, y\nreturn a * b", "Value 6.\n"],
    ["three names", "local x = 4\nlocal a, b, c = 1, x, x\nreturn a + b + c", "Value 9.\n"],
    ["booleans", 'local c, d = true, false\nreturn tostring(c) .. " " .. tostring(d)', "Value true false.\n"],
    ["a boolean after a number", "local a, b = 1, true\nreturn tostring(b)", "Value true.\n"],
    ["nil", 'local c, d, x = true, false, nil\nreturn tostring(x)', "Value nil.\n"],
    ["a name after a typed name", 'local x = 7\nlocal a: number, b: number = 1, x\nreturn b', "Value 7.\n"],
    ["a name in a later statement on the line", "local x = 5\nlocal a, b = 1, x return b", "Value 5.\n"],
    ["a name in a second local on the line", "local x = 5 local a, b = 1, x\nreturn b", "Value 5.\n"],
    ["a name after a table", "local x = 5\nlocal t, b = { k = 1 }, x\nreturn t.k + b", "Value 6.\n"],
    ["a name before a comment", "local x = 5\nlocal a, b = 1, x -- note\nreturn b", "Value 5.\n"],
    ["a name after a string naming a keyword", 'local x = 5\nlocal k, b = "store", x\nreturn k .. b', "Value store5.\n"],
    ["a name after a string-typed name", 'local x = 5\nlocal a: "p" | "q", b = "p", x\nreturn a .. b', "Value p5.\n"],
    ["a name after a bare local on the line", "local x = 5 local a, b\na, b = 1, x\nreturn b", "Value 5.\n"],
    ["a multiple return", "local function g() return 3, 4 end\nlocal a, b = g()\nreturn a + b", "Value 7.\n"],
    ["a single name", "local x = 8\nlocal a = x\nreturn a", "Value 8.\n"],
    ["a number list", "local a, b = 1, 2\nreturn b", "Value 2.\n"],
    ["a bare list", "local a, b\nreturn tostring(b)", "Value nil.\n"],
  ])("takes %s as a value", (_, body, expected) => {
    expect(run(body)).toEqual({ errors: [], output: expected });
  });

  test("a store takes later booleans as values", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store a, b, c = 1, true, false\nValue {a} {b} {c}.\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 1 true false.\n");
  });
});
