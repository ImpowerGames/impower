// I-811: a direct call of a pure builtin that takes any number of
// numbers gives no argument for a last call that returned nothing
// (`math.max(2, g0())` is 2, as in Luau), and one that needs an
// argument raises `missing argument #1` when called with none
// (`math.max()` no longer returns -Infinity). A no-value result before
// the last argument still reads as a missing argument, a last multiple
// value still spreads, and a builtin with no minimum (`bit32.band()`)
// still accepts none.
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

function run(expr: string): { text: string; errors: string[] } {
  const source = [
    "function g0()",
    "end",
    "function g2()",
    "  return 7, 9",
    "end",
    "function run()",
    `  return ${expr}`,
    "end",
    "Got {run()}.",
  ].join("\n");
  const ctx = makeRuntimeStoryFromSource(source);
  const errors: string[] = [];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.ContinueMaximally();
  return { text, errors };
}

describe("variadic pure builtin with a no-value last argument", () => {
  test.each([
    ["math.max(2, g0())", "Got 2.\n"],
    ["math.min(3, g0())", "Got 3.\n"],
    ["math.max(2, g2())", "Got 9.\n"],
    ["bit32.band(6, g0())", "Got 6.\n"],
    ["bit32.band()", "Got 4294967295.\n"],
  ])("%s", (expr, expected) => {
    const { text, errors } = run(expr);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test.each([
    ["math.max()", "missing argument #1 to 'max'"],
    ["math.min()", "missing argument #1 to 'min'"],
    ["math.atan()", "missing argument #1 to 'atan'"],
    ["math.max(g0())", "missing argument #1 to 'max'"],
    ["math.max(g0(), 2)", "missing argument #1 to 'max'"],
    ["math.abs(g0())", "missing argument #1 to 'abs'"],
    ["bit32.extract(8, g0())", "missing argument #2 to 'extract'"],
    ["bit32.replace(8, 0, g0())", "missing argument #3 to 'replace'"],
  ])("%s raises", (expr, message) => {
    const { errors } = run(expr);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(message);
  });

  // A first-class call (a local alias, `pcall`) keeps the direct call's
  // minimum.
  test.each([
    [
      "(function() local f = math.max; return f() end)()",
      "missing argument #1 to 'max'",
    ],
    ["(function() local f = math.max; return f(2, g0()) end)()", null],
  ])("%s", (expr, message) => {
    const { text, errors } = run(expr);
    if (message === null) {
      expect(errors).toEqual([]);
      expect(text).toBe("Got 2.\n");
    } else {
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(message);
    }
  });

  test("pcall(math.max) fails", () => {
    const { text, errors } = run("(pcall(math.max))");
    expect(errors).toEqual([]);
    expect(text).toBe("Got false.\n");
  });

  // Its message names the function without its library, as the direct
  // call's does.
  test.each([
    ["math.max", "max"],
    ["math.abs", "abs"],
  ])("pcall(%s) fails naming '%s'", (fn, short) => {
    const { text, errors } = run(`select(2, pcall(${fn}))`);
    expect(errors).toEqual([]);
    expect(text).toBe(`Got missing argument #1 to '${short}'.\n`);
  });
});
