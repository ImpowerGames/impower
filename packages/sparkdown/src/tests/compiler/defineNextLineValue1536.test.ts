// A define body's property whose `=` ends its line takes its value from the
// next line, as Luau's assignment does (I-1536). The define keeps its `end`,
// the errors are what the official parser reports for the body's statements
// in a `do` block, a valid value reports nothing, and an incremental compile
// reports what a cold one does.
import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

/** The official errors of a define body's statements, written in a `do` block in place of the define's header. */
const official = (body: string) => officialErrorList(`do\n${body}end\n`).sort();

/** The names of the nodes of `text`'s tree. */
function nodeNames(text: string): string[] {
  const names: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do names.push(cursor.name);
  while (cursor.next());
  return names;
}

const STORY = "Hello.\n";

// The bodies between `define X with` and the define's own `end`, which a
// story line follows.
const MALFORMED = [
  // The ticket's form.
  "  y =\n    print(1 2)\n",
  "  y =\n    {1 2}\n",
  "  y =\n    f(1 2)\n",
  // After a comment that ends the `=`'s line.
  "  y = -- c\n    print(1 2)\n",
  "  y = --[[c]]\n    print(1 2)\n",
  // The value of a second property.
  "  y = 1\n  z =\n    g(1 2)\n",
  // The first of two properties, each continued.
  "  y =\n    f(1 2)\n  z =\n    3\n",
  // An if expression that begins the next line.
  "  y =\n    if c then 1 2 else 2\n",
  // A value that runs on past its line, into the line of a property, and
  // one that a `.` no name follows ends.
  "  y =\n    1 +\n  z = 2\n",
  "  y =\n    t\n    .f(1 2)\n",
  "  y =\n    x.\n",
  // A token no rule reads.
  "  y =\n    !\n",
  // A statement keyword, where a value would begin, and no value at all.
  "  y =\n    local z = 1\n",
  "  y =\n    return 1\n",
  "  y =\n",
];

const VALID = [
  "  y =\n    print(1)\n",
  "  y =\n    5\n",
  // A table opened on the next line.
  "  y =\n    {\n      a = 1,\n    }\n",
  "  y = -- c\n    print(1)\n",
  // Two properties where only the first continues.
  "  y =\n    1\n  z = 2\n",
  "  y =\n    if c then 1 else 2\n",
  // A value on the `=`'s own line.
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
  test("each malformed form has an official error, and each valid form none", () => {
    for (const body of MALFORMED) expect(official(body).length, body).toBeGreaterThan(0);
    for (const body of VALID) expect(official(body), body).toEqual([]);
  });
});
