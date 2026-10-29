import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold, methodReadings } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

const FUNCTION = "function ";

function methodFunctionErrors(method: string, line: number): string[] {
  const lines = `${"\n".repeat(line)}${method}`.split("\n");
  lines[line] = lines[line]!.replace(/^(\s*)/, `$1${FUNCTION}`);
  const shift = FUNCTION.length;
  return officialErrorList(lines.join("\n")).map((e) =>
    e.startsWith(`${line}:`)
      ? e
          .replace(new RegExp(`^${line}:(\\d+)-${line}:(\\d+)`), (_, a, b) => `${line}:${Number(a) - shift}-${line}:${Number(b) - shift}`)
          .replace(/at column (\d+)/, (_, c) => `at column ${Number(c) - shift}`)
      : e,
  );
}

const OPEN_METHODS: [before: string, method: string, after: string, readings: string[]][] = [
  ["", "  f()\n    if c then\n      x = 1\n  end\n", "", ["f:method"]],
  ["", "  f()\n    while c do\n      x = 1\n  end\n", "", ["f:method"]],
  ["", "  f(a)\n    for i = 1, a do\n      x = i\n  end\n", "", ["f:method"]],
  ["", "  f(a)\n    x = a\n", "", ["f:method"]],
  ["", '  greet(): string\n    return "hello"\n', "", ["greet:method"]],
  ["", "  f()\n    if c then\n    end\n", "  y = 2\n", ["f:method"]],
  ["  y = 2\n", "  f()\n    if c then\n  end\n", "  g()\n    return 1\n  end\n", ["f:method", "g:method"]],
  ['  name = "Orion"\n  print("x")\n', '  f()\n    if c then\n      return "HEY"\n  end\n', "", ["print:call", "f:method"]],
];

const CALLS: [body: string, readings: string[]][] = [
  ['  name = "Orion"\n  print("x")\n  t.a = 1\n', ["print:call"]],
  ["  print(1)\n", ["print:call"]],
  ['  print("x")\n', ["print:call"]],
  ["  print(x)\n  y = 2\n", ["print:call"]],
  ["  print()\n", ["print:call"]],
  ["  print(1) -- note\n  -- more\n", ["print:call"]],
  ["  print(1)\n\n  g()\n    return 1\n  end\n", ["print:call", "g:method"]],
  ["  print(1,\n    2)\n  y = 2\n", ["print:call"]],
  ['  print([[a\n    b]])\n  y = 2\n', ["print:call"]],
  ["  print(1) --[[ a\n    b ]]\n  y = 2\n", ["print:call"]],
];

const METHODS: [body: string, readings: string[]][] = [
  ["  f()\n    x = 1\n  end\n", ["f:method"]],
  ["  f(a, b)\n    if a then\n      return b\n    end\n  end\n", ["f:method"]],
  ["  f() return 1 end\n", ["f:method"]],
  ["  f()\n  end\n", ["f:method"]],
  ["  f()\n  -- note\n    x = 1\n  end\n", ["f:method"]],
  ["  f()\n\n    x = 1\n\n  end\n  y = 2\n", ["f:method"]],
  ["  f(): number\n    return 1\n  end\n", ["f:method"]],
  ["  f()\n    x = 1\n      end\n", ["f:method"]],
  ["f()\n  x = 1\nend\n", ["f:method"]],
  ['  fly()\nprint("x")\nself.y = 1\n  end\n', ["fly:method"]],
];

const STORY = "Hello.\n";

describe("a define's method left open reports Luau's error for its function (I-1402)", () => {
  for (const [before, method, after, readings] of OPEN_METHODS) {
    const body = before + method + after;
    const text = `define X with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: the method's function's errors, and no missing end`, () => {
      const official = methodFunctionErrors(method, before.split("\n").length);
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual([...official].sort());
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
});

test("an open method whose return type is missing reports Luau's messages for its function", () => {
  const method = "  f():\n    return 1\n";
  const text = `define X with\n${method}end\n${STORY}`;
  const message = (e: string) => e.replace(/^\S+ /, "");
  expect(errors(text).map(message)).toEqual(methodFunctionErrors(method, 1).sort().map(message));
  expect(methodReadings(text)).toEqual(["f:method"]);
});

describe("a call written as a line of a define body is a statement (I-1411)", () => {
  for (const [body, readings] of CALLS) {
    const text = `define foo as object with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: reports nothing`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual([]);
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
  test("a call Luau cannot read reports Luau's error for the statement", () => {
    const official = officialErrorList("\n  print(1 2)\n");
    expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(errors(`define foo as object with\n  print(1 2)\n  y = 2\nend\n${STORY}`)).toEqual(official);
  });
});

describe("a well-formed define's methods read as before", () => {
  for (const [body, readings] of METHODS) {
    const text = `define X with\n${body}end\n${STORY}`;
    test(`${JSON.stringify(body)}: reports nothing`, () => {
      expect(errors(text), stripAnsi(dumpTree(text))).toEqual([]);
    });
    test(`${JSON.stringify(body)}: the method reading`, () => {
      expect(methodReadings(text)).toEqual(readings);
    });
    test(`${JSON.stringify(body)}: engines agree`, async () => {
      const result = await compareEnginesFull(text);
      expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
    });
  }
});

describe("a define that is really unclosed keeps its missing end", () => {
  for (const body of ["  f()\n    x = 1\n  end\n", "  print(1)\n", "  x = 1\n"]) {
    const text = `define X with\n${body}`;
    test(`${JSON.stringify(body)}: reports the define's missing end alone`, () => {
      expect(errors(text).map((e) => e.replace(/^\S+ /, ""))).toEqual([
        expect.stringMatching(/^Define is missing its closing `end` keyword/),
      ]);
    });
  }
});
