// I-1413: every expression in a script is Luau, so a story-level condition,
// interpolation or choice condition compares and computes mixed-type operands
// by Luau's rules, as a Luau body does: equality of different types is false,
// arithmetic on a boolean and ordering of a number with a string raise.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// Runs the story to its first choice point or end and returns the text shown,
// the choices offered and the errors `onError` received.
function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const story: any = ctx.story;
  const runtimeErrors: string[] = [];
  story.onError = (message: string) => runtimeErrors.push(message);
  const lines: string[] = [];
  while (story.canContinue) {
    const text = story.Continue();
    if (text?.trim()) lines.push(text.trim());
  }
  const choices = story.currentChoices.map((c: any) => c.text);
  return { lines, choices, runtimeErrors };
}

describe("mixed-type operators in story expressions", () => {
  test("a condition compares values of different types as unequal", () => {
    const r = run(`store n = 1
store s = "1"

scene start
  if n == s then
    {"equal"}
  else
    {"unequal"}
  end
  if n ~= s then
    {"differ"}
  end
  if n == 1 then
    {"same type"}
  end
end`);
    expect(r.runtimeErrors).toEqual([]);
    expect(r.lines).toEqual(["unequal", "differ", "same type"]);
  });

  test("an interpolation of a mixed-type equality shows false", () => {
    const r = run(`store b = true

scene start
  {b == 1}
  {b == true}
end`);
    expect(r.runtimeErrors).toEqual([]);
    expect(r.lines).toEqual(["false", "true"]);
  });

  test("an interpolation of arithmetic on a boolean raises", () => {
    const r = run(`store b = true

scene start
  {b + 1}
end`);
    expect(r.runtimeErrors.join("\n")).toContain(
      "attempt to perform arithmetic (add) on boolean and number",
    );
  });

  test("a condition ordering a number with a string raises", () => {
    const r = run(`store n = 1
store s = "a"

scene start
  if n < s then
    {"less"}
  end
end`);
    expect(r.runtimeErrors.join("\n")).toContain(
      "attempt to compare number < string",
    );
  });

  test("a choice condition with a mixed-type equality hides the choice", () => {
    const r = run(`store n = 1

scene start
  choose
    * if (n == "1") coerced
    * if (n == 1) numeric
  end
  done
end`);
    expect(r.runtimeErrors).toEqual([]);
    expect(r.choices).toEqual(["numeric"]);
  });

  test("a choice condition ordering two booleans raises", () => {
    const r = run(`store b = true

scene start
  choose
    * if (b < false) never
    * fallback
  end
  done
end`);
    expect(r.runtimeErrors.join("\n")).toContain(
      "attempt to compare boolean < boolean",
    );
  });
});
