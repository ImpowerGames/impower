import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Extra (ported from inkjs)", () => {
  test("arithmetic: int-vs-float division matrix", () => {
    const ctx = makeRuntimeStoryFromFile("extra", "arithmetic-2");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "2.3333333333333335\n2.3333333333333335\n2.3333333333333335\n2.3333333333333335\n",
    );
  });
});
