import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

describe("Logic (ported from inkjs)", () => {
  test("bare function-call statement (`& func()`)", () => {
    const src = `store counter = 0

scene start
  & inc()
  & inc()
  & inc()
  count is {counter}
  -> DONE
end

function inc()
  counter = counter + 1
end
`;
    const ctx = makeRuntimeStoryFromSource(src);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("count is 3\n");
  });

  test("multiline logic with glue", () => {
    const ctx = makeRuntimeStoryFromFile("logic", "multiline-logic-with-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("a b\na b\n");
  });

});

describe("Logic — ported from ink fixture rewrites", () => {
  test("print num (rewrite of inkjs `print_num.ink` — recursive number-to-words)", () => {
    const ctx = makeRuntimeStoryFromFile("logic", "print-num");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      ". four .\n" +
        ". fifteen .\n" +
        ". thirty-seven .\n" +
        ". one hundred and one .\n" +
        ". two hundred and twenty-two .\n" +
        ". one thousand two hundred and thirty-four .\n",
    );
  });

  test("nested pass by reference (table param as pseudo-ref)", () => {
    const ctx = makeRuntimeStoryFromFile("logic", "nested-pass-by-reference");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("5\n625\n");
  });
});
