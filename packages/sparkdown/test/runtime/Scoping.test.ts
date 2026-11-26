import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Scoping (luau block-scoped local)", () => {
  test("reassign-without-local mutates the outer binding", () => {
    const ctx = makeRuntimeStoryFromFile(
      "scoping",
      "reassign-without-local",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("99\n");
  });

  test("else-branch scope is isolated from outer", () => {
    const ctx = makeRuntimeStoryFromFile("scoping", "else-branch-isolated");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("2\n1\n");
  });

  test("local x in if-block shadows outer local x", () => {
    const ctx = makeRuntimeStoryFromFile(
      "scoping",
      "local-shadows-in-if-block",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("2\n1\n");
  });
});
