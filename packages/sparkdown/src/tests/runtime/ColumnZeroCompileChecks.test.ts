// Compile checks on statements and declarations at column 0 are reported like
// any others. These pin what each check reports for Sparkdown: the shapes
// Sparkdown runs are not errors, and the ones that break a story are.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";

describe("a scene named after a builtin function", () => {
  test("is diverted to, and calls still reach the builtin", () => {
    const ctx = makeRuntimeStoryFromSource(`store t = { 5 }
-> start

scene start
  {next(t)}
  -> next
end

scene next
  Next.
  fin
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("1\nNext.\n");
  });

  test("a divert to a builtin's name with no such scene is an error on the name", () => {
    const source = `-> start\n\nscene start\n  -> next\nend\n`;
    const errors = diagnoseDetailed(source).filter((d) => d.severity === 1);
    expect(errors.map((d) => [d.message, d.range])).toEqual([
      [
        "next must be called as a function: ~ next()",
        { start: { line: 3, character: 5 }, end: { line: 3, character: 9 } },
      ],
    ]);
  });

  test("a function with that name is still an error", () => {
    const ctx = makeRuntimeStoryFromSource(`function next(a)
  return 1
end

Hello.
`);
    expect(ctx.errorMessages).toEqual([
      "`next` cannot be used for the name of a function because it's a built in function",
    ]);
  });
});

describe("a parameter diverted to", () => {
  test("needs no divert-target annotation", () => {
    const ctx = makeRuntimeStoryFromSource(`-> go(-> there)

scene go(target)
  -> target
end

scene there
  Arrived.
  fin
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });
});

describe("repeated parameter names", () => {
  test("`_` may repeat", () => {
    const ctx = makeRuntimeStoryFromSource(`function f(_, _, b)
  return b
end

{f(1, 2, 3)}
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("3\n");
  });

  test("any other repeated name is an error", () => {
    const ctx = makeRuntimeStoryFromSource(`function f(a, a)
  return a
end

Hello.
`);
    expect(ctx.errorMessages).toEqual([
      "Multiple arguments with the same name: `a`",
    ]);
  });
});
