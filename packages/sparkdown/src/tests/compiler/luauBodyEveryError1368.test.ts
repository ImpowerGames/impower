import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

const FORMS = [
  "local t = {1 2}",
  "x = {1, 2 3 4}",
  "x = foo(",
  "local a = (1 + ",
  "x = (if c)then",
  "local x: = 1",
  "local t = { a = 1 b = 2 }",
  "local function g(a: number b) end",
  "while nil:do end",
  "local function g(a :: number) end",
  "local function g(:: number) end",
  "local function g(a, : number) end",
  "return 1 2",
];

describe("a define's method reports every error Luau reports for its body (I-1368)", () => {
  for (const line of FORMS) {
    const official = officialErrorList(`\n  function f()\n    ${line}\n  end\n`).sort();
    test(`${JSON.stringify(line)} in a method`, () => {
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define X with\n  f()\n    ${line}\n  end\nend\n`)).toEqual(official);
    });
    test(`${JSON.stringify(line)} in a method spelled as a function`, () => {
      expect(sparkdownErrors(`define X with\n  function f()\n    ${line}\n  end\nend\n`)).toEqual(official);
    });
  }

  for (const line of ['local s = "abc', "local s = `a {"]) {
    test(`${JSON.stringify(line)} is reported once`, () => {
      const errors = sparkdownErrors(`define X with\n  f()\n    ${line}\n  end\nend\n`);
      expect(errors.length, errors.join("\n")).toBe(1);
    });
  }
});

describe("a Sparkle handler's closure reports every error Luau reports for its body (I-1368)", () => {
  for (const line of ["local t = {1 2}", "x = {1, 2 3 4}", "local x: = 1", "local t = { a = 1 b = 2 }", "print(1 2)", "while nil:do end", "local g = function(a :: number) end", "local g = function(:: number) end"]) {
    test(JSON.stringify(line), () => {
      const official = officialErrorList(`local _ = function()\n    ${line}\nend\n`)
        .map((e) => e.replace(/^1:(\d+)-1:(\d+)/, "2:$1-2:$2"))
        .sort();
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`layout main with\n  button @click={\n    ${line}\n  }\nend\n`)).toEqual(official);
    });
  }

  test('"return 1 2" in a closure', () => {
    expect(sparkdownErrors(`layout main with\n  button @click={\n    return 1 2\n  }\nend\n`)).toEqual([
      "2:13-2:14 Expected 'end' (to close 'function' at line 2), got '2'",
    ]);
  });

  test('"local s = \\"abc" in a closure is reported once', () => {
    const errors = sparkdownErrors('layout main with\n  button @click={ local s = "abc }\nend\n');
    expect(errors.filter((e) => e.endsWith("Malformed string; did you forget to finish it?")), errors.join("\n")).toHaveLength(1);
  });

  const closure = (body: string) =>
    `store a, g, x = 0, 0, 0\nlayout form with\n  button "Go" @click={\n    ${body}\n  }\nend\n`;
  const LAYOUT_OPEN =
    "1:0-1:16 This layout is missing its closing `end` keyword. Without it, every line up to the next `scene`, `branch` or the end of the file is read as part of this layout.";
  const HANDLER_OPEN = "2:21-2:22 This handler is missing its closing `}`.";
  const MISSING_AT_BRACE = "4:2-4:3 Expected identifier when parsing expression, got '}'";
  test.each([
    ["a, g = 1,", [MISSING_AT_BRACE]],
    ["local a = (1 +", [MISSING_AT_BRACE]],
    ["x += ", [MISSING_AT_BRACE]],
    ["x = foo(", [MISSING_AT_BRACE]],
    ["local x = foo[", [MISSING_AT_BRACE]],
    ["local x:", ["3:12-4:0 Expected type, got '}'"]],
    ["local x = if c then 1", ["4:2-4:3 Expected 'else' when parsing if then else expression, got '}'"]],
    ["a:", ["3:4-4:3 Expected '(', '{' or <string> when parsing function call, got '}'", "4:2-4:3 Expected identifier when parsing method name, got '}'"]],
    ["a.b.", ["3:4-4:2 Incomplete statement: expected assignment or a function call", "4:2-4:3 Expected identifier, got '}'"]],
    ["x = (if c)then", ["3:13-3:14 Expected 'then' when parsing if then else expression, got ')'", MISSING_AT_BRACE]],
    ['local s = "abc', ["3:14-3:18 Malformed string; did you forget to finish it?"]],
    ["if c then x = 1", [LAYOUT_OPEN, HANDLER_OPEN, "4:2-4:3 Expected identifier when parsing expression, got '}'"]],
    ["while true do", [LAYOUT_OPEN, HANDLER_OPEN, "4:2-4:3 Expected identifier when parsing expression, got '}'"]],
  ])("%j at the closure's `}` is reported once", (body, expected) => {
    expect(sparkdownErrors(closure(body))).toEqual(expected);
  });

  test('"a:" on the closure\'s line names only the `}`', () => {
    expect(sparkdownErrors(`layout main with\n  button @click={ a: }\nend\n`)).toEqual([
      "1:21-1:22 Expected identifier when parsing method name, got '}'",
    ]);
  });
});

describe("an alternator's arm in these bodies is reported as in a function (I-1368)", () => {
  const ARM = "local t = cycle 0 | (1 +) end";
  const MISSING = "Expected identifier when parsing expression, got ')'";
  test("the function control", () => {
    expect(sparkdownErrors(`function f()\n    ${ARM}\nend\n`)).toEqual([`1:28-1:29 ${MISSING}`]);
  });
  for (const header of ["f()", "function f()"]) {
    test(`a method spelled ${header}`, () => {
      expect(sparkdownErrors(`define X with\n  ${header}\n    ${ARM}\n  end\nend\n`)).toEqual([`2:28-2:29 ${MISSING}`]);
    });
  }
  test("a handler closure", () => {
    expect(sparkdownErrors(`layout main with\n  button @click={\n    ${ARM}\n  }\nend\n`)).toEqual([`2:28-2:29 ${MISSING}`]);
  });
});

describe("a method left open is ranged as a function is (I-1368)", () => {
  for (const header of ["f()", "function f()"]) {
    test(header, () => {
      expect(sparkdownErrors(`define X with\n  ${header}\n    while true\n  end\nend\n`)).toEqual([
        "3:2-3:5 Expected 'do' when parsing while loop, got 'end'",
        "3:5-4:0 Expected 'end' (to close 'function' at line 2), got <eof>",
      ]);
    });
  }
});
