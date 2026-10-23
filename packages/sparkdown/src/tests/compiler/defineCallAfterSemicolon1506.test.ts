// A call written after a `;` on a line of a `define` body is a statement of
// the body, not a method's header: a method header begins only where its line
// starts (I-1506). The define keeps its `end`, the call's errors are what the
// official parser reports for the body's statements in a `do` block, and a
// `name(` at the start of a line keeps its method-versus-call reading
// (I-1454). Both TextMate engines read each form alike, and an incremental
// compile reports what a cold one does. A method written right after the
// define header's `with` is a method, as on main.
import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold, methodReadings } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
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

// [the define's statements, the methods after them, the method readings].
// They stand between `define X with` and the define's own `end`, which a
// story line follows; the errors are the official parser's for the
// statements, and the well-formed methods report nothing.
const FORMS: [statements: string, methods: string, readings: string[]][] = [
  // The ticket's form: a call after a property and a `;`.
  ["  y = 1; print(1 2 3)\n", "", []],
  // After two properties.
  ["  y = 1; z = 2; print(1 2 3)\n", "", []],
  // A call nested in the call's arguments.
  ["  y = 1; print(f(1 2))\n", "", []],
  // A call in the property's value, and another after the `;` (comment
  // 6354736903 on I-1506).
  ["  y = print(1 2); print(3 4)\n", "", []],
  // A call left open, and one with `;` between its arguments.
  ["  y = 1; print(1, 2, 3\n", "", []],
  ["  y = 1; print(1; 2; 3)\n", "", []],
  // A call Luau reads, after a `;`, and a line below it.
  ["  y = 1; print(1)\n  z = 2\n", "", []],
  // A call after a `;`, with a method below it.
  ["  y = 1; print(1 2)\n", "  g()\n    return 1\n  end\n", ["g:method"]],
  // A call after a `;` on a line that block comments begin.
  ["  --[[c]] y = 1; print(1 2)\n", "", []],
  // Controls: a method header at the line's start, after block comments
  // that begin its line (comments are trivia), and a call line.
  ["", "  f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[[c]] f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[[a]] --[==[b]==] f(a)\n    x = a\n  end\n", ["f:method"]],
  // A comment of level four or more that holds a `]`, alone, holding a
  // shorter close, after a shorter comment, and before one.
  ["", "  --[====[a]b]====] f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[=====[a]====]b]=====] f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[[a]] --[====[a]b]====] f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[====[a]b]====] --[[c]] f()\n    x = 1\n  end\n", ["f:method"]],
  ["  print(1 2)\n  y = 2\n", "", ["print:call"]],
];

describe("a call after a `;` in a define body is a statement of the body (I-1506)", () => {
  for (const [statements, methods, readings] of FORMS) {
    const body = statements + methods;
    const text = `define X with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: the official parser's errors for the statements`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual(official(statements));
    });
    test(`${JSON.stringify(body)}: the define keeps its end`, () => {
      expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
    });
    test(`${JSON.stringify(body)}: the method reading`, () => {
      expect(methodReadings(text)).toEqual(readings);
    });
    test(`${JSON.stringify(body)}: engines agree`, async () => {
      const result = await compareEnginesFull(text);
      expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
    });
    test(`${JSON.stringify(body)}: an incremental compile reports what a cold one does`, () => {
      expectIncrementalEqualsCold(text);
    });
  }
  // A call after a `;` on the define's header line is a call too (its
  // errors, missing on that line, are another ticket's).
  test("a call after a `;` on the define's header line is no method", () => {
    const text = `define X with y = 1; print(1 2 3) end\n${STORY}`;
    expect(methodReadings(text)).toEqual([]);
    expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
  });
  test("the ticket's form reports Luau's three errors", () => {
    expect(official("  y = 1; print(1 2 3)\n").length, "the official parser reports the form").toBe(3);
  });
});

// [the define, the method readings]. A method written right after the
// define header's `with` opens as one at a line's start does, and reads as
// it does on main: a method, reporting nothing.
const HEADER_LINE_METHODS: [text: string, readings: string[]][] = [
  ["define X with f() return 1 end end\n", ["f:method"]],
  ["define X as Y with f(a) return a end end\n", ["f:method"]],
  ["define X with f() return 1 end\n  g()\n    return 2\n  end\nend\n", ["f:method", "g:method"]],
];

describe("a method on the define's header line reads as a method (I-1506)", () => {
  for (const [define, readings] of HEADER_LINE_METHODS) {
    const text = `${define}${STORY}`;
    test(`${JSON.stringify(define)}: reports nothing`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual([]);
    });
    test(`${JSON.stringify(define)}: the define keeps its end`, () => {
      expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
    });
    test(`${JSON.stringify(define)}: the method reading`, () => {
      expect(methodReadings(text)).toEqual(readings);
    });
    test(`${JSON.stringify(define)}: engines agree`, async () => {
      const result = await compareEnginesFull(text);
      expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
    });
    test(`${JSON.stringify(define)}: an incremental compile reports what a cold one does`, () => {
      expectIncrementalEqualsCold(text);
    });
  }
});
