import { describe, expect, test } from "vitest";
import { collectDiagnostics, makeRuntimeStoryFromSource } from "./runtimeTestHarness";

describe("Luau casts to type targets (#877)", () => {
  test.each(["types --[[c]] .Number?", "types. --[[c]] Array<number>", "types --[====[long\ncomment]====] .Number?", "types. --[====[long\ncomment]====] Number?"])
    ("preserves following return after %s", (target) => {
      const ctx = makeRuntimeStoryFromSource(`Value {f()}.\nfunction f()\n  local a = 55 :: ${target}\n  return a\nend\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe("Value 55.\n");
    });
  test.each([["number | string", "<= 55"], ["(number | string)", "< 56"]])
    ("compares a cast to %s with %s", (target, comparison) => {
      const ctx = makeRuntimeStoryFromSource(
        `Value {f()}.\nfunction f()\n  local a = 55 :: ${target} ${comparison}\n  return a\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe("Value true.\n");
    });
  test("reports an unclosed function target", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Value {f()}.\nfunction f()\n  local a = nil :: (number -> string\n  return 55\nend\n",
    );
    expect(ctx.errorMessages.some((message) => message.includes("Expected ')'"))).toBe(true);
  });
  test.each([
    ["(number", ")"],
    ["(x: number -> string", ")"],
    ["{number", "}"],
    ["Array<number", ">"],
    ["() -> (number", ")"],
    ["typeof(a", ")"],
    ["{[number: string}", "]"],
  ])("reports an unfinished target %s", (target, close) => {
    const ctx = collectDiagnostics(`function f()\n  local a = nil :: ${target}\n  return 55\nend\n`);
    expect(ctx.errorMessages.some((message) => message.includes(`Expected '${close}'`))).toBe(true);
  });
  test("preserves the value cast to an optional type", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Value {f()}.\nfunction f()\n  local a = 55 :: number?\n  return a\nend\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 55.\n");
  });
});
