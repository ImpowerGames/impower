// The alternator arm scan and a header's attribute prefix share one on-line
// quoted string per quote kind (I-1315), and neither takes a carriage return
// as string content: a quoted string still open at a `\r` does not close on
// its line, so the scan cannot read past it to a later `|`.
import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

describe("an on-line quoted string ends at a carriage return", () => {
  test.each(['"first\r"', "'first\r'", "`first\r`"])("a call on %j before a `|` opens no alternator", (string) => {
    const source = `function f()\n  local value = queue ${string} | "second"\nend\n`;
    expect(stripAnsi(dumpTree(source))).not.toMatch(/AlternatorBlock \[/);
  });

  test.each(['"first"', "'first'", "`first`"])("a closed string %s before a `|` still opens the alternator", (string) => {
    const source = `function f()\n  local value = queue ${string} | "second"\nend\n`;
    expect(stripAnsi(dumpTree(source))).toMatch(/─ LuauSequentialAlternatorBlock \[/);
  });
});
