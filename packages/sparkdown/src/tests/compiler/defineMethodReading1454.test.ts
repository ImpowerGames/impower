// A `define` body tells a method's header from a call written as a line of
// the body, and a method its body leaves open reports what Luau reports for
// the function it stands for (I-1454). A method holds the lines indented
// below its header and takes an `end` at the header's indentation or deeper;
// the define keeps an `end` written left of the header, so an `if` the
// method's `end` closes leaves the method open, with Luau's error for its
// function and no missing `end` for a define that has one (I-1402). A
// `name(...)` line that holds no line below it and takes no `end` is a call,
// a statement of the body, which reports nothing (I-1411). Both TextMate
// engines read each form alike, and an incremental compile reports what a
// cold one does.
import { describe, expect, test } from "vitest";
import { errors, expectIncrementalEqualsCold, methodReadings } from "./defineReadings";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

const FUNCTION = "function ";

/**
 * The official errors of the function a define's method stands for: the
 * method's lines, from its header on line `line`, with `function ` written
 * before the header, placed where the author wrote the header without it
 * (each character and the column a message names on that line move back by
 * its length).
 */
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

// [the members before the method, the method, the members after it, the
// method readings]. They stand between `define X with` and the define's own
// `end`, which a story line follows; the method's function is the method's
// own lines.
const OPEN_METHODS: [before: string, method: string, after: string, readings: string[]][] = [
  // The ticket's form (I-1402): the method's `end` closes the `if`.
  ["", "  f()\n    if c then\n      x = 1\n  end\n", "", ["f:method"]],
  ["", "  f()\n    while c do\n      x = 1\n  end\n", "", ["f:method"]],
  ["", "  f(a)\n    for i = 1, a do\n      x = i\n  end\n", "", ["f:method"]],
  // A method with no `end` at all.
  ["", "  f(a)\n    x = a\n", "", ["f:method"]],
  // A return type takes the header's line break in: the line below is still
  // the method's body.
  ["", '  greet(): string\n    return "hello"\n', "", ["greet:method"]],
  // An open method before a member: the member's line ends it.
  ["", "  f()\n    if c then\n    end\n", "  y = 2\n", ["f:method"]],
  ["  y = 2\n", "  f()\n    if c then\n  end\n", "  g()\n    return 1\n  end\n", ["f:method", "g:method"]],
  // An open method after a call line: the call is its line alone.
  ['  name = "Orion"\n  print("x")\n', '  f()\n    if c then\n      return "HEY"\n  end\n', "", ["print:call", "f:method"]],
];

// Bodies with a call written as a line (the ticket's three, I-1411, and
// more), which report nothing.
const CALLS: [body: string, readings: string[]][] = [
  ['  name = "Orion"\n  print("x")\n  t.a = 1\n', ["print:call"]],
  ["  print(1)\n", ["print:call"]],
  ['  print("x")\n', ["print:call"]],
  ["  print(x)\n  y = 2\n", ["print:call"]],
  ["  print()\n", ["print:call"]],
  ["  print(1) -- note\n  -- more\n", ["print:call"]],
  ["  print(1)\n\n  g()\n    return 1\n  end\n", ["print:call", "g:method"]],
  // Arguments that go on at the next line are still the call's.
  ["  print(1,\n    2)\n  y = 2\n", ["print:call"]],
  ['  print([[a\n    b]])\n  y = 2\n', ["print:call"]],
  // A block comment that goes on at the next line is no body.
  ["  print(1) --[[ a\n    b ]]\n  y = 2\n", ["print:call"]],
];

// Well-formed methods, which read as before.
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
  // A body written less indented than its header is still the method's,
  // which the formatter indents (fixture format/luau/define-methods).
  ['  fly()\nprint("x")\nself.y = 1\n  end\n', ["fly:method"]],
];

const STORY = "scene start\n  Hello.\nend\n";

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

// A return type's missing type takes the header's line break in too. The
// missing type's range ends with the operator's line, as I-1453 decided, so
// the messages are Luau's and the method's body is still its own.
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
    const text = `define X with\n${body}${STORY}`;
    test(`${JSON.stringify(body)}: reports the define's missing end alone`, () => {
      expect(errors(text).map((e) => e.replace(/^\S+ /, ""))).toEqual([
        expect.stringMatching(/^Define is missing its closing `end` keyword/),
      ]);
    });
  }
});
