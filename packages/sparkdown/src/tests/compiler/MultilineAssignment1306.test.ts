import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story } from "../../inkjs/engine/Story";
import { ProgramStory } from "../../program/ProgramStory";
import { officialSyntaxErrors } from "./officialSyntax";

// A Luau declaration or reassignment whose `=` ends its line takes its value
// from the next line, as Luau does (#1306), including a value list whose
// lines end with commas, which the tree reads as an assignment's targets.

const URI = "inmemory:///main.sd";

const crlf = (text: string) => text.replaceAll("\n", "\r\n");

function compile(text: string, programEngine = false) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ programChunks: programEngine, files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => ({ message: typeof d.message === "string" ? d.message : d.message.value, line: d.range.start.line, column: d.range.start.character }));
  return { errors, program };
}

function execute(text: string, programEngine = false) {
  const { errors, program } = compile(text, programEngine);
  expect(programEngine ? program.chunks != null : program.compiled != null, program.fallback?.construct).toBe(true);
  const story = programEngine ? new ProgramStory(program.chunks!) : new Story(program.compiled as Record<string, any>);
  const runtimeErrors: string[] = [];
  story.onError = (message: string) => runtimeErrors.push(message);
  return { errors, output: story.ContinueMaximally(), runtimeErrors };
}

// The official parser's errors as the compiler reports them (0-based lines).
function officialErrors(text: string) {
  return officialSyntaxErrors(text).map((e) => ({ message: e.message, line: e.location.begin.line, column: e.location.begin.column }));
}

const EIGHT_CALLS = `Value {f()}.
function f()
  local calls = 0
  local order = ""
  local function read(value)
    calls += 1
    order ..= tostring(value)
    return value
  end
  local x0, x1, x2, x3, x4, x5, x6, x7 =
    read(1),
    read(2),
    read(3),
    read(4),
    read(5),
    read(6),
    read(7),
    read(8)
  return tostring(x0) .. tostring(x1) .. tostring(x2) .. tostring(x3) .. tostring(x4) .. tostring(x5) .. tostring(x6) .. tostring(x7) .. ":" .. order .. ":" .. tostring(calls)
end
`;

describe.each([false, true])("next-line values on the program engine: %s", (programEngine) => {
  test.each([
    ["a local", "function f()\n  local a =\n    1\n  return a\nend\n\n{f()}\n", "1\n"],
    ["a reassignment", "function f()\n  local a = 0\n  a =\n    1\n  return a\nend\n\n{f()}\n", "1\n"],
    ["two locals", "function f()\n  local a, b =\n    1, 2\n  return b\nend\n\n{f()}\n", "2\n"],
    ["a table at column zero", "function f()\nlocal t =\n{\n  1\n}\nreturn t[1]\nend\n\n{f()}\n", "1\n"],
    ["names on comma-ended lines", "function f()\n  local x, y = 1, 2\n  local a, b =\n    y,\n    x\n  return a .. b\nend\n\n{f()}\n", "21\n"],
    ["a reassignment of comma-ended lines", "function f()\n  local a, b = 0, 0\n  a, b =\n    tostring(3),\n    tostring(4)\n  return a .. b\nend\n\n{f()}\n", "34\n"],
    ["comma-ended lines after a comment ending in then", "function f()\n  local x, y = -- then\n    tostring(1),\n    tostring(2)\n  return x .. y\nend\n\n{f()}\n", "12\n"],
    ["comma-ended lines after a comment ending in else", "function f()\n  local x, y = -- else\n    tostring(1),\n    tostring(2)\n  return x .. y\nend\n\n{f()}\n", "12\n"],
  ])("reads %s", (_name, source, output) => {
    for (const text of [source, crlf(source)]) {
      expect(execute(text, programEngine)).toEqual({ errors: [], runtimeErrors: [], output });
    }
  });

  test.each(["LF", "CRLF"])("calls all eight next-line values in order exactly once (%s)", (ending) => {
    const result = execute(ending === "CRLF" ? crlf(EIGHT_CALLS) : EIGHT_CALLS, programEngine);
    expect(result).toEqual({ errors: [], runtimeErrors: [], output: "Value 12345678:12345678:8.\n" });
  });
});

describe.each(["LF", "CRLF"])("Luau's errors after a line-ending operator (%s)", (ending) => {
  const lines = (text: string) => (ending === "CRLF" ? crlf(text) : text);
  test.each([
    ["before end", "function f()\n  local x =\nend\n"],
    ["before else", "function f()\n  if true then\n    local x =\n  else\n    return 1\n  end\nend\n"],
    ["before until", "function f()\n  repeat\n    local x =\n  until true\nend\n"],
    ["after a comma-ended line before end", "function f()\n  local a, b =\n    x,\nend\n"],
    ["at a second operator on the next line", "function f()\n  local a = 0\n  a =\n    b = 2\n  return a\nend\n"],
    ["after an empty else arm", "function f()\n  local a = if true then 1 else\n  b = 2\n  return a\nend\n"],
  ])("reports the official parser's error %s", (_name, source) => {
    const official = officialErrors(source);
    expect(official).toHaveLength(1);
    expect(compile(lines(source)).errors).toEqual(official);
  });

  // The unclosed function is reported too, so only the missing value is compared.
  test("reports a value missing at the end of the file", () => {
    const source = "function f()\n  local x =\n";
    expect(officialSyntaxErrors(source).length).toBeGreaterThan(0);
    expect(compile(lines(source)).errors.map((e) => e.message)).toContain("Expected identifier when parsing expression, got <eof>");
  });

  // A comment after `else` is skipped as Luau skips it: the arm reads the
  // next line's `b` and the error falls on its `=` with Luau's wording (#1432).
  test("reports an else arm with a comment after it at the next assignment's `=`", () => {
    const source = "function f()\n  local a = if true then 1 else -- note\n  b = 2\n  return a\nend\n";
    expect(compile(lines(source)).errors).toEqual(officialErrors(source));
  });

  // An empty then arm reads the next line's `b` as its value, as Luau does,
  // so the missing `else` falls on the `=` after it with Luau's wording (#1501).
  test.each(["if true then", "if (true)then", "if true then -- note"])(
    "reports the missing else of an empty then arm (%s) at the next assignment's `=`",
    (opening) => {
      const source = `function f()\n  local a = ${opening}\n  b = 2\n  return a\nend\n`;
      expect(officialSyntaxErrors(source)).toHaveLength(1);
      expect(compile(lines(source)).errors).toEqual(officialErrors(source));
    },
  );
});

describe.each(["LF", "CRLF"])("story after an unfinished marked statement (%s)", (ending) => {
  const lines = (text: string) => (ending === "CRLF" ? crlf(text) : text);
  test.each([
    ["prose", "store x = 0\n& x =\nStory follows.\n", 1, "Story follows.\n"],
    ["a value-looking line", "store x = 0\n& x =\n2\nStory follows.\n", 1, "2\nStory follows.\n"],
    ["comma-ended prose", "store x = 0\n& x =\nWell, then,\nStory follows.\n", 1, "Well, then,\nStory follows.\n"],
    ["a reassignment", "store x = 0\nstore y = 0\n& x =\ny, x = 1, 2\nValue {x}{y}.\n", 2, "Value 21.\n"],
    ["a scene's prose", "-> one\nscene one\n  & local x =\n  Story follows.\nend\n", 2, "Story follows.\n"],
    ["a scene's comma-ended prose", "-> one\nscene one\n  & local x =\n  a, b,\n  Story follows.\nend\n", 2, "a, b,\nStory follows.\n"],
  ])("keeps %s out of the value", (_name, source, line, output) => {
    const result = execute(lines(source));
    expect(result.errors.map((e) => [e.message, e.line])).toEqual([["Expected identifier when parsing expression, got <eof>", line]]);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.output).toBe(output);
  });

  test("runs a complete marked assignment", () => {
    expect(execute(lines("store x = 0\n& x = 2\nValue {x}.\n"))).toEqual({ errors: [], runtimeErrors: [], output: "Value 2.\n" });
  });
});
