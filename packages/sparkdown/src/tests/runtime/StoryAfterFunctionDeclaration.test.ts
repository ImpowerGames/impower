import { describe, expect, test } from "vitest";
import { flowListings, pushesString } from "../programListing";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const LESS = `function less(a, b)\n  return a < b\nend\n`;
const LOCAL_LESS = `local ${LESS}`;

function linesFromTop(source: string): string[] {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const lines: string[] = [];
  while (ctx.story.canContinue) {
    const text = ctx.story.Continue();
    if (text) {
      lines.push(text);
    }
  }
  expect(ctx.story.currentErrors ?? []).toEqual([]);
  return lines;
}

function namedContainers(source: string): Record<string, string[]> {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  return Object.fromEntries(flowListings(ctx.root));
}

const INCOMPLETE =
  "Incomplete statement: expected assignment or a function call";

const holds = (flow: string[] | undefined, text: string) =>
  pushesString(flow ?? [], text);

describe("story lines after a function declaration", () => {
  test("lines after a function declared first play from the top", () => {
    expect(linesFromTop(`${LESS}\nA\nB\nC\n`)).toEqual(["A\n", "B\n", "C\n"]);
  });

  test("lines after a function declared below a store play from the top", () => {
    expect(linesFromTop(`store t = {3, 1, 2}\n${LESS}\nA\nB\nC\n`)).toEqual([
      "A\n",
      "B\n",
      "C\n",
    ]);
  });

  test("lines around a function declared between story lines all play from the top", () => {
    expect(linesFromTop(`A\n${LESS}B\nC\n`)).toEqual(["A\n", "B\n", "C\n"]);
  });

  test("the function can be called from the lines after it", () => {
    expect(linesFromTop(`${LESS}\n{less(1, 2)}\n`)).toEqual(["true\n"]);
  });

  test("the function's container holds only its own body", () => {
    const named = namedContainers(`${LESS}\nA\nB\nC\n`);
    expect(named["less"]).toBeDefined();
    for (const text of ["A", "B", "C"]) {
      expect(holds(named["less"], text), `less holds ${text}`).toBe(false);
    }
  });

  test("lines of a function's body that are not Luau statements are each reported as an error", () => {
    const ctx = makeRuntimeStoryFromSource(
      `function greet\n  Hello there.\n  How are you?\nend\n\nscene A\n  Line one.\n  done\nend\n`,
    );
    expect(ctx.errorMessages.map((m) => m.split("\n")[0])).toEqual([
      "Expected identifier after '.' on the same line",
      INCOMPLETE,
      INCOMPLETE,
      INCOMPLETE,
      INCOMPLETE,
      "Expected identifier when parsing expression, got '?'",
    ]);
  });

  test("a function whose body is only lines of words ends at its `end`, and the line after it plays from the top", () => {
    const ctx = makeRuntimeStoryFromSource(
      `function greet\n  Hello there.\n  How are you?\nend\nAfter it.\n\nscene A\n  Line one.\n  done\nend\n`,
    );
    expect(ctx.errorMessages.map((m) => m.split("\n")[0])).toEqual([
      "Expected identifier after '.' on the same line",
      INCOMPLETE,
      INCOMPLETE,
      INCOMPLETE,
      INCOMPLETE,
      "Expected identifier when parsing expression, got '?'",
    ]);
    const lines: string[] = [];
    while (ctx.story.canContinue) {
      const text = ctx.story.Continue();
      if (text) {
        lines.push(text);
      }
    }
    expect(lines).toEqual(["After it.\n"]);
    const named = flowListings(ctx.root);
    expect(holds(named.get("greet"), "After it.")).toBe(false);
  });

  test("a line of a function's body that is not a Luau statement leaves the lines after its `end` playing from the top", () => {
    const ctx = makeRuntimeStoryFromSource(
      `function greet()\n  local x = 1\n  How are you?\nend\nAfter it.\n`,
    );
    expect(ctx.errorMessages).toEqual([INCOMPLETE, INCOMPLETE, INCOMPLETE, "Expected identifier when parsing expression, got '?'"]);
    const lines: string[] = [];
    while (ctx.story.canContinue) {
      const text = ctx.story.Continue();
      if (text) {
        lines.push(text);
      }
    }
    expect(lines).toEqual(["After it.\n"]);
    const named = flowListings(ctx.root);
    expect(holds(named.get("greet"), "After it.")).toBe(false);
  });

  test("lines after a function declared inside a scene stay in the scene", () => {
    const source = `-> intro\n\nscene intro\nA\n${LOCAL_LESS}B\nC\nend\n`;
    expect(linesFromTop(source)).toEqual(["A\n", "B\n", "C\n"]);
    const named = namedContainers(source);
    for (const text of ["A", "B", "C"]) {
      expect(holds(named["intro"], text), `intro holds ${text}`).toBe(true);
      expect(holds(named["less"], text), `less holds ${text}`).toBe(false);
    }
  });

  test("a branch after a function declared inside a scene belongs to the scene", () => {
    const source = `-> s.world
scene s
  local function less(a, b)
    return a < b
  end
  branch world
    Nested {tostring(less)}.
    fin
  end
end
`;
    expect(linesFromTop(source)).toEqual(["Nested nil.\n"]);
  });

  test("a divert after a function declared inside a scene leads on to the next scene", () => {
    const source = `-> one\n\nscene one\nA\n${LOCAL_LESS}-> two\nend\n\nscene two\nB\nend\n`;
    expect(linesFromTop(source)).toEqual(["A\n", "B\n"]);
    const named = namedContainers(source);
    expect(holds(named["two"], "B")).toBe(true);
    expect(holds(named["less"], "B")).toBe(false);
  });
});
