import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  return {
    errors: ctx.errorMessages,
    warnings: ctx.warningMessages,
    output: runToEnd(ctx.story),
  };
};

const GOT_EQUALS = "Expected identifier when parsing expression, got '='";

describe("a keyword right after an operand (#922)", () => {
  test("`end` right after a parenthesized value closes its `do` block", () => {
    const r = run(
      "Value {f()}.\nfunction f()\n  do local y = (1)end\n  return 2\nend\nAfter.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      "Variable 'y' is never used; prefix with '_' to silence",
    ]);
    expect(r.output).toBe("Value 2.\nAfter.\n");
  });
});

describe("an if expression with an `=` before its `else` (#923)", () => {
  test("a table with a named field in the then-branch is the expression's value", () => {
    const r = run(
      `Value {f()}.\nfunction f()\n  local t = {1}\n  local x = if t[1] then {a = "y"} else 2\n  return x.a\nend\n`,
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.output).toBe("Value y.\n");
  });
});

describe("an if expression before the `end` of its block on the same line (#924)", () => {
  test("the `end` closes the local function after `local x =` takes the expression", () => {
    const r = run(
      "Value {g()}.\nfunction g()\n  local function foo(a) local x = if a then 2 else 3 end\n  return 1\nend\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      "Function 'foo' is never used; prefix with '_' to silence",
      "Variable 'x' is never used; prefix with '_' to silence",
    ]);
    expect(r.output).toBe("Value 1.\n");
  });

  test("the `end` closes the local function after `return` takes the expression", () => {
    const r = run(
      "Value {g(true)} {g(false)}.\nfunction g(b)\n  local function foo(a) return if a then 2 else 3 end\n  return foo(b)\nend\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Value 2 3.\n");
  });
});

describe("an assignment after an if expression's else value (#1205)", () => {
  test("on the next line, it is Luau's error and nothing is assigned", () => {
    const r = run(
      "Value {f()}.\nfunction f()\n  local x = 0\n  x = if false then 1 else\n  x = 6\n  return x\nend\n",
    );
    expect(r.errors).toEqual([GOT_EQUALS]);
  });

  test("on the same line, it is Luau's error", () => {
    const r = run(
      "Value {f()}.\nfunction f()\n  local x = 0\n  x = if false then 1 else x = 6\n  return x\nend\n",
    );
    expect(r.errors).toEqual([GOT_EQUALS]);
  });

  test("after a `local` declaration's if expression in a scene, the else value is missing at its line's end", () => {
    const r = run(
      "-> start\nscene start\n  local a = false\n  local y = 0\n  local x = if a then 1 else\n    y = 6\n  Value {x} {y}.\nend\n",
    );
    expect(r.errors).toEqual(["Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("an indented else value that begins with `end` (#1206)", () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(["ender", "endx", "end_time"])(
    "`%s` is the else value, with no empty-match warning",
    (name) => {
      const r = run(
        `Value {f()}.\nfunction f()\n  local a = false\n  local ${name} = 5\n  local x = if a then 1 else\n    ${name}\n  return x\nend\n`,
      );
      expect(r.errors).toEqual([]);
      expect(r.output).toBe("Value 5.\n");
      expect(logged).toEqual([]);
    },
  );
});

describe("an argument list after a space (#1243)", () => {
  const H = "  local h = function(v) return v * 3 end\n";
  test.each([
    ["a call's result", `${H}  local g = function() return h end\n  local w = g() (2)\n`],
    ["a parenthesized value", `${H}  local w = (h) (2)\n`],
    ["an index", `${H}  local t = {h}\n  local w = t[1] (2)\n`],
  ])("after %s calls it", (_name, body) => {
    const r = run(`Value {f()}.\nfunction f()\n${body}  return w\nend\n`);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.output).toBe("Value 6.\n");
  });
});

describe("an operator after a property link that follows a method call (#1293)", () => {
  const T = "local t = { x = 1, a = { x = \"a\", b = { 5, 6 } } } local o = {} function o:get() return t end function o.dot() return t end";
  test.each([
    ["a local's value", "local v = o:get().x + 1 return v", "2"],
    ["a reassignment", "local v = 0 v = o:get().x + 1 return v", "2"],
    ["a field assignment", "t.x = o:get().x + 1 return t.x", "2"],
    ["a concatenation", 'o:get().a.x = o:get().a.x .. "b" return t.a.x', "ab"],
    ["a return", "return o:get().a.x .. o:get().a.b[2]", "a6"],
    ["a dot call", "local v = o.dot().x + 1 return v", "2"],
  ])("in %s, takes the operation", (_name, body, value) => {
    const r = run(`function run() ${T} ${body} end\n\nGot {run()}.\n`);
    expect(r.errors).toEqual([]);
    expect(r.output).toBe(`Got ${value}.\n`);
  });
});

describe("an assignment after a repeat loop's call condition on the same line (#1373)", () => {
  test("the assignment runs after the loop", () => {
    const r = run(
      "Value {f()}.\nfunction f()\n  local x = 0\n  local function p() return true end\n  repeat until p() x = 5\n  return x\nend\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Value 5.\n");
  });
});
