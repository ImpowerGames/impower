import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";

const SHOUT = `function shout()
  return "HEY"
end

`;

const FMT = `function fmt(a, b)
  return a .. "/" .. b
end

`;

describe("{{fn}} function-call shorthand", () => {
  test("display text: {{fn}} calls the function and outputs its return", () => {
    const ctx = makeRuntimeStoryFromSource(
      "The hero yells {{shout}}!\n\n" + SHOUT,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("The hero yells HEY!\n");
  });

  test("display text: {{fn(args)}} passes arguments", () => {
    const ctx = makeRuntimeStoryFromSource(
      "You have {{fmt(3, 7)}} left.\n\n" + FMT,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("You have 3/7 left.\n");
  });

  test("whitespace inside the braces is tolerated ({{ fn }})", () => {
    const ctx = makeRuntimeStoryFromSource("Yell {{ shout }} now.\n\n" + SHOUT);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Yell HEY now.\n");
  });

  test("a bare {{fn}} line at statement position outputs the value", () => {
    const ctx = makeRuntimeStoryFromSource("{{shout}}\n\n" + SHOUT);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("HEY\n");
  });

  test("backtick Luau strings interpolate {{fn}}", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store msg = `Cry: {{shout}}!`\n{msg}\n\n" + SHOUT,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Cry: HEY!\n");
  });

  test('double-quoted Luau strings interpolate {{fn}}', () => {
    const ctx = makeRuntimeStoryFromSource(
      'store msg = "Cry: {{shout}}!"\n{msg}\n\n' + SHOUT,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Cry: HEY!\n");
  });

  test("tag bodies interpolate {{fn}} into currentTags", () => {
    const ctx = makeRuntimeStoryFromSource("Hello # tone {{shout}}\n\n" + SHOUT);
    expect(ctx.errorMessages).toEqual([]);
    const text = ctx.story.Continue();
    expect(text).toBe("Hello\n");
    expect(ctx.story.currentTags).toEqual(["tone HEY"]);
  });

  test("`\\{` / `\\}` escape a literal brace in display text", () => {
    const ctx = makeRuntimeStoryFromSource("Literal \\{braces\\} here.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Literal {braces} here.\n");
  });

  test("a non-call body ({{1 + 2}}) is the 'expected a function name' error", () => {
    const { errorMessages } = collectDiagnostics("Bad {{1 + 2}} here.\n");
    expect(
      errorMessages.some((m) => m.includes("Expected a function name")),
    ).toBe(true);
  });

  test("a bare {{}} is the 'expected a function name' error", () => {
    const { errorMessages } = collectDiagnostics("Bad {{}} here.\n");
    expect(
      errorMessages.some((m) => m.includes("Expected a function name")),
    ).toBe(true);
  });
});
