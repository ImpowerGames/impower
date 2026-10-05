import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { readLuauUnits, luauPositionOffset } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";
import { loadOfficialLuau } from "./officialLuau";
import { compareEnginesFull } from "./scopeEquality";
import { AstExprCall, AstExprFunction, AstExprGlobal, visitAst } from "../../compiler/typecheck/Ast";

const inputs = [
  ["& function f()", " end"],
  ["& local function f()", " end"],
  ["& local f = function()", " end"],
  ["& local f = function<T>()", " end"],
  ["& type function f()", " end"],
  ["& f(function()", " end)"],
  ["& do local f = function()", " end end"],
  ["& function f", "() end"],
  ["& function f -- note", ""],
  ["& function object:method()", " end"],
  ["& local f = function() local g = function()", " end end"],
];

function diagnostics(source: string) {
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] });
  return Object.values(compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program.diagnostics ?? {}).flat();
}

test.each(inputs)("publishes the physical-line function EOF for %s", async (line, closer) => {
  const official = await loadOfficialLuau("typecheck");
  for (const newline of ["", "\n", "\r\n"]) {
    const source = `${line}${newline}${newline ? "& after()" + newline + "Following story." + newline : ""}`;
    const reading = readLuauUnits(parseSource(source), source).prelude;
    const shorthandHeader = line === "& function f" || line === "& function f -- note";
    const expected = shorthandHeader ? reading.errors[0] : reading.errors.find(error => error.message.includes("to close 'function'"));
    expect(expected).toBeDefined();
    const nativeSource = line;
    const native = shorthandHeader ? official(nativeSource.replace(/^&/, " ")).diagnostics[0] : official(nativeSource.replace(/^&/, " ")).diagnostics.find(error => error.message.includes("to close 'function'"));
    expect(native?.message).toBe(expected!.message);
    const outerDo = line.startsWith("& do");
    const message = outerDo ? "This `do` block is missing its closing `end` keyword on this `&` line. The following line remains story text." : shorthandHeader ? "This function is missing its closing `end` keyword on this `&` line. The following line remains story text." : expected!.message;
    const published = diagnostics(source).filter((error: any) => error.severity === 1 && (typeof error.message === "string" ? error.message : error.message.value) === message);
    expect(published.length).toBe(1);
    const error = published[0] as any;
    expect(error.range).toEqual(outerDo || shorthandHeader ? { start: { line: 0, character: 2 }, end: { line: 0, character: line.length } } : {
      start: { line: expected!.location.begin.line, character: expected!.location.begin.column },
      // Existing publication extends a point EOF through its line break.
      end: newline ? { line: 1, character: 0 } : { line: expected!.location.end.line, character: expected!.location.end.column },
    });
    expect(luauPositionOffset(expected!.location.begin, source)).toBeLessThanOrEqual(line.length);
    expect(luauPositionOffset(expected!.location.end, source)).toBeLessThanOrEqual(line.length);
    const tree = parseSource(source);
    const cursor = tree.cursor();
    let proseFrom = -1;
    do { if (cursor.name === "ImplicitAction") proseFrom = cursor.from; } while (cursor.next());
    if (newline) {
      expect(proseFrom).toBe(line.length + newline.length + "& after()".length + newline.length);
      expect(reading.root.body.length).toBe(2);
      const functionCalls: string[] = [];
      visitAst(reading.root.body[0]!, { visit(node) {
        if (node instanceof AstExprFunction) {
          visitAst(node.body, { visit(child) {
            if (child instanceof AstExprCall && child.func instanceof AstExprGlobal) functionCalls.push(child.func.name);
            return true;
          } });
          return false;
        }
        return true;
      } });
      expect(functionCalls).not.toContain("after");
    }
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
    expect(diagnostics(shorthandHeader ? `& function f() end${newline}` : `${line}${closer}${newline}`).filter((error: any) => error.severity === 1)).toEqual([]);
  }
});

test("ordinary multiline functions keep their written closer", () => {
  expect(diagnostics("function f()\n  local function g()\n    return 1\n  end\n  return g()\nend\n")).toEqual([]);
  expect(diagnostics("function f -- note\n  return 1\nend\n")).toEqual([]);
});

test("an incomplete marked function cannot take the synthetic scene closer", () => {
  for (const newline of ["\n", "\r\n"]) {
    const source = ["scene start", "& local f = function()", "scene next", "Following."].join(newline);
    const reading = readLuauUnits(parseSource(source), source);
    const functions: AstExprFunction[] = [];
    for (const unit of reading.flows) visitAst(unit.root, { visit(node) {
      if (node instanceof AstExprFunction) functions.push(node);
      return true;
    } });
    const written = functions.find(fn => fn.location.begin.line === 1 && fn.location.begin.column === 12);
    const scene = functions.find(fn => fn.location.begin.line === 0);
    expect(written?.body.hasEnd).toBe(false);
    expect(scene?.body.hasEnd).toBe(true);
    expect(written?.body.location.end.line).toBe(1);
    expect(reading.flows.flatMap(unit => unit.errors).filter(error => error.message.includes("to close 'function'"))).toHaveLength(1);
  }
});

test.each([
  "& function f(",
  "& function f(a",
  "& function f(a:",
  "& function f<T",
  "& local f = function(",
  "& local f = function(a:",
])("parameter recovery stays inside the marked line: %s", line => {
  for (const newline of ["\n", "\r\n"]) {
    const source = `${line}${newline}& after()${newline}Following story.`;
    const reading = readLuauUnits(parseSource(source), source).prelude;
    expect(reading.errors.length).toBeGreaterThan(0);
    expect(luauPositionOffset(reading.errors[0]!.location.begin, source)).toBeLessThanOrEqual(line.length);
    expect(reading.root.body.length).toBe(2);
    const functions: AstExprFunction[] = [];
    visitAst(reading.root.body[0]!, { visit(node) {
      if (node instanceof AstExprFunction) functions.push(node);
      return true;
    } });
    expect(functions.length).toBe(1);
    expect(functions[0]!.location.end.line).toBe(0);
    expect(functions[0]!.body.hasEnd).toBe(false);
    expect(reading.root.body[1]!.location.begin.line).toBe(1);
  }
});

test("the boundary also contains semicolon-separated marked-line tails", () => {
  for (const newline of ["\n", "\r\n"]) {
    for (const tail of ["local f = function(", "local f = function(a:", "local f = function()"] ) {
      const line = `& count = 0; ${tail}`;
      const source = `${line}${newline}& after()${newline}Following story.`;
      const reading = readLuauUnits(parseSource(source), source).prelude;
      const functions: AstExprFunction[] = [];
      visitAst(reading.root, { visit(node) {
        if (node instanceof AstExprFunction) functions.push(node);
        return true;
      } });
      expect(functions.length).toBe(1);
      expect(functions[0]!.location.end.line).toBe(0);
      expect(functions[0]!.body.hasEnd).toBe(false);
      expect(reading.root.body.length).toBe(3);
      expect(reading.root.body[2]!.location.begin.line).toBe(1);
    }
    const complete = `& count = 0; local f = function() return 1 end; count = f()${newline}& after()${newline}`;
    expect(readLuauUnits(parseSource(complete), complete).prelude.errors).toEqual([]);
  }
});
