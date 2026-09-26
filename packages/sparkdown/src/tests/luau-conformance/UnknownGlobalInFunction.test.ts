// A read of a global that nothing declares or assigns is reported inside a
// function body the same way as at the top level, and the warning's range
// covers the statement from its first character to its last, whatever its
// indentation.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";

const WARNING = "Cannot find variable named `foo`";

type Range = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

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
  ])("%j is reported on the statement", (body) => {
    const source = `function run()\n${body}\nend\n`;
    const indentation = body.length - body.trimStart().length;
    expect(unknownGlobalRanges(source)).toEqual([
      {
        start: { line: 1, character: indentation },
        end: { line: 1, character: body.length },
      },
    ]);
  });

  test("a second statement on the line is reported on its own columns", () => {
    const body = "local y = 1; local x = foo";
    const source = `function run()\n${body}\nend\n`;
    const start = body.indexOf("local x");
    expect(unknownGlobalRanges(source)).toEqual([
      {
        start: { line: 1, character: start },
        end: { line: 1, character: body.length },
      },
    ]);
  });
});

describe("an unknown global read at the top level", () => {
  test("keeps the range of the explicit statement", () => {
    expect(unknownGlobalRanges("& print(foo)\n")).toEqual([
      { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
    ]);
  });
});

// A read whose statement has no position of its own inherits the position of
// the scene or branch declared around it. That line is not where the read is,
// so the warning is not reported at all until those statements get positions
// of their own (#944).
describe("a read placed only by the flow around it", () => {
  test.each([
    [
      "a match in a scene",
      "scene start()\n  Hello.\nend\n\nmatch (foo)\n  | other = A recruit.\nend\n",
    ],
    [
      "an if in a branch",
      "scene start()\n  branch first\n    if foo >= 1 then\n      Yes.\n    end\n  end\nend\n",
    ],
  ])("%s is not reported", (_name, source) => {
    expect(unknownGlobalRanges(source)).toEqual([]);
  });
});
