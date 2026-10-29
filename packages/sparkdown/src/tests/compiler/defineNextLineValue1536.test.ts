import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

const official = (body: string) => officialErrorList(`do\n${body}end\n`).sort();

function nodeNames(text: string): string[] {
  const names: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do names.push(cursor.name);
  while (cursor.next());
  return names;
}

const STORY = "Hello.\n";

const MALFORMED = [
  "  y =\n    print(1 2)\n",
  "  y =\n    {1 2}\n",
  "  y =\n    f(1 2)\n",
  "  y = -- c\n    print(1 2)\n",
  "  y = --[[c]]\n    print(1 2)\n",
  "  y = 1\n  z =\n    g(1 2)\n",
  "  y =\n    f(1 2)\n  z =\n    3\n",
  "  y =\n    if c then 1 2 else 2\n",
  "  y =\n    1 +\n  z = 2\n",
  "  y =\n    t\n    .f(1 2)\n",
  "  y =\n    x.\n",
  "  y =\n    !\n",
  "  y =\n    function() return (1 +) end\n",
  "  y =\n    local z = 1\n",
  "  y =\n    return 1\n",
  "  y =\n",
];

const VALID = [
  "  y =\n    print(1)\n",
  "  y =\n    5\n",
  "  y =\n    {\n      a = 1,\n    }\n",
  "  y = -- c\n    print(1)\n",
  "  y =\n    1\n  z = 2\n",
  "  y =\n    if c then 1 else 2\n",
  "  y =\n    function() return 1 end\n",
  "  y =\n    function()\n      return 1\n    end\n",
  "  y = print(1)\n",
];

describe("a define property's value on the line after its `=` (I-1536)", () => {
  for (const body of [...MALFORMED, ...VALID]) {
    const text = `define X with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: the official parser's errors for the body`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual(official(body));
    });
    test(`${JSON.stringify(body)}: the define keeps its end`, () => {
      expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
    });
    test(`${JSON.stringify(body)}: an incremental compile reports what a cold one does`, () => {
      expectIncrementalEqualsCold(text);
    });
  }
  test("a named function after a line-ending `=` stays a member (I-1560)", () => {
    const body = "  y =\n  function f() return 1 end\n";
    const text = `define X with\n${body}end\n${STORY}`;
    expect(errors(text)).toEqual(["1:4-1:5 Expected identifier when parsing expression, got 'function'"]);
    expect(official(body)).toEqual(["2:11-2:12 Expected '(' when parsing function, got 'f'"]);
    expect(nodeNames(text)).toContain("LuauDefine_end");
    expectIncrementalEqualsCold(text);
  });
  test("each malformed form has an official error, and each valid form none", () => {
    for (const body of MALFORMED) expect(official(body).length, body).toBeGreaterThan(0);
    for (const body of VALID) expect(official(body), body).toEqual([]);
  });
});
