import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

describe("an on-line quoted string ends at a carriage return", () => {
  test.each(['"first\r"', "'first\r'", "`first\r`"])("a call on %j before a `|` opens no alternator", (string) => {
    const source = `function f()\n  local value = queue ${string} | "second"\nend\n`;
    expect(stripAnsi(dumpTree(source))).not.toMatch(/AlternatorArms \[/);
  });

  test.each(['"first"', "'first'", "`first`"])("a closed string %s before a `|` still opens the alternator", (string) => {
    const source = `function f()\n  local value = queue ${string} | "second"\nend\n`;
    expect(stripAnsi(dumpTree(source))).toMatch(/─ LuauSequentialAlternatorBlock \[/);
    expect(stripAnsi(dumpTree(source))).toMatch(/─ LuauAlternatorArms \[/);
  });
});
