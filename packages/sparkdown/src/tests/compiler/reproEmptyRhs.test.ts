import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

// An empty assignment RHS (`name =` with nothing after it on the line) must NOT
// let the value scope cross the newline and swallow the next line's `end` as the
// value — the enclosing `define` block must still close. (The assignment
// operator no longer consumes the line break; `end` stays a terminator keyword.)

describe("empty assignment RHS", () => {
  test("`name =` then `end` closes the define (end is a terminator, not a value)", () => {
    const tree = stripAnsi(
      dumpTree("define KING as character with\n  name =\nend\n"),
    );
    // `end` is the block terminator…
    expect(tree).toMatch(/LuauEndKeyword \[\d+\.\.\d+\]: "end"/);
    // …NOT mis-parsed as a property variable name.
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
