// A function declared with `...` inside another function is a closure
// assigned to the variable its name resolves to, as a function without
// `...` is (`lowerNestedNamedFunction`, I-1422). Before I-1360 it lowered as
// a subflow registered by name in lexical order, whose calls passed the
// locals it closes over as pointers named where the call was written. These
// cases hold it to Luau's scoping:
//
// - a closure written before the function statement calls the function once
//   the statement has run (I-1360);
// - a multiple assignment over the function's name rebinds it, as a single
//   one does (I-1355);
// - a call passes the locals the function closes over, not the caller's
//   locals or parameters of the same names (I-1361).

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

function run(source: string): { text: string; errors: string[] } {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.ContinueMaximally();
  return { text, errors };
}

const lines = (...l: string[]) => l.join("\n");

describe("a closure written before a variadic function statement (I-1360)", () => {
  test("calls the function once the statement has run", () => {
    const source = lines(
      "function run()",
      "  local base = 10",
      "  local bar = function()",
      "    return foo()",
      "  end",
      "  function foo(...)",
      "    return base",
      "  end",
      "  return bar()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 10.\n", errors: [] });
  });

  test("passes the function arguments and shares the local it writes", () => {
    const source = lines(
      "function run()",
      "  local base = 10",
      "  local bar = function(n)",
      "    add(n)",
      "  end",
      "  function add(n, ...)",
      "    base = base + n",
      "  end",
      "  bar(1)",
      "  bar(2)",
      "  return base",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 13.\n", errors: [] });
  });

  test("a call before the statement runs fails as Luau's does", () => {
    // `foo` is a declared local of `run`, which the statement assigns, so
    // the call reads a nil local. The call message of a nil global, or of a
    // nil top-level local, is I-1559's.
    const source = lines(
      "function run()",
      "  local foo",
      "  local bar = function()",
      "    return foo()",
      "  end",
      "  local ok, err = pcall(bar)",
      "  function foo(...)",
      "    return 1",
      "  end",
      "  return tostring(ok) .. \" \" .. tostring(string.find(err, \"attempt to call a nil value\", 1, true) ~= nil) .. \" \" .. bar()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got false true 1.\n", errors: [] });
  });
});

describe("a variadic function statement in a function (I-1360)", () => {
  test("defined twice in one body, a call before the second reaches the first", () => {
    // vararg.luau lines 9 and 64.
    const source = lines(
      "function run()",
      "  function f(a, ...)",
      "    return a + select(\"#\", ...)",
      "  end",
      "  local first = f(10, 1, 2)",
      "  function f(a, ...)",
      "    return a * 100",
      "  end",
      "  return first .. \" \" .. f(2, 1)",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 12 200.\n", errors: [] });
  });

  test("calls itself by name", () => {
    const source = lines(
      "function run()",
      "  local sep = \",\"",
      "  function concat(...)",
      "    local n = select(\"#\", ...)",
      "    if n == 0 then return \"\" end",
      "    if n == 1 then return tostring((...)) end",
      "    local head = ...",
      "    return tostring(head) .. sep .. concat(select(2, ...))",
      "  end",
      "  return concat(1, 2, 3)",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 1,2,3.\n", errors: [] });
  });

  test.each([
    ["with `...`", "(n, ...)"],
    ["without `...`", "(n)"],
  ])("a local function %s reads itself as a value", (_, params) => {
    const source = lines(
      "function run()",
      `  local function foo${params}`,
      "    if n == 0 then return type(foo) end",
      "    local again = foo",
      "    return again(n - 1)",
      "  end",
      "  return foo(2)",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got function.\n", errors: [] });
  });

  test.each([
    ["function foo(...)"],
    ["function foo()"],
    ["local function foo(...)"],
    ["local function foo()"],
  ])("`%s` is named foo in debug.info and a traceback", (header) => {
    // upstream/conformance/debug.luau line 63 names a variadic function.
    const source = lines(
      "function run()",
      `  ${header}`,
      "    return debug.info(1, \"n\") .. \"|\" .. debug.traceback()",
      "  end",
      "  return foo()",
      "end",
      "Got {run()}.",
    );
    const { text, errors } = run(source);
    expect(errors).toEqual([]);
    expect(text).toMatch(/^Got foo\|stack traceback:/);
    expect(text).toContain("[FUNCTION] <SOMEWHERE IN run.foo>");
  });

  test.each([
    ["a do block", ["do", "  function foo(...)", "    return base + select(\"#\", ...)", "  end", "end"]],
    ["an if block", ["if base > 0 then", "  function foo(...)", "    return base + select(\"#\", ...)", "  end", "end"]],
  ])("written in %s, is called after the block", (_, block) => {
    const source = lines(
      "function run()",
      "  local base = 10",
      ...block.map((l) => `  ${l}`),
      "  return foo(1, 2)",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 12.\n", errors: [] });
  });
});

describe("a multiple assignment over a variadic function (I-1355)", () => {
  test.each([
    ["a multiple assignment", ["local a", "a, foo = 1, function() return 100 end"]],
    ["a single assignment", ["foo = function() return 100 end"]],
    ["a multiple assignment from a call", ["local a", "a, foo = (function() return 1, function() return 100 end end)()"]],
  ])("%s rebinds the name for later calls", (_, assign) => {
    const source = lines(
      "function run()",
      "  function foo(...) return 2 end",
      ...assign.map((l) => `  ${l}`),
      "  return foo()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 100.\n", errors: [] });
  });

  test("a call before the multiple assignment reaches the function", () => {
    const source = lines(
      "function run()",
      "  function foo(...) return 2 end",
      "  local before = foo()",
      "  local a",
      "  a, foo = 1, function() return 100 end",
      "  return before + foo()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 102.\n", errors: [] });
  });

  test("a function statement after the multiple assignment defines the name again", () => {
    const source = lines(
      "function run()",
      "  function foo(...) return 2 end",
      "  local a",
      "  a, foo = 1, function() return 100 end",
      "  local mid = foo()",
      "  function foo(...) return 3 end",
      "  return mid + foo()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 103.\n", errors: [] });
  });
});

describe("a call to a variadic function from a scope with a local of a name it closes over (I-1361)", () => {
  const story = (...body: string[]) =>
    lines(
      "function run()",
      "  local base = 10",
      "  function foo(...)",
      "    return base",
      "  end",
      ...body.map((l) => `  ${l}`),
      "end",
      "Got {run()}.",
    );

  test.each([
    ["blockLocalNamedBaseDirect", ["do", "  local base = 5", "  return foo()", "end"]],
    ["closureParamNamedBase", ["local bar = function(base)", "  return foo()", "end", "return bar(5)"]],
    ["closureLocalNamedBase", ["local bar = function()", "  local base = 5", "  return foo()", "end", "return bar()"]],
    ["a variadic function's parameter", ["function bar(base, ...)", "  return foo()", "end", "return bar(5)"]],
    ["a loop variable", ["for base = 1, 1 do", "  return foo()", "end"]],
  ])("%s: reads the local the function closes over", (_, body) => {
    expect(run(story(...body))).toEqual({ text: "Got 10.\n", errors: [] });
  });

  test("a call from a scope without the name passes the local", () => {
    expect(run(story("return foo()"))).toEqual({ text: "Got 10.\n", errors: [] });
  });

  test("the function and a closure share the local it writes", () => {
    const source = lines(
      "function run()",
      "  local base = 10",
      "  function inc(...)",
      "    base = base + 1",
      "  end",
      "  local read = function() return base end",
      "  do",
      "    local base = 0",
      "    inc()",
      "  end",
      "  local bar = function(base)",
      "    inc()",
      "  end",
      "  bar(0)",
      "  return read()",
      "end",
      "Got {run()}.",
    );
    expect(run(source)).toEqual({ text: "Got 12.\n", errors: [] });
  });
});
