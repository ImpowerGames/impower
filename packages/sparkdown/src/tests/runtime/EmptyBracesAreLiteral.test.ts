// An empty `{}` is two literal characters, not an interpolation.
//
// It used to OPEN one, lower to nothing, and delete itself from the string with
// no error at all — `` `a={}; x=3` `` silently became `a=; x=3`. That bites
// hardest on the thing strings most often hold: snippets of code.
//
// Found while trying to make `"..."` interpolate like `` `...` ``. That change
// was reverted (a brace inside a plain string is ordinary Lua — `'return {'` in
// upstream `tables.luau` — so interpolating quoted strings breaks parsing of
// real Lua source), but the empty-brace bug it exposed is independent and
// pre-existing, so the fix stands on its own.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(literal: string): { out: string; errors: string[] } {
  const src = `store n = 2\n-> start\nscene start\n  {${literal}}\nend\n`;
  const ctx = makeRuntimeStoryFromSource(src);
  let out = "";
  while (ctx.story.canContinue) out += ctx.story.Continue() ?? "";
  return { out: out.trim(), errors: ctx.errorMessages };
}

describe("empty braces are literal", () => {
  test.each([
    ["`a={}; x=3`", "a={}; x=3"],
    ["`local a={}; a.bbbb(3)`", "local a={}; a.bbbb(3)"],
    ["`Escaped brace: {}`", "Escaped brace: {}"],
    ['"a={}; x=3"', "a={}; x=3"],
  ])("%s -> %s", (literal, want) => {
    const r = run(literal);
    expect(r.errors).toEqual([]);
    expect(r.out).toBe(want);
  });

  test("a NON-empty interpolation still interpolates", () => {
    const r = run("`n+1 = {n + 1}`");
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("n+1 = 3");
  });

  test("an empty pair next to a real one does not swallow it", () => {
    const r = run("`{} {n}`");
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("{} 2");
  });
});
