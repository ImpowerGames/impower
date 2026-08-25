// `"..."` interpolates `{expr}` like `` `...` ``. `'...'` deliberately does
// NOT — it is the literal single-line form.
//
// That split is the whole point: a brace inside a plain string is ordinary Lua
// (`'return {'`, a `%b{}` subject, JSON, code generation), so there has to be a
// single-line quote that leaves braces alone. Making BOTH quote forms
// interpolate broke two upstream conformance fixtures; making only `"..."`
// interpolate leaves `'...'` as the escape hatch.
//
// These run the story rather than inspecting the tree, because a string that
// failed to interpolate produces a silently literal `hi {who}` rather than an
// error.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(literal: string): { out: string; errors: string[] } {
  const src =
    `store who = "world"\nstore n = 2\n` +
    `-> start\nscene start\n  {${literal}}\nend\n`;
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

// The escape hatches. Without these, a string holding code or a pattern has no
// way to survive.
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
