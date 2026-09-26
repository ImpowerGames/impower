import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";

// In narrative code a `return` ends at its line: the next line is prose,
// never the returned value (only a Luau function body reads a value from
// the line after a `return` that is the whole of its line).

function returnEnd(source: string): number | undefined {
  const tree = parseSource(source);
  const cur = tree.cursor();
  do {
    if (cur.name.endsWith("ReturnStatement")) return cur.to;
  } while (cur.next());
  return undefined;
}

/** Every node name the grammar gives to the exact text `key` in `source`. */
function nodeNamesFor(source: string, key: string): string[] {
  const tree = parseSource(source);
  const from = source.indexOf(key);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (cur.from === from && cur.to === from + key.length) names.push(cur.name);
  } while (cur.next());
  return names;
}

describe("the line after a return in narrative code stays prose", () => {
  test.each([
    ["a scene", `scene a\n  return\n  Hello there.\n`],
    ["an if block in a scene", `scene a\n  if x then\n    return\n    Hello there.\n  end\n`],
    ["a choose block", `scene a\n  choose\n    return\n    Hello there.\n  end\nend\n`],
    ["a choose block's then body", `scene a\n  choose\n    * A\n  then\n    return\n    Hello there.\n  end\nend\n`],
    ["if x then return in a scene", `scene a\n  if x then return\n  Hello there.\n  end\n`],
    ["while x do return in a scene", `scene a\n  while x do return\n  Hello there.\n  end\n`],
    ["the top level", `return\nHello there.\n`],
    ["& return in a scene", `scene a\n  & return\n  Hello there.\n`],
    ["& return at the top level", `& return\nHello there.\n`],
    ["& return in an if block in a scene", `scene a\n  if x then\n    & return\n    Hello there.\n  end\n`],
    ["a return after a call on the same line", `scene a\n  & f() return\n  Hello there.\n`],
    ["a return after a local on the same line", `scene a\n  & local x = 5 return\n  Hello there.\n`],
  ])("%s", (_name, source) => {
    const end = returnEnd(source);
    expect(end).toBeDefined();
    expect(end!).toBeLessThanOrEqual(source.indexOf("\n", source.indexOf("return")));
    expect(nodeNamesFor(source, "Hello")).toContain("Word");
  });

  test("& if x then return in a scene", () => {
    const source = `scene a\n  & if x then return\n  Hello there.\n`;
    expect(nodeNamesFor(source, "Hello")).toContain("Word");
  });
});

describe("a function whose last line is a bare return", () => {
  // A function still being typed: `return` is the last thing in the file.
  test.each([
    ["with a final line break", `function f()\n  return\n`],
    ["without a final line break", `function f()\n  return`],
  ])("%s parses to the end of the file", (_name, source) => {
    const tree = parseSource(source);
    expect(tree.length).toBe(source.length);
    expect(returnEnd(source)).toBeDefined();
  });
});
