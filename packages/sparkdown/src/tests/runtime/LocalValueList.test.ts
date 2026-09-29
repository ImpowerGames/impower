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
    ["two names", "local x, y = 2, 3\nlocal a, b = x, y\nreturn a * b", "Value 6.\n"],
    ["three names", "local x = 4\nlocal a, b, c = 1, x, x\nreturn a + b + c", "Value 9.\n"],
    ["booleans", 'local c, d = true, false\nreturn tostring(c) .. " " .. tostring(d)', "Value true false.\n"],
    ["a boolean after a number", "local a, b = 1, true\nreturn tostring(b)", "Value true.\n"],
    ["nil", 'local c, d, x = true, false, nil\nreturn tostring(x)', "Value nil.\n"],
    ["a name after a typed name", 'local x = 7\nlocal a: number, b: number = 1, x\nreturn b', "Value 7.\n"],
    ["a name in a second local on the line", "local x = 5 local a, b = 1, x\nreturn b", "Value 5.\n"],
    ["a name after a table", "local x = 5\nlocal t, b = { k = 1 }, x\nreturn t.k + b", "Value 6.\n"],
    ["a name before a comment", "local x = 5\nlocal a, b = 1, x -- note\nreturn b", "Value 5.\n"],
    ["a name after a string naming a keyword", 'local x = 5\nlocal k, b = "store", x\nreturn k .. b', "Value store5.\n"],
    ["a name after a long string naming a keyword", "local x = 5\nlocal k, b = [[the local shop]], x\nreturn k .. b", "Value the local shop5.\n"],
    ["a boolean after a long string naming a keyword", "local k, b = [[the store]], true\nreturn tostring(b)", "Value true.\n"],
    ["a name after a block comment naming a keyword", "local x = 5\nlocal a, b = 1, --[[ store ]] x\nreturn b", "Value 5.\n"],
    ["a name after a field named store", "local t = {}\nt.store = 1\nlocal y = 9\nlocal a, b, c = 1, t.store, y\nreturn c", "Value 9.\n"],
    ["a boolean after a field named const", "local t = {}\nt.const = 1\nlocal a, b, c = 1, t.const, true\nreturn tostring(c)", "Value true.\n"],
    ["a name after a string-typed name", 'local x = 5\nlocal a: "p" | "q", b = "p", x\nreturn a .. b', "Value p5.\n"],
    ["a name after a semicolon-ended local", "local x = 5\nlocal a = 1; local b, c = 2, x\nreturn c", "Value 5.\n"],
    ["a name in an explicit statement", "local x = 5\n& local a: number, b: number = 1, x\nreturn b", "Value 5.\n"],
    ["a name after a string naming a keyword and an escaped quote", 'local x = 5\nlocal m, b = "the store said \\"hi\\"", x\nreturn b', "Value 5.\n"],
    ["a boolean after a single-quoted string naming a keyword and an escaped quote", "local m, b = 'a const \\'q\\'', true\nreturn tostring(b)", "Value true.\n"],
    ["a boolean after a backtick string naming a keyword", "local m, b = `store {1}`, true\nreturn tostring(b)", "Value true.\n"],
    ["a name after a method named store", "local t = {}\nt.store = function(self) return 2 end\nlocal x = 5\nlocal a, b = t:store(), x\nreturn a + b", "Value 7.\n"],
    ["a name after a method call",'local s = "ab"\nlocal x = 5\nlocal a, b = s:upper(), x\nreturn a .. b', "Value AB5.\n"],
    ["a name after a cast", "local x = 5\nlocal a, b = 1, x :: number\nreturn b", "Value 5.\n"],
  ])("reads %s as a value", (_, body, expected) => {
    expect(run(body)).toEqual({ errors: [], output: expected });
  });

  // Shapes that worked before the fix and must keep working.
  test.each([
    ["a name first", "local x = 5\nlocal a, b = x, 1\nreturn a + b", "Value 6.\n"],
    ["a name in a later statement on the line", "local x = 5\nlocal a, b = 1, x return b", "Value 5.\n"],
    ["a name before a semicolon", "local x = 5\nlocal a, b = 1, x;\nreturn b", "Value 5.\n"],
    ["a bare local, then a reassignment", "local x = 5 local a, b\na, b = 1, x\nreturn b", "Value 5.\n"],
    ["a multiple return", "local function g() return 3, 4 end\nlocal a, b = g()\nreturn a + b", "Value 7.\n"],
    ["a single name", "local x = 8\nlocal a = x\nreturn a", "Value 8.\n"],
    ["a number list", "local a, b = 1, 2\nreturn b", "Value 2.\n"],
    ["a bare list", "local a, b\nreturn tostring(b)", "Value nil.\n"],
    ["a typed name after a string-typed name", 'local a: "p" | "q", b: number = "p", 5\nreturn a .. b', "Value p5.\n"],
    ["a single-quoted string type", "local a: 'p', b: number = 'p', 3\nreturn a .. b", "Value p3.\n"],
    ["two string-typed names", 'local a: "p", b: "q" = "p", "q"\nreturn a .. b', "Value pq.\n"],
    ["a string-typed name, then an untyped and a typed one", 'local a: "p", b, c: number = "p", 2, 3\nreturn a .. b .. c', "Value p23.\n"],
    ["a table type holding a string", 'local a: { k: "v" }, b: number = { k = "v" }, 2\nreturn a.k .. b', "Value v2.\n"],
    ["an index-signature type", "local a: { [string]: number }, b: number = {}, 2\nreturn b", "Value 2.\n"],
    ["an escaped quote in a string type", 'local a: "a\\"b", c: number = "a\\"b", 1\nreturn c', "Value 1.\n"],
    ["a nested index in a type", "local t = {1}\nlocal a: typeof(t[t[1]]), b: number = 1, 2\nreturn b", "Value 2.\n"],
    ["a block comment before the names", "local --[[c]] a, b = 1, 2\nreturn a + b", "Value 3.\n"],
    ["a block comment between the names", "local a, --[[c]] b, c = 1, 2, 3\nreturn b + c", "Value 5.\n"],
    ["an escaped quote in a single-quoted string type", "local a: 'a\\'b', b: number = 'a\\'b', 2\nreturn b", "Value 2.\n"],
    ["a table constructor in a type", "local a: typeof({ k = 1 }), b: number = { k = 1 }, 2\nreturn b", "Value 2.\n"],
    ["a comparison in a type", "local a: typeof(1 == 1), b: number = true, 2\nreturn b", "Value 2.\n"],
    ["a string type naming a keyword", 'local a: "my store", b: number = "my store", 5\nreturn b', "Value 5.\n"],
  ])("still reads %s", (_, body, expected) => {
    expect(run(body)).toEqual({ errors: [], output: expected });
  });

  test("a store takes later booleans as values", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store a, b, c = 1, true, false\nValue {a} {b} {c}.\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 1 true false.\n");
  });

  test("a store takes a later constant as a value", () => {
    const ctx = makeRuntimeStoryFromSource("const K = 3\nstore a, b = 1, K\nValue {a} {b}.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 1 3.\n");
  });

  test("a local outside a function takes a later name as a value", () => {
    const ctx = makeRuntimeStoryFromSource("local x = 5\nlocal a, b = 1, x\nValue {b}.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test("a store still reads a typed name after a string-typed name", () => {
    const ctx = makeRuntimeStoryFromSource(
      'store a: "p" | "q", b: number = "p", 5\nValue {a} {b}.\n',
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value p 5.\n");
  });
});
