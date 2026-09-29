// A member access with nothing after its last `.` (`t.a.`) is a Luau syntax
// error. It is reported at the `.`, and the rest of the line's statement, the
// enclosing function and the story after it parse as if the name were there:
// the function still ends at its own `end`, and the story below it stays in the
// root flow.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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

describe("a dangling member access (#1079)", () => {
  it("is reported as an error at the `.`", () => {
    const errors = diagnostics(compile(SCRIPT)).filter((d) => d.severity === 1);
    expect(errors).toEqual([
      {
        message: "Expected identifier, got 'return'",
        severity: 1,
        line: 5,
        character: SCRIPT.split("\n")[5]!.lastIndexOf("."),
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
      "the name on the next line",
      "function f()\n  local t = {}\n  local y = t.a.\n    b\n  return y\nend\n",
      "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      5,
    ],
  ])("with %s is reported at the `.`", (_name, source, message, endLine) => {
    const program = compile(source);
    const errors = diagnostics(program).filter((d) => d.severity === 1);
    expect(errors).toEqual([
      {
        message,
        severity: 1,
        line: 2,
        character: source.split("\n")[2]!.lastIndexOf("."),
      },
    ]);
    expect(program.pathLocations.functions).toEqual([
      { path: "f", lines: [0, 0, endLine] },
    ]);
  });

  it("names <eof> when nothing follows the `.`", () => {
    const source = "function f()\n  local t = {}\n  return t.a.";
    const errors = diagnostics(compile(source)).filter((d) => d.severity === 1);
    expect(errors).toContainEqual({
      message: "Expected identifier, got <eof>",
      severity: 1,
      line: 2,
      character: source.split("\n")[2]!.lastIndexOf("."),
    });
  });

  it.each([
    ["spaced", 'return t.a .. "y"'],
    ["unspaced", 'return t.a.."y"'],
  ])("leaves %s concatenation alone", (_name, line) => {
    const source = `function f()\n  local t = { a = "x" }\n  ${line}\nend\n`;
    expect(diagnostics(compile(source))).toEqual([]);
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
