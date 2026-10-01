// A member access with nothing after its last `.` (`t.a.`) is a Luau syntax
// error. It is reported as Luau reports it, at the token Luau meets instead
// of the name (#1175), and the rest of the line's statement, the
// enclosing function and the story after it parse as if the name were there:
// the function still ends at its own `end`, and the story below it stays in the
// root flow.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

interface Found {
  message: string;
  severity: number | undefined;
  line: number | undefined;
  character: number | undefined;
}

function diagnostics(program: any): Found[] {
  const all: Found[] = [];
  for (const list of Object.values(program.diagnostics ?? {}) as any[]) {
    for (const d of list) {
      all.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        line: d.range?.start?.line,
        character: d.range?.start?.character,
      });
    }
  }
  return all;
}

// The ticket's script. Line 5 holds the dangling access.
const SCRIPT = `$:
  A QUIET ROOM

function f()
  local t = { a = { b = 7 } }
  local y = t.a.
  return y
end

BOB:
  Value {f()}.
`;

// Sparkdown's own error where Luau would read a name on a later line.
const NAME_ON_LATER_LINE =
  "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line";

/** Where Luau's parser reports its first error, which must have this message. */
function luauErrorAt(source: string, message: string): { line: number; character: number } {
  const error = parseLuau(source).errors[0];
  expect(error?.message).toBe(message);
  return { line: error!.location.begin.line, character: error!.location.begin.column };
}

describe("a dangling member access (#1079)", () => {
  it("is reported as an error at the token Luau meets instead of the name", () => {
    const errors = diagnostics(compile(SCRIPT)).filter((d) => d.severity === 1);
    expect(errors).toEqual([
      {
        message: "Expected identifier, got 'return'",
        severity: 1,
        line: 6,
        character: SCRIPT.split("\n")[6]!.indexOf("return"),
      },
    ]);
  });

  it("leaves the function ending at its own `end`", () => {
    const program = compile(SCRIPT);
    expect(program.pathLocations.functions).toEqual([
      { path: "f", lines: [0, 3, 7] },
    ]);
  });

  // Line 2 of each holds the dangling `.`; the function spans lines 0 to `end`.
  it.each([
    [
      "whitespace before the `.`",
      "function f()\n  local t = {}\n  local y = t.a .\n  return y\nend\n",
      "Expected identifier, got 'return'",
      4,
    ],
    [
      "a trailing comment",
      "function f()\n  local t = {}\n  local y = t.a. -- note\n  return y\nend\n",
      "Expected identifier, got 'return'",
      4,
    ],
    [
      "an operator after the `.`",
      "function f()\n  local t = { a = 1 }\n  return t.a. + 1\nend\n",
      "Expected identifier, got '+'",
      3,
    ],
    [
      "a call argument",
      "function f()\n  local t = {}\n  print(t.a.)\nend\n",
      "Expected identifier, got ')'",
      3,
    ],
    [
      "a same-line `then`",
      "function f(t)\n  local y = 0\n  if t.a. then\n    y = 1\n  end\n  return y\nend\n",
      "Expected identifier, got 'then'",
      6,
    ],
    [
      "a single name before the `.`",
      "function f()\n  local t = {}\n  local y = t.\n  return y\nend\n",
      "Expected identifier, got 'return'",
      4,
    ],
    [
      "a later call argument",
      "function f()\n  local t = {}\n  print(1, t.a.)\nend\n",
      "Expected identifier, got ')'",
      3,
    ],
    [
      "an arithmetic operand",
      "function f()\n  local t = {}\n  return 1 + t.\nend\n",
      "Expected identifier, got 'end'",
      3,
    ],
    [
      "the length operator",
      "function f()\n  local t = {}\n  return #t.a.\nend\n",
      "Expected identifier, got 'end'",
      3,
    ],
    [
      "a concatenation operand",
      "function f()\n  local t = {}\n  return \"x\" .. t.a.\nend\n",
      "Expected identifier, got 'end'",
      3,
    ],
    [
      "a reserved word after a same-line block comment",
      "function f(t)\n  local y = 0\n  y = t.a.--[[note]]return 1\nend\n",
      "Expected identifier, got 'return'",
      3,
    ],
    [
      "an operator between two block comments",
      "function f(t)\n  local y = 0\n  y = t.a.--[[one]] + --[[two]]b\n  return y\nend\n",
      "Expected identifier, got '+'",
      4,
    ],
    [
      "a block comment that runs onto the next line",
      "function f(t)\n  local y = 0\n  y = t.a.--[[ note\n  more ]]b\n  return y\nend\n",
      "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      5,
    ],
    [
      "a generic `for` loop's iterator",
      "function f(t)\n  local n = 0\n  for k in t.a. do\n  end\n  return n\nend\n",
      "Expected identifier, got 'do'",
      5,
    ],
    [
      "the name on the next line",
      "function f()\n  local t = {}\n  local y = t.a.\n    b\n  return y\nend\n",
      "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      5,
    ],
  ])("with %s is reported where Luau reports it", (_name, source, message, endLine) => {
    const program = compile(source);
    const errors = diagnostics(program).filter((d) => d.severity === 1);
    // Luau reports the token it meets instead of the name, at that token
    // (#1175). Where the name is on a later line, Luau reads it as the
    // member, and Sparkdown, whose access path ends with its line, reports
    // the `.`.
    const at =
      message === NAME_ON_LATER_LINE
        ? { line: 2, character: source.split("\n")[2]!.lastIndexOf(".") }
        : luauErrorAt(source, message);
    expect(errors).toEqual([{ message, severity: 1, ...at }]);
    expect(program.pathLocations.functions).toEqual([
      { path: "f", lines: [0, 0, endLine] },
    ]);
  });

  it("reports both of Luau's errors for a method name with a `.` after it", () => {
    // `t:a` is missing its call's arguments, and the `.` its name.
    const source = "function f()\n  local t = {}\n  local y = t:a.\n  return y\nend\n";
    const errors = diagnostics(compile(source)).filter((d) => d.severity === 1);
    expect(errors).toEqual([
      { message: "Expected '(', '{' or <string> when parsing function call, got '.'", severity: 1, line: 2, character: 12 },
      { message: "Expected identifier, got 'return'", severity: 1, line: 3, character: 2 },
    ]);
  });

  it("names <eof> when nothing follows the `.`", () => {
    const source = "function f()\n  local t = {}\n  return t.a.";
    const errors = diagnostics(compile(source)).filter((d) => d.severity === 1);
    expect(errors).toContainEqual({
      message: "Expected identifier, got <eof>",
      severity: 1,
      line: 2,
      character: source.split("\n")[2]!.length,
    });
  });

  it.each([
    ["spaced", 'return t.a .. "y"'],
    ["unspaced", 'return t.a.."y"'],
  ])("leaves %s concatenation alone", (_name, line) => {
    const source = `function f()\n  local t = { a = "x" }\n  ${line}\nend\n`;
    expect(diagnostics(compile(source))).toEqual([]);
  });

  // Luau skips a comment between the `.` and the name, so these read `t.a.b`.
  it.each([
    ["a block comment", "t.a.--[[note]]b"],
    ["a long-bracket block comment", "t.a.--[==[note]==]b"],
    ["two block comments", "t.a.--[[one]]--[[two]]b"],
  ])("leaves a name after %s on the same line alone", (_name, access) => {
    const source = `function f()\n  local t = { a = { b = 1 } }\n  return ${access}\nend\n`;
    const errors = diagnostics(compile(source)).filter((d) => d.severity === 1);
    expect(errors.filter((d) => d.message.startsWith("Expected identifier"))).toEqual([]);
  });

  // Luau reports a keyword after the `.` as the name it expected, and then
  // reads it as that name.
  it("reports a keyword right after the `.` as Luau does", () => {
    const source = "function f()\n  local t = { a = { b = 1 } }\n  return t.a.repeat\nend\n";
    const program = compile(source);
    expect(diagnostics(program).filter((d) => d.severity === 1)).toEqual([
      { message: "Expected identifier, got 'repeat'", severity: 1, ...luauErrorAt(source, "Expected identifier, got 'repeat'") },
    ]);
    expect(program.pathLocations.functions).toEqual([{ path: "f", lines: [0, 0, 3] }]);
  });

  // A function body is Luau (#1158), so a line of words there is a statement
  // Luau cannot read, reported as Luau reports it, and the function still
  // ends at its own `end`, so the story after it plays from the top.
  it.each([
    ["words at the start of a line in a function body", "function greet\n  Hello there.\n  Goodbye now.\nend\nAfter it.\n", 3],
    [
      "dotted words at the start of a line in a function body",
      "function greet\n  Hello Mr.Smith.\n  Visit example.com.\n  He moved to the U.S.\nend\nAfter it.\n",
      4,
    ],
    ["a line that is one dotted word in a function body", "function greet\n  U.S.\n  Next line.\nend\nAfter it.\n", 3],
  ])("reports %s where Luau does", (_name, source, endLine) => {
    const program = compile(source);
    const errors = diagnostics(program).filter((d) => d.severity === 1);
    // Luau's first error, which Luau reads as `function greet()`.
    const luau = source.replace("function greet\n", "function greet()\n").replace("After it.\n", "");
    const first = parseLuau(luau).errors[0]!;
    expect(errors).toContainEqual({
      message: first.message,
      severity: 1,
      line: first.location.begin.line,
      character: first.location.begin.column,
    });
    expect(program.pathLocations.functions).toEqual([{ path: "greet", lines: [0, 0, endLine] }]);
  });

  // A story line in story scope never reaches the access-path rules.
  it.each([
    [
      "a story line in a story `if` body",
      "store flag = false\n\n-> start\n\nscene start\n  if flag then\n    Went down the true side, and Tom.\n  end\nend\n",
    ],
    [
      "a story line in a scene",
      "-> start\n\nscene start\n  Hello there, friend. Made in China.\nend\n",
    ],
  ])("leaves the `.` of %s alone", (_name, source) => {
    const errors = diagnostics(compile(source)).filter((d) => d.severity === 1);
    expect(
      errors.filter((d) => d.message.startsWith("Expected identifier")),
    ).toEqual([]);
  });

  it("leaves the story after the function in the root flow", () => {
    const { paths, values } = compile(SCRIPT).pathLocations;
    const valueLine: string[] = paths.filter(
      (_: string, i: number) => values[i * 5 + 1] === 10,
    );
    expect(valueLine.length).toBeGreaterThan(0);
    expect(valueLine.filter((path) => path.startsWith("f."))).toEqual([]);
  });
});
