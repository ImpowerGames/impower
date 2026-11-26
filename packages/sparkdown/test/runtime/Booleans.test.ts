import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Booleans (ported from inkjs)", () => {
  function expectOutput(fixture: string, expected: string) {
    const ctx = makeRuntimeStoryFromFile("booleans", fixture);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(expected);
  }

  function expectRuntimeError(fixture: string, expected: string) {
    const ctx = makeRuntimeStoryFromFile("booleans", fixture);
    expect(ctx.errorMessages).toEqual([]);
    const runtimeErrors: string[] = [];
    (ctx.story as any).onError = (message: string) =>
      runtimeErrors.push(message);
    runToEnd(ctx.story);
    expect(runtimeErrors.join("\n")).toContain(expected);
  }

  test("true", () => expectOutput("true", "true\n"));
  test("true + 1", () =>
    expectRuntimeError(
      "true-plus-one",
      "attempt to perform arithmetic (add) on boolean and number",
    ));
  test("2 + true", () =>
    expectRuntimeError(
      "two-plus-true",
      "attempt to perform arithmetic (add) on number and boolean",
    ));
  test("false + false", () =>
    expectRuntimeError(
      "false-plus-false",
      "attempt to perform arithmetic (add) on boolean",
    ));
  test("true + true", () =>
    expectRuntimeError(
      "true-plus-true",
      "attempt to perform arithmetic (add) on boolean",
    ));
  test("true == 1", () => expectOutput("true-equals-one", "false\n"));
  test("not 1", () => expectOutput("not-one", "false\n"));
  test("not true", () => expectOutput("not-true", "false\n"));
  test("3 > 1", () => expectOutput("three-greater-than-one", "true\n"));

  test("list hasnt — `not t:find(x)` truthy-check (rewrite of inkjs `list_hasnt.ink`)", () => {
    expectOutput("list-hasnt", "true\n");
  });
});
