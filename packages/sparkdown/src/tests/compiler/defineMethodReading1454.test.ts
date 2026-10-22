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
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { isDefineMethodCall } from "../../compiler/utils/defineMethodCall";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

/** Every error, as `start-end message` in 0-based lines and characters, sorted. */
function errorsOf(compiler: SparkdownCompiler): string[] {
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error)
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

const errors = (text: string) => errorsOf(newCompiler(text));

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "    "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(errorsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(errorsOf(newCompiler(edited)));
  }
}

/** The `LuauMethodDefinition` nodes of `text`, each as `name:method` or `name:call`. */
function methodReadings(text: string): string[] {
  const readings: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  do {
    if (cursor.name !== "LuauMethodDefinition") continue;
    const node: SyntaxNode = cursor.node;
    const name = node.getChild("LuauMethodDefinition_begin");
    const header = text.slice(name?.from ?? node.from, name?.to ?? node.from).trim();
    readings.push(`${header}:${isDefineMethodCall(node, (pos) => text.slice(0, pos).split("\n").length - 1) ? "call" : "method"}`);
  } while (cursor.next());
  return readings;
}

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
    const text = `define X with\n${body}`;
    test(`${JSON.stringify(body)}: reports the define's missing end alone`, () => {
      expect(errors(text).map((e) => e.replace(/^\S+ /, ""))).toEqual([
        expect.stringMatching(/^Define is missing its closing `end` keyword/),
      ]);
    });
  }
});
