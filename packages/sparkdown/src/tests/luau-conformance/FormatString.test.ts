import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { diagnoseDetailed, lintMessagesInFunction } from "./diagnosticTestHarness";

describe("FormatString runtime acceptance adaptations", () => {
  test("accepted formats execute and produce no FormatString warning", () => {
    const body = `
host_record(string.format("%*", 42))
host_record(os.date("%h", 0))
host_record(os.date("\\0", 0))
host_record(string.match("q", "%q"))
host_record(string.match(",", "%,"))
host_record(string.match("q", "[%q]"))
host_record(string.match(";", "[%;]"))
host_record(string.match("b", "[%a-b]"))
host_record(string.gsub("foo", "foo", "%1"))
host_record(string.packsize("Xi"))
`;
    const source = `external host_record(v)\n& run()\ndone\nfunction run()\n${body}\nend\n`;
    const compiler = testCompiler();
    compiler.configure({ files: [{ uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] });
    const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
    expect(Object.values(result.program.diagnostics ?? {}).flat().filter(d => d.code === "FormatString")).toEqual([]);
    expect(result.program.compiled).toBeTruthy();
    const story = testStory(result.program.compiled as Record<string, any>);
    const errors: string[] = [];
    const recorded: unknown[] = [];
    story.onError = (m: string) => errors.push(m);
    story.BindExternalFunction("host_record", (v: unknown) => { recorded.push(v); return v; });
    story.ContinueMaximally();
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["42", "Dec", "\0", "q", ",", "q", ";", "b", "foo", 0]);
  });
});

describe("FormatString literal call selection", () => {
  test("dynamic, grouped and shadowed library arguments stay silent", () => {
    expect(lintMessagesInFunction(`
local fmt = "%"
string.format(fmt)
string.format(("%"))
string["format"]("%")
local string = {format = function(...) return ... end}
string.format("%")
local os = {date = function(...) return ... end}
os.date("%")
`)).toEqual([]);
  });

  test("literal string methods are checked but unknown receivers are not", () => {
    expect(lintMessagesInFunction(`
local s = ...
s:format()
s:match("%")
local _first = ("%"):format()
local _second = ("foo"):match("%")
`)).toEqual([
      "Invalid format string: unfinished format specifier",
      "Invalid match pattern: unfinished character class",
    ]);
  });

  test("replacement syntax is checked when the pattern is dynamic or invalid", () => {
    expect(lintMessagesInFunction(`
local pattern = ...
string.gsub("foo", pattern, "%x")
string.gsub("foo", pattern, "%9")
string.gsub("foo", "%", "%")
string.gsub("foo", "%")
`)).toEqual([
      "Invalid match replacement: unexpected replacement character; must be a digit or %",
      "Invalid match pattern: unfinished character class",
      "Invalid match replacement: unfinished replacement",
    ]);
  });

  test("warnings highlight literals and use Warning severity outside functions", () => {
    const source = '& string.format("%")\ndone\n';
    expect(diagnoseDetailed(source).filter(d => d.code === "FormatString")).toEqual([{
      file: "main.sd", code: "FormatString", severity: 2,
      message: "Invalid format string: unfinished format specifier",
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 19 } },
    }]);
  });

  test("calls inside narrative interpolations are checked once", () => {
    const source = 'Hello {string.format("%")}.\ndone\n';
    expect(diagnoseDetailed(source).filter(d => d.code === "FormatString").map(d => d.message)).toEqual([
      "Invalid format string: unfinished format specifier",
    ]);
  });
});
