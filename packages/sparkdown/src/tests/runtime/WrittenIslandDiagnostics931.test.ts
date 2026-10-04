import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { parseOfficialTree } from "../compiler/officialAstTestUtils";
import { parseSource } from "../compiler/grammarSnapshot";
import { treeScopeStackAt } from "../compiler/scopeEquality";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const syntaxErrorCode = "SyntaxError";
const message = (d: { message: unknown }) => typeof d.message === "string" ? d.message : (d.message as { value: string }).value;
function publishedErrors(text: string) {
  const uri = "inmemory:///written-island.sd";
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return (compiler.compile({ textDocument: { uri } }).program.diagnostics?.[uri] ?? []).filter(d => d.severity === 1);
}
const syntaxErrors = (text: string) => publishedErrors(text).filter(d => d.code === syntaxErrorCode);

describe("written island syntax diagnostics own authored tokens", () => {
  test.each(["file", "scene", "branch"])("missing method name owns %s EOF before prose and another mark", scope => {
    const prefix = scope === "file" ? "" : scope === "scene" ? "scene a\n" : "scene a\nbranch b\n";
    const suffix = scope === "file" ? "" : scope === "scene" ? "end\n" : "end\nend\n";
    const body = "local n = t:";
    const island = `& ${body}`;
    const native = parseOfficialTree(`  ${body}`).errors[0]!;
    expect(native.message).toContain("when parsing method name, got <eof>");
    const source = `${prefix}${island}\nThe village waits.\n& math.abs(5)\n${suffix}`;
    const published = syntaxErrors(source);
    expect(published.map(message)).toEqual([native.message]);
    expect(published[0]!.range.start).toEqual({ line: prefix.split("\n").length - 1, character: island.length });
    // Published EOF ranges include the line break, never the following word.
    expect(published[0]!.range.end).toEqual({ line: prefix.split("\n").length, character: 0 });
    expect(publishedErrors(source).every(d => d.range.start.line <= prefix.split("\n").length - 1)).toBe(true);
    expect(treeScopeStackAt(parseSource(source), source.indexOf("The village"))).toContain("string.display.text.chunk.sd");
  });

  test.each([
    "do local n = (1 end",
    "do local n = math.abs(1 end",
    "do local n = t[1 end",
    "do local n = {1 end",
    "do local n = (1; end",
    "do local n = math.abs(1; end",
    "do local n = t[1; end",
  ])("missing punctuation closer in %s has the native written-token diagnostic", body => {
    const native = parseOfficialTree(`  ${body}`).errors[0]!;
    expect(native.message).toMatch(/^Expected ['"].*[)\]}]/);
    const source = `& ${body}\nThe village waits.\n& math.abs(5)\n`;
    const published = syntaxErrors(source);
    expect(published.map(message)).toContain(native.message);
    const diagnostic = published.find(d => message(d) === native.message)!;
    expect(diagnostic.range.start).toEqual({ line: native.location.begin.line, character: native.location.begin.column });
    expect(diagnostic.range.end).toEqual({ line: native.location.end.line, character: native.location.end.column });
    expect(published.every(d => d.range.start.line === 0)).toBe(true);
    expect(treeScopeStackAt(parseSource(source), source.indexOf("The village"))).toContain("string.display.text.chunk.sd");
  });

  test.each([
    "do local n = (1) end",
    "do local n = math.abs(1) end",
    "do local n = t[1] end",
    "do local n = {1} end",
  ])("complete punctuation control %s has zero syntax diagnostics", body => {
    expect(parseOfficialTree(`  ${body}`).errors).toEqual([]);
    expect(syntaxErrors(`& ${body}\nThe village waits.\n`)).toEqual([]);
  });

  test.each([
    "do if true then else elseif false then end end",
    "do do if false then else elseif true then end end end",
    "do if true then else else end end",
    "do do if false then else else end end end",
  ])("misplaced branch after else in %s has one native owner", body => {
    const native = parseOfficialTree(`  ${body}`).errors;
    expect(native).toHaveLength(1);
    expect(native[0]!.message).toMatch(/got '(else|elseif)'/);
    const source = `& ${body}\nThe village waits.\n`;
    const published = syntaxErrors(source);
    expect(published.map(message)).toEqual(native.map(d => d.message));
    expect(published[0]!.range.start).toEqual({ line: 0, character: native[0]!.location.begin.column });
    expect(published[0]!.range.end).toEqual({ line: 0, character: native[0]!.location.end.column });
  });

  test.each([[true, 1], [false, 5]])("else if remains a valid nested if with outer condition %s", (condition, value) => {
    const body = `do if ${condition} then x = 1 else if true then x = 5 end end end`;
    expect(parseOfficialTree(`  ${body}`).errors).toEqual([]);
    const source = `store x = 0\n& ${body}\nThe village waits.\nValue {x}.\ndone\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(`The village waits.\nValue ${value}.\n`);
  });

  test.each([
    "function f(t)\n return t:\n method()\nend\n",
    "& local f = function(t)\n return t:\n method()\nend\n",
  ])("genuine function retains multiline method-name ownership: %s", source => {
    const native = source.startsWith("&") ? ` ${source.slice(1)}` : source;
    expect(parseOfficialTree(native).errors).toEqual([]);
    expect(syntaxErrors(source)).toEqual([]);
  });

  test.each([
    "for i: = 1, 3 do end",
    "for i:= 1, 3 do end",
    "for i: --[[c]] = 1, 3 do end",
    "for k: , v in pairs({}) do end",
    "for k, v: , w in pairs({}) do end",
  ])("bounded for-variable annotation is a missing type, never a method name: %s", body => {
    const native = parseOfficialTree(`  do ${body} end`).errors[0]!;
    expect(native.message).toContain("Expected type");
    const source = `& do ${body} end\nThe village waits.\n`;
    const published = syntaxErrors(source);
    expect(published.map(message)).toContain(native.message);
    expect(publishedErrors(source).map(message).some(m => m.includes("method name"))).toBe(false);
  });

  test("missing then keeps its existing single keyword diagnostic owner", () => {
    const uri = "inmemory:///keyword.sd";
    const text = "& local x = if true\nthen 1\n";
    const compiler = testCompiler();
    compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
    const published = (compiler.compile({ textDocument: { uri } }).program.diagnostics?.[uri] ?? []).filter(d => d.severity === 1);
    expect(published.map(message).filter(m => m.includes("Expected 'then'") || m.includes("missing `then`"))).toHaveLength(1);
  });
});
