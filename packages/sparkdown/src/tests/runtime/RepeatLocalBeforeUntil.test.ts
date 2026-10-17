// A one-line `repeat ... until cond` whose last body statement is a `local`
// declaration runs its body once and leaves the statements after it to run:
// the declaration ends before `until`, which the loop takes, and the
// condition is the loop's next sibling rather than a part of the
// declaration (#1092).

import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "../compiler/grammarSnapshot";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  return { errors: ctx.errorMessages, output: runToEnd(ctx.story) };
};

describe("a repeat loop whose body ends with a local declaration", () => {
  test("a function runs the loop and returns after it", () => {
    const r = run(
      "function f()\n  local n = 0\n  repeat n = n + 1 local z = 1 until true\n  return n\nend\n\nResult {f()}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Result 1.\n");
  });

  test("a body of only the declaration still runs its loop", () => {
    const r = run(
      "function g()\n  local n = 0\n  repeat local z = 1 n = n + 1 until true\n  repeat local z = 1 until true\n  return n\nend\n\nResult {g()}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Result 1.\n");
  });

  test("the upstream conformance line keeps the return after it", () => {
    const r = run(
      "function h()\n  repeat local a = 5 until a - 4 < 0 or a - 4 >= 0\n  return 7\nend\n\nValue {h()}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Value 7.\n");
  });

  test("the loop repeats until the condition reads the declared local", () => {
    const r = run(
      "function k()\n  local n = 0\n  repeat n = n + 1 local done = n >= 3 until done\n  return n\nend\n\nResult {k()}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Result 3.\n");
  });

  // A loop nested directly in another is #1195; a block between them keeps
  // each `until` with its own loop.
  test("a loop nested in a block inside another loop runs without an error", () => {
    const r = run(
      "function f()\n  local n = 0\n  repeat\n    do repeat n = n + 1 local z = 1 until true end\n  until true\n  return n\nend\n\nResult {f()}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Result 1.\n");
  });

  test("the top level shows the line after the loop", () => {
    const r = run(
      "store n = 0\nrepeat n = n + 1 local z = 1 until true\nCount {n}.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Count 1.\n");
  });

  test("the until clause is the top-level loop's own, and its condition the loop's sibling", () => {
    const tree = stripAnsi(
      dumpTree("store n = 0\nrepeat n = n + 1 local z = 1 until true\nCount {n}.\n"),
    );
    expect(tree).not.toContain("ERROR_INCOMPLETE");
    expect(tree).toMatch(/^ [├└]─ LuauSparkdownRepeatLoop \[12\.\.46\]$/m);
    expect(tree).toMatch(/─ LuauSparkdownRepeatLoop_end_c2 \[41\.\.46\]\n.*─ LuauUntilKeyword \[41\.\.46\]: "until"$/m);
    expect(tree).toMatch(/^ [├└]─ LuauUntilCondition \[46\.\.51\]$/m);
  });
});

// An `until` after a statement on the loop's line, a declaration or an `&`
// statement, is never read into the statement: no rule reads `until` but a
// loop's end (#1906), so the statement ends before it and the loop takes it,
// as Luau reads it.
describe("a repeat loop whose until follows a statement on its line", () => {
  test("inside a block left without its end, reports Luau's error at the until", () => {
    const ctx = makeRuntimeStoryFromSource(
      "function f()\n  repeat\n    if true then\n      local z = 1 until true\n    end\nend\n",
    );
    expect(ctx.errorMessages).toEqual([
      "Expected 'end' (to close 'then' at line 3), got 'until'",
    ]);
  });

  test("at the top level, runs the loop", () => {
    const r = run("store n = 0\nrepeat & n = n + 1 until n >= 3\nCount {n}.\n");
    expect(r.errors).toEqual([]);
    expect(r.output).toBe("Count 3.\n");
  });
});
