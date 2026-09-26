// A read of a global that nothing declares or assigns is reported inside a
// function body the same way as at the top level, and the warning's range
// covers the statement's own columns, whatever its indentation.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";

const WARNING = "Cannot find variable named `foo`";

type Range = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

function textAt(source: string, range: Range): string {
  const lines = source.split("\n");
  expect(range.start.line).toBe(range.end.line);
  return lines[range.start.line]!.slice(
    range.start.character,
    range.end.character,
  );
}

function unknownGlobalRanges(source: string): Range[] {
  return diagnoseDetailed(source)
    .filter((d) => d.message === WARNING)
    .map((d) => d.range as Range);
}

describe("an unknown global read inside a function", () => {
  test.each([
    "print(foo)",
    "  print(foo)",
    "    print(foo)",
    "return foo",
    "  return foo",
    "    return foo",
    "local x = foo",
    "  local x = foo",
    "  local _ = `unknown {foo}`",
    "  local x = foo + 1",
    "  if foo then end",
  ])("%j is reported on its own columns", (body) => {
    const source = `function run()\n${body}\nend\n`;
    const ranges = unknownGlobalRanges(source);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.start.line).toBe(1);
    expect(textAt(source, ranges[0]!).trim()).toBe(body.trim());
    expect(ranges[0]!.end.character).toBe(body.length);
  });

  test("a second statement on the line is reported on its own columns", () => {
    const body = "local y = 1; local x = foo";
    const source = `function run()\n${body}\nend\n`;
    const ranges = unknownGlobalRanges(source);
    expect(ranges).toHaveLength(1);
    expect(textAt(source, ranges[0]!)).toBe("local x = foo");
  });
});

describe("an unknown global read at the top level", () => {
  test("keeps the range of the explicit statement", () => {
    const source = "& print(foo)\n";
    const ranges = unknownGlobalRanges(source);
    expect(ranges).toHaveLength(1);
    expect(textAt(source, ranges[0]!)).toBe("& print(foo)");
  });
});
