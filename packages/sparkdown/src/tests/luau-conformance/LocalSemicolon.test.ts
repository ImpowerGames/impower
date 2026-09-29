import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// A Luau `local` statement ends at a `;` written directly after its value
// (`local x = f();`), just as it does at whitespace or the end of the line.

/** Every rule name in the tree, without the `_c<N>` suffix a capture node carries. */
function nodeNames(source: string): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

/** Every rule name the grammar gives to the text from `from` with length `length`. */
function nodeNamesAt(source: string, from: number, length: number): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (cur.from === from && cur.to === from + length) names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

const STATEMENTS = [
  "local x = 1;",
  "local x = t.y;",
  "local x = (1);",
  "local x = f();",
  "local x: number = f();",
  "local a, b = 1, f();",
] as const;

describe("a local statement ends at a `;` directly after its value", () => {
  test.each(STATEMENTS)("%s", (statement) => {
    const source = `function g()\n  ${statement}\n  return x\nend\n`;
    const semicolon = source.indexOf(";");
    expect(nodeNames(source)).not.toContain("ERROR_INCOMPLETE");
    expect(nodeNamesAt(source, semicolon, 1)).toContain("LuauSemicolonSeparator");
    expect(checkLuau(`local t, f = {y = 1}, function() return 1 end\n${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test("a multi-name local still reads both names", () => {
    const source = `function g()\n  local a, b = 1, 2;\nend\n`;
    expect(nodeNames(source)).not.toContain("ERROR_INCOMPLETE");
    expect(nodeNamesAt(source, source.indexOf("a,"), 1)).toContain("LuauVariableName");
    expect(nodeNamesAt(source, source.indexOf("b ="), 1)).toContain("LuauVariableName");
  });
});
