import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(literal: string): { out: string; errors: string[] } {
  const src =
    `store who = "world"\nstore n = 2\n` +
    `scene start\n  {${literal}}\nend\n`;
  const ctx = makeRuntimeStoryFromSource(src);
  let out = "";
  while (ctx.story.canContinue) out += ctx.story.Continue() ?? "";
  return { out: out.trim(), errors: ctx.errorMessages };
}

describe("double-quoted strings interpolate", () => {
  test.each([
    ["`hi {who}`", "hi world"],
    ['"hi {who}"', "hi world"],
    ['"n+1 = {n + 1}"', "n+1 = 3"],
    ['"{who} x{n}"', "world x2"],
    ['"hi world"', "hi world"],
  ])("%s -> %s", (literal, want) => {
    const r = run(literal);
    expect(r.errors).toEqual([]);
    expect(r.out).toBe(want);
  });

  test("`\\{` opts out", () => {
    const r = run('"a \\{literal} brace"');
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("a {literal} brace");
  });
});

describe("single-quoted and `[[...]]` stay literal", () => {
  test.each([
    ["'hi {who}'", "hi {who}"],
    ["'return {'", "return {"],
    ["'{x {y} z}'", "{x {y} z}"],
    ["'local aaa={bbb={ddd=next}}'", "local aaa={bbb={ddd=next}}"],
    ["[[a {raw} brace]]", "a {raw} brace"],
  ])("%s -> %s", (literal, want) => {
    const r = run(literal);
    expect(r.errors).toEqual([]);
    expect(r.out).toBe(want);
  });
});
