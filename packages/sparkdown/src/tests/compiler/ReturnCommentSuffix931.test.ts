import "../../inkjs/engine/Container";
import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";
import { officialSyntaxErrors } from "./officialSyntax";
import { printOfficialAst } from "./printOfficialAst";
import { checkerView } from "./luauCheckerView";

const URI = "inmemory:///comment.sd";
const messageOf = (message: unknown) => typeof message === "string" ? message : (message as { value: string }).value;
function published(text: string, compiler = new SparkdownCompiler(), version = 1) {
  compiler.configure({ files: [{ uri: URI, type: "script", name: "comment", ext: "sd", text, version, languageId: "sparkdown" }] } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  return program.diagnostics?.[URI] ?? [];
}
function compile(text: string, compiler = new SparkdownCompiler(), version = 1) {
  return published(text, compiler, version).filter(d => d.code === "SyntaxError").map(d => ({ message: d.message, range: d.range }));
}
function converted(text: string) {
  const units = readLuauUnits(parseSource(text), text);
  return [units.prelude, ...units.flows].flatMap(unit => unit.errors.map(d => ({ message: d.message, range: {
    start: { line: d.location.begin.line, character: d.location.begin.column },
    end: { line: d.location.end.line, character: d.location.end.column },
  } })));
}
function native(text: string) {
  const lines = text.split("\n");
  const column = (line: number, bytes: number) => Buffer.from(lines[line] ?? "", "utf8").subarray(0, bytes).toString("utf8").length;
  return officialSyntaxErrors(text).map(d => ({ message: d.message, range: {
    start: { line: d.location.begin.line, character: column(d.location.begin.line, d.location.begin.column) },
    end: { line: d.location.end.line, character: column(d.location.end.line, d.location.end.column) },
  } }));
}

describe("return suffix comments retain native diagnostics and incremental positions", () => {
  test.each([
    "return 5 --[[ unfinished\n",
    "return 5 --[=[ unfinished\n",
    "return 5; ; --[[ unfinished\n",
    "return 5; ; ; --[=[ unfinished\n",
    "local n = 1; return 5; ; --[[ unfinished\n",
    "do return 5 --[[ unfinished\n",
    "do if true then return 5 --[=[ unfinished\n",
    "repeat return 5 --[[ unfinished\n",
    "return 5; --[[ é😀\nb ]] f()\n",
    "return 5 --[=[ é😀\nb ]=] f()\n",
  ])("pins raw native message and document range: %s", (body) => {
    const source = `& ${body}`;
    // Only the first physical line is Luau; even a later comment closer is prose.
    const expected = native(`  ${body.split("\n")[0]!}`);
    expect(expected.length).toBeGreaterThan(0);
    expect(converted(source)).toEqual(expected);
    if (body.includes("; ;")) expect(compile(source)).toEqual(expected);
    else {
      // The literal validator publishes its expression-context error and
      // suppresses overlapping checker errors. Its range ends on this line.
      const comment = published(source).find(d => messageOf(d.message) === "Expected identifier when parsing expression, got unfinished comment");
      expect(comment?.range).toEqual({ start: { line: 0, character: source.indexOf("--[") }, end: { line: 0, character: source.split("\n")[0]!.length } });
    }
  });
  test.each(["do", "if true then", "repeat"])("a genuine function's unfinished comment retains native %s ownership", (block) => {
    const source = `function f()\n  ${block}\n    return 5 --[[ unfinished\n`;
    expect(converted(source)).toEqual(native(source));
    expect(published(source).some(d => messageOf(d.message) === "Expected identifier when parsing expression, got unfinished comment")).toBe(true);
  });
  test("warm edits agree with cold reads through comment closure and later followers", () => {
    const compiler = new SparkdownCompiler();
    const cache = new Map<string, unknown>();
    const states = [
      "--[[ é😀\nb ]] f()",
      "--[[ é😀\nb ]] -- ok",
      "--[[ é😀\nb ]] g()",
      "--[[ é😀\nb\n]] g()",
      "--[=[ unfinished\n",
      "--[=[ finished\n]=] -- ok",
      "--[=[ finished\n]=] f()",
    ];
    states.forEach((suffix, i) => {
      const source = `-> a\nscene a\n  & return 5; ${suffix}\n  Prose.\nend\n`;
      const warm = compile(source, compiler, i + 1);
      expect(warm).toEqual(compile(source));
      const units = readLuauUnits(parseSource(source), source);
      const compressed = readLuauUnits(parseSource(source), source, { unitLines: true }).flows[0]!;
      const coldAst = printOfficialAst(compressed.root, checkerView(source, "_G"));
      const cold = { ast: coldAst, errors: compressed.errors };
      const cached = cache.get(compressed.key!) ?? cold;
      expect(cached).toEqual(cold);
      cache.set(compressed.key!, cold);
      expect(compressed.errors.map(error => ({
        begin: { line: compressed.lines![error.location.begin.line], column: error.location.begin.column },
        end: { line: compressed.lines![error.location.end.line], column: error.location.end.column },
      }))).toEqual(units.flows[0]!.errors.map(error => ({ begin: error.location.begin, end: error.location.end })));
      const first = units.flows[0]!.errors[0];
      if (first && warm.length && suffix.endsWith("()")) expect(warm[0]!.range.start).toEqual({ line: first.location.begin.line, character: first.location.begin.column });
    });
  });
  test("unrelated following prose still reuses the checked unit", () => {
    const compiler = new SparkdownCompiler();
    const source = (prose: string) => `-> a\nscene a\n  & return 5; --[[ é😀\nb ]] -- ok\n  ${prose}\nend\n`;
    const first = compile(source("First."), compiler, 1);
    expect(published(source("First.")).some(d => d.severity === 1 && messageOf(d.message).includes("unfinished comment"))).toBe(true);
    expect(compile(source("Different prose."), compiler, 2)).toEqual(first);
    expect(compiler.typecheckStats.checked).toBe(0);
    expect(compiler.typecheckStats.reused).toBeGreaterThan(0);
  });
  test("bounded comment trivia locates physical EOL in cold and cached units", () => {
    const cache = new Map<string, unknown>();
    const compiler = new SparkdownCompiler();
    for (const [i, suffix] of ["--[[ é😀\nb ]]", "--[=[ é😀\nb ]=]", "--[[ é😀\nb\n]]"].entries()) {
      const source = `store value = 5\n& return value ${suffix}\nUnrelated prose.\n`;
      const units = readLuauUnits(parseSource(source), source);
      const compressed = readLuauUnits(parseSource(source), source, { unitLines: true }).prelude;
      const endLine = 1;
      const endColumn = "& return value ".length + suffix.split("\n")[0]!.length;
      expect(units.prelude.root.location.end).toEqual({ line: endLine, column: endColumn });
      expect({ line: compressed.lines![compressed.root.location.end.line], column: compressed.root.location.end.column }).toEqual({ line: endLine, column: endColumn });
      const cold = printOfficialAst(compressed.root, checkerView(source, "_G"));
      expect(cache.get(compressed.key!) ?? cold).toEqual(cold);
      cache.set(compressed.key!, cold);
      expect(compile(source, compiler, i + 1)).toEqual(compile(source));
    }
  });
  test("a written function closer excludes following story from EOF and cache dependencies", () => {
    const compiler = new SparkdownCompiler();
    const cache = new Map<string, unknown>();
    const states = ["After.\nLater prose.", "Other.\nDifferent prose.", "After.\nLater prose."];
    states.forEach((prose, i) => {
      const source = `function f() return 5 end ${prose}\n`;
      const unit = readLuauUnits(parseSource(source), source, { unitLines: true }).prelude;
      expect(unit.errors).toEqual([]);
      expect(unit.root.location.end).toEqual({ line: 0, column: 25 });
      const cold = printOfficialAst(unit.root, checkerView(source, "_G"));
      expect(cache.get(unit.key!) ?? cold).toEqual(cold);
      cache.set(unit.key!, cold);
      expect(compile(source, compiler, i + 1)).toEqual(compile(source));
      if (i > 0) {
        expect(compiler.typecheckStats.checked).toBe(0);
        expect(compiler.typecheckStats.reused).toBeGreaterThan(0);
      }
    });
  });
});
