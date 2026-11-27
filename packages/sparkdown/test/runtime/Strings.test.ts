import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  runToEnd,
} from "./runtimeTestHarness";

describe("Strings (ported from inkjs)", () => {
  test("string constants flow through a store variable", () => {
    const ctx = makeRuntimeStoryFromFile("strings", "string-constants");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hi\n");
  });

  test("string contains via :find()", () => {
    const ctx = makeRuntimeStoryFromFile("strings", "string-contains");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("8\nnil\n");
  });

  test("explicit string↔number conversion via concat (sparkdown is strictly typed)", () => {
    const ctx = makeRuntimeStoryFromFile("strings", "type-coercion-tonumber");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("same\ndifferent\n");
  });
});

describe.skip("Strings — closed by design (see docs/runtime/DIVERGENCES.md)", () => {
  test("strings in choices (leading `{var}` is grammar-ambiguous with ChoiceConditional)", () => {});
});
