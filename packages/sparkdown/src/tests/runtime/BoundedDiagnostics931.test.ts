import { describe, expect, test, vi } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { parseOfficialTree } from "../compiler/officialAstTestUtils";
import { parseSource } from "../compiler/grammarSnapshot";
import { treeScopeStackAt } from "../compiler/scopeEquality";
import { nextLuauToken, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";

function errors(source: string) {
  const uri = "inmemory:///bounded-diagnostics.sd";
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] });
  return (compiler.compile({ textDocument: { uri } }).program.diagnostics?.[uri] ?? []).filter(d => d.severity === 1);
}
const message = (d: { message: unknown }) => typeof d.message === "string" ? d.message : (d.message as { value: string }).value;
const syntaxErrorCode = "SyntaxError";

describe("bounded authored islands retain one syntax diagnostic owner", () => {
  test.each([
    "do if true x = 5 end end",
    "do if true end end",
    "do if true then x = 1 elseif false end end",
  ])("missing then in %s names the native token", body => {
    const island = `& ${body}`;
    const native = parseOfficialTree(`  ${body}`).errors[0]!;
    expect(native.message).toContain("Expected 'then'");
    const source = `store x = 0\n${island}\nreturn to the village\n`;
    const published = errors(source);
    expect(published.map(message)).toEqual([native.message]);
    expect(published[0]!.range.start).toEqual({ line: 1, character: native.location.begin.column });
    expect(published[0]!.range.end).toEqual({ line: 1, character: native.location.end.column });
  });

  test.each([
    "a = 1,", "a, b = 1,", "local n = 1,", "local n: number = 1,",
    "local n =", "a =", "a = 1 +",
  ])("missing value in %s belongs to authored EOF, not prose", body => {
    const island = `& ${body}`;
    const native = parseOfficialTree(`  ${body}`).errors[0]!;
    expect(native.message).toContain("<eof>");
    const source = `store a, b = 0, 0\n${island}\nThe hero returns.\n`;
    const published = errors(source);
    expect(published.map(message)).toEqual([native.message]);
    expect(published[0]!.code).toBe(syntaxErrorCode);
    expect(published[0]!.range.start).toEqual({ line: 1, character: island.length });
    expect(treeScopeStackAt(parseSource(source), source.indexOf("The hero"))).toContain("string.display.text.chunk.sd");
  });

  test.each([
    "do if true then x = 5 end end",
    "do if false then x = 1 elseif true then x = 5 else x = 2 end end",
    "do while false do x = 1 end end",
    "do for i = 1, 2 do x += i end end",
    "do repeat x += 1 until x == 2 end",
  ])("complete control %s has no syntax error", body => {
    expect(errors(`store x = 0\n& ${body}\nreturn to the village\n`)).toEqual([]);
  });

  test.each(["return to the village\n", "& math.abs(5)\n", ""])("missing then ends before independent tail %s", tail => {
    const island = "& do if true";
    const native = parseOfficialTree("  do if true").errors.find(d => d.message.startsWith("Expected 'then'"))!;
    const published = errors(`${island}\n${tail}`).filter(d => message(d).startsWith("Expected 'then'"));
    expect(published.map(message)).toEqual([native.message]);
    expect(published[0]!.range.start).toEqual({ line: 0, character: island.length });
  });

  test.each(["file", "scene", "branch"])("marked missing operand owns %s EOF with a later valid mark", scope => {
    const prefix = scope === "file" ? "" : scope === "scene" ? "scene a\n" : "scene a\nbranch b\n";
    const suffix = scope === "file" ? "" : scope === "scene" ? "end\n" : "end\nend\n";
    const island = "& local n = 1,";
    const published = errors(`${prefix}${island}\n& math.abs(5)\nreturn to the village\n${suffix}`);
    expect(published.map(message)).toEqual(["Expected identifier when parsing expression, got <eof>"]);
    expect(published[0]!.range.start).toEqual({ line: prefix.split("\n").length - 1, character: island.length });
  });

  test.each([
    "function f()\n local n = 1,\n 2\n return n\nend\n",
    "& local f = function()\n local n = 1,\n 2\n return n\nend\n",
  ])("a genuine function's value list still continues across lines: %s", source => {
    expect(errors(source)).toEqual([]);
  });

  test("bounded lookahead shares one full-document lexical pass across islands", () => {
    const measure = (count: number) => {
      const lines = Array.from({ length: count }, (_, n) => `& local n${n} =`);
      const source = lines.join("\n") + "\nThe hero returns.\n";
      // The lookups carry tokens over from the document before (#1724), and
      // the shorter document begins with the longer one's lines: start each
      // measurement from an empty document's.
      nextLuauToken(0, "");
      const startsWith = String.prototype.startsWith;
      let scans = 0;
      const spy = vi.spyOn(String.prototype, "startsWith").mockImplementation(function (this: string, search: string, at?: number) {
        if (String(this) === source && search === "--") scans++;
        return startsWith.call(this, search, at);
      });
      try {
        let end = 0;
        for (const line of lines) {
          end += line.length;
          const parsed = readLuauExpressionAfter(end, source, end);
          expect(parsed.errors.map(d => d.message)).toEqual(["Expected identifier when parsing expression, got <eof>"]);
          expect(parsed.errors[0]!.location.begin.column).toBe(line.length);
          expect(nextLuauToken(end, source, end)).toBeNull();
          end++;
        }
      } finally { spy.mockRestore(); }
      expect(scans).toBeGreaterThan(count);
      return scans;
    };
    expect(measure(40)).toBeLessThan(measure(20) * 2.5);
  });

  test("a bounded opaque token cannot borrow a closer outside its owned span", () => {
    const source = "[[value\n]] next";
    const native = parseOfficialTree("local n = [[value").errors;
    const parsed = readLuauExpressionAfter(0, source, "[[value".length);
    expect(parsed.errors.map(d => d.message)).toEqual(native.map(d => d.message));
    expect(nextLuauToken("[[value".length, source, "[[value".length)).toBeNull();
  });
});
