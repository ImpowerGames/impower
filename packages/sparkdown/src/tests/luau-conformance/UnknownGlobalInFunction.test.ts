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

// A block statement in a scene, a branch, a function or at the top level is
// reported on its header line, the line that holds the read, from its first
// character to its last (#944).
describe("an unknown global read in a block statement", () => {
  test.each([
    [
      "an if in a function",
      "function run()\n  if foo then\n    print(1)\n  end\nend\n",
      1,
    ],
    ["an if in a scene", "scene start()\n  if foo >= 1 then\n    Yes.\n  end\nend\n", 1],
    [
      "an if in a branch",
      "scene start()\n  branch first\n    if foo >= 1 then\n      Yes.\n    end\n  end\nend\n",
      2,
    ],
    [
      "an elseif after a valid if in a scene",
      "store known = false\nscene start()\n  if known then\n    First.\n  elseif foo then\n    Second.\n  end\nend\n",
      4,
    ],
    [
      "an elseif after a valid if in a function",
      "function run()\n  if true then\n    print(1)\n  elseif foo then\n    print(2)\n  end\nend\n",
      3,
    ],
    ["a match in a scene","scene start()\n  match (foo)\n    | other = A recruit.\n  end\nend\n", 1],
    [
      "a top-level match after a scene",
      "scene start()\n  Hello.\nend\n\nmatch (foo)\n  | other = A recruit.\nend\n",
      4,
    ],
  ])("%s is reported on its header line", (_name, source, line) => {
    const text = source.split("\n")[line]!;
    expect(unknownGlobalRanges(source)).toEqual([
      {
        start: { line, character: text.length - text.trimStart().length },
        end: { line, character: text.length },
      },
    ]);
  });
});
