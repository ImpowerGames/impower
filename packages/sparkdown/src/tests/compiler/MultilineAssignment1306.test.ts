import "../../inkjs/engine/Container";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story } from "../../inkjs/engine/Story";
import { ProgramStory } from "../../program/ProgramStory";
import { wrapConformanceSource } from "../luau-conformance/conformanceTestHarness";
import { applyUpstreamPatches } from "../luau-conformance/upstreamPatches";
import { conformanceLuau } from "./luauFixtures";
import { officialSyntaxErrors } from "./officialSyntax";

const URI = "inmemory:///main.sd";

function compile(text: string, programEngine = false) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ programChunks: programEngine, files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => ({ message: typeof d.message === "string" ? d.message : d.message.value, line: d.range.start.line, character: d.range.start.character }));
  return { errors, program };
}

function execute(text: string, programEngine = false) {
  const { errors, program } = compile(text, programEngine);
  expect(programEngine ? program.chunks != null : program.compiled != null, program.fallback?.construct).toBe(true);
  const story = programEngine ? new ProgramStory(program.chunks!) : new Story(program.compiled as Record<string, any>);
  const runtimeErrors: string[] = [];
  story.onError = (message) => runtimeErrors.push(message);
  return { errors, output: story.ContinueMaximally(), runtimeErrors };
}

describe.each([false, true])("next-line assignment on the program engine: %s (#1306)", (programEngine) => {
  test.each([
    ["original local", "function f()\n  local a =\n    1\n  return a\nend\n\n{f()}\n", "1\n"],
    ["original reassignment", "function f()\n  local a = 0\n  a =\n    1\n  return a\nend\n\n{f()}\n", "1\n"],
    ["original two locals", "function f()\n  local a, b =\n    1, 2\n  return b\nend\n\n{f()}\n", "2\n"],
    ["original table at column zero", "function f()\nlocal t =\n{\n  1\n}\nreturn t[1]\nend\n\n{f()}\n", "1\n"],
  ])("accepts and executes the %s input", (_name, source, output) => {
    const result = execute(source, programEngine);
    expect.soft(result.errors).toEqual([]);
    expect.soft(result.runtimeErrors).toEqual([]);
    expect(result.output).toBe(output);
  });

  test.each(["LF", "CRLF"])("executes all eight next-line calls in order exactly once (%s)", (ending) => {
    const source = `Value {f()}.
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
    const result = execute(ending === "CRLF" ? source.replaceAll("\n", "\r\n") : source, programEngine);
    expect.soft(result.errors).toEqual([]);
    expect.soft(result.runtimeErrors).toEqual([]);
    expect(result.output).toBe("Value 12345678:12345678:8.\n");
  });
});

test("accepts the complete original native_integer_spills input", () => {
  const original = readFileSync(new URL("../luau-conformance/upstream/conformance/native_integer_spills.luau", import.meta.url), "utf8");
  const source = applyUpstreamPatches("native_integer_spills.luau", original);
  expect(officialSyntaxErrors(conformanceLuau(source))).toEqual([]);
  expect(compile(wrapConformanceSource(source)).errors).toEqual([]);
}, 120_000);

describe.each(["LF", "CRLF"])("next-line missing-value boundaries (%s)", (ending) => {
  const lines = (text: string) => ending === "CRLF" ? text.replaceAll("\n", "\r\n") : text;
  test.each([
    ["end", "function f()\n  local x =\nend\n", "end"],
    ["else", "function f()\n  if true then\n    local x =\n  else\n    return 1\n  end\nend\n", "else"],
    ["until", "function f()\n  repeat\n    local x =\n  until true\nend\n", "until"],
    ["EOF", "function f()\n  local x =\n", "<eof>"],
  ])("rejects a missing value before %s", (_name, source, got) => {
    expect(officialSyntaxErrors(source).length).toBeGreaterThan(0);
    const errors = compile(lines(source)).errors.map((d) => d.message);
    const missing = errors.filter((message) => message.startsWith("Expected identifier when parsing expression"));
    expect(missing).toEqual([`Expected identifier when parsing expression, got ${got === "<eof>" ? got : `'${got}'`}`]);
  });

  test("a genuine new assignment does not hide an unfinished declaration", () => {
    const source = "function f()\n  local a =\n  a = 2\n  return a\nend\n";
    expect(officialSyntaxErrors(source).length).toBeGreaterThan(0);
    expect(compile(lines(source)).errors.length).toBeGreaterThan(0);
  });

  test.each([
    ["top-level prose", "store x = 0\n& x =\nStory follows.\n", "Story follows.\n"],
    ["value-looking story", "store x = 0\n& x =\n2\nStory follows.\n", "2\nStory follows.\n"],
    ["scene local", "-> one\nscene one\n  & local x =\n  Story follows.\nend\n", "Story follows.\n"],
  ])("preserves %s after an unfinished marked statement", (_name, source, output) => {
    const result = execute(lines(source));
    expect(result.errors.map((d) => d.message)).toEqual(["Expected identifier when parsing expression, got <eof>"]);
    expect(result.runtimeErrors).toEqual([]);
    expect(result.output).toBe(output);
  });

  test("a complete same-line marked assignment still executes", () => {
    expect(execute(lines("store x = 0\n& x = 2\nValue {x}.\n"))).toEqual({ errors: [], runtimeErrors: [], output: "Value 2.\n" });
  });
});
