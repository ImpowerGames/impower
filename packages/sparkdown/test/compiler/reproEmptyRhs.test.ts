import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

describe("empty assignment RHS", () => {
  test("`name =` then `end` closes the define (end is a terminator, not a value)", () => {
    const tree = stripAnsi(
      dumpTree("define KING as character with\n  name =\nend\n"),
    );
    expect(tree).toMatch(/LuauEndKeyword \[\d+\.\.\d+\]: "end"/);
    expect(tree).not.toMatch(/LuauVariableName \[\d+\.\.\d+\]: "end"/);
  });

  test("a normal single-line value still parses + the block still closes", () => {
    const tree = stripAnsi(
      dumpTree('define O as companion with\n  name = "Orion"\nend\n'),
    );
    expect(tree).toContain('"Orion"');
    expect(tree).toMatch(/LuauEndKeyword \[\d+\.\.\d+\]: "end"/);
  });
});
