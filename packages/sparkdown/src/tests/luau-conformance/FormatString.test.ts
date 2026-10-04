import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { collectLuauLints } from "../../compiler/lint/collectLuauLints";
import { getParser } from "../compiler/grammarSnapshot";
import { diagnoseDetailed, lintMessagesInFunction } from "./diagnosticTestHarness";

describe("FormatString runtime acceptance adaptations", () => {
  test("accepted formats execute and produce no FormatString warning", () => {
    // UTC keeps the accepted %h result independent of the host timezone.
    const body = `
host_record(string.format("%*", 42))
host_record(os.date("!%h", 0))
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
    expect(recorded).toEqual(["42", "Jan", "\0", "q", ",", "q", ";", "b", "foo", 0]);
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

  test.each([
    ["call shorthand", 'Hi {{string.format("%")}}.\n'],
    ["Sparkle handler", 'layout main with\n button @click=string.format("%")\nend\n'],
    ["Sparkle closure body", 'layout main with\n button @click={ string.format("%") }\nend\n'],
    ["definition function value", 'define hero as character with\n callback = function() return string.format("%") end\nend\nHi.\n'],
    ["literal method", 'Hi {("%"):format()}.\n'],
    ["nested call", 'Hi {tostring(string.format("%"))}.\n'],
  ])("shared outside roots check %s once with original document offsets", (_label, source) => {
    const tree = getParser().parse(source);
    const read = (from: number, to: number) => source.slice(from, to);
    const first = collectLuauLints(tree, read);
    const cached = collectLuauLints(tree, read);
    const from = source.indexOf('"%"');
    const expected = [{ code: "FormatString", from, to: from + 3, message: "Invalid format string: unfinished format specifier" }];
    expect(first.lints.filter(d => d.code === "FormatString")).toEqual(expected);
    expect(cached.lints.filter(d => d.code === "FormatString")).toEqual(expected);
    expect(cached.roots === first.roots).toBe(true);
    expect(cached.names === first.names).toBe(true);
  });

  test("format traversal preserves cached name identities and keyword uncertainty", () => {
    const source = 'function inspect() local style = {}; setStyle(style); print(string.format("%")) end\n';
    const tree = getParser().parse(source);
    const read = (from: number, to: number) => source.slice(from, to);
    const first = collectLuauLints(tree, read);
    const cached = collectLuauLints(tree, read);
    expect(first.lints.filter(d => d.code === "FormatString")).toHaveLength(1);
    expect(first.names.declarations.filter(d => d.name === "style")).toHaveLength(1);
    expect(first.names.references.some(d => d.name === "style")).toBe(false);
    expect(first.names.uncertainNames).toEqual([{ name: "style", from: source.lastIndexOf("style"), to: source.lastIndexOf("style") + 5, reason: "grammar-keyword" }]);
    expect(cached.names === first.names).toBe(true);
    expect(cached.names.uncertainNames === first.names.uncertainNames).toBe(true);
    expect(cached.roots === first.roots).toBe(true);
  });
});
