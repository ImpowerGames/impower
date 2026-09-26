import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";

// In narrative code a bare `return` ends at its line: the next line is
// prose, never the returned value (only a Luau function body reads a value
// from the line after `return`).

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

describe("the line after a bare return in narrative code stays prose", () => {
  test.each([
    ["a scene", `scene a\n  return\n  Hello there.\n`],
    ["an if block in a scene", `scene a\n  if x then\n    return\n    Hello there.\n  end\n`],
  ])("%s", (_name, source) => {
    const end = returnEnd(source);
    expect(end).toBeDefined();
    expect(end!).toBeLessThanOrEqual(source.indexOf("\n", source.indexOf("return")));
    expect(nodeNamesFor(source, "Hello")).toContain("Word");
  });
});
