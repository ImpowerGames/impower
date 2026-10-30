import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold, methodReadings } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

const official = (body: string) => officialErrorList(`do\n${body}end\n`).sort();

function nodeNames(text: string): string[] {
  const names: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do names.push(cursor.name);
  while (cursor.next());
  return names;
}

const STORY = "scene start\n  Hello.\nend\n";

const FORMS: [statements: string, methods: string, readings: string[]][] = [
  ["  y = 1; print(1 2 3)\n", "", []],
  ["  y = 1; z = 2; print(1 2 3)\n", "", []],
  ["  y = 1; print(f(1 2))\n", "", []],
  ["  y = print(1 2); print(3 4)\n", "", []],
  ["  y = 1; print(1, 2, 3\n", "", []],
  ["  y = 1; print(1; 2; 3)\n", "", []],
  ["  y = 1; print(1)\n  z = 2\n", "", []],
  ["  y = 1; print(1 2)\n", "  g()\n    return 1\n  end\n", ["g:method"]],
  ["  y = 1; --[[define Fake with --[[c]] print(1 2 3)\n", "", []],
  ["  --[[c]] y = 1; print(1 2)\n", "", []],
  ["", "  f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[[c]] f()\n    x = 1\n  end\n", ["f:method"]],
  ["", "  --[[a]] --[==[b]==] f(a)\n    x = a\n  end\n", ["f:method"]],
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
  for (const define of [
    "define X with y = 1; print(1 2 3) end\n",
    "define X with y = 1; z = with f() end\n",
    "define X with y = 1; z = with --[[c]] f() end\n",
    "define X with y = 1; z = with f(1 2 3) end\n",
  ]) {
    test(`${JSON.stringify(define)}: a call after a \`;\` on the define's header line is no method`, () => {
      const text = `${define}${STORY}`;
      expect(methodReadings(text)).toEqual([]);
      expect(nodeNames(text), stripAnsi(dumpTree(text))).toContain("LuauDefine_end");
    });
  }
  test("the ticket's form reports Luau's three errors", () => {
    expect(official("  y = 1; print(1 2 3)\n").length, "the official parser reports the form").toBe(3);
  });
});

const HEADER_LINE_METHODS: [text: string, readings: string[]][] = [
  ["define X with f() return 1 end end\n", ["f:method"]],
  ["define X as Y with f(a) return a end end\n", ["f:method"]],
  ["define X with --[[c]] f() return 1 end end\n", ["f:method"]],
  ["define X with --[====[a]b]====] f() return 1 end end\n", ["f:method"]],
  ["define X with f() return 1 end\n  g()\n    return 2\n  end\nend\n", ["f:method", "g:method"]],
  ["define --[[a]] X with f() return 1 end end\n", ["f:method"]],
  ["define X as Y as Z with f() return 1 end end\n", ["f:method"]],
  ["function outer() if true then define X with f() return 1 end end end end\n", ["f:method"]],
  ["function outer() define X with f() return 1 end end end\n", ["f:method"]],
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
