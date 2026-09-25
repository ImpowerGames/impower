// A `function … end` declaration closes at its `end`. The story lines that
// follow it belong to the flow they would join if the function were not
// there: the root flow when the function is declared at the top level, or the
// scene whose content the function is declared among. They never join the
// function's own body, where they would sit after its `return`.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const LESS = `function less(a, b)\n  return a < b\nend\n`;

/** The text of every line the story shows from the top, one per continue. */
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

/** The named top-level containers of the compiled story, keyed by name. */
function namedContainers(source: string): Record<string, unknown> {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  const root = (ctx.compiledJson as { root: unknown[] }).root;
  return (root.at(-1) ?? {}) as Record<string, unknown>;
}

const holds = (container: unknown, text: string) =>
  JSON.stringify(container).includes(JSON.stringify(`^${text}`));

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

  test("the story lines of a function whose body holds them stay in the function", () => {
    // A story line in a function's body closes the definition early, and the
    // rest of the body follows it as chunks of its own; they are still the
    // function's.
    const named = namedContainers(
      `function greet\n  Hello there.\n  How are you?\nend\n\nscene A\n  Line one.\n  done\nend\n`,
    );
    expect(holds(named["greet"], "How are you?")).toBe(true);
    expect(holds(named["A"], "Line one.")).toBe(true);
    expect(holds(named["greet"], "Line one.")).toBe(false);
  });

  test("lines after a function declared inside a scene stay in the scene", () => {
    const source = `-> intro\n\nscene intro\nA\n${LESS}B\nC\nend\n`;
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
  function less(a, b)
    return a < b
  end
  branch world
    Nested {less(1, 2)}.
    fin
  end
end
`;
    expect(linesFromTop(source)).toEqual(["Nested true.\n"]);
  });

  test("a divert after a function declared inside a scene leads on to the next scene", () => {
    const source = `-> one\n\nscene one\nA\n${LESS}-> two\nend\n\nscene two\nB\nend\n`;
    expect(linesFromTop(source)).toEqual(["A\n", "B\n"]);
    const named = namedContainers(source);
    expect(holds(named["two"], "B")).toBe(true);
    expect(holds(named["less"], "B")).toBe(false);
  });
});
