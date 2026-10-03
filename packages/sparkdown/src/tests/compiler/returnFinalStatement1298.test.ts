import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";
import { parseSource } from "./grammarSnapshot";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";

const URI = "inmemory:///main.sd";
function compile(text: string, compiler = new SparkdownCompiler(), version = 1) {
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" }] } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never) as any).program;
}

const cases = [
  ["function", "function f()\n  return 1\n  print(2)\nend\n", 3],
  ["multiline return", "function f()\n  return\n    1\n  local y = 2\nend\n", 4],
  ["do assignment", "function f()\n  do\n    return\n    x = 1\n  end\nend\n", 5],
  ["then", "function f()\n  if x then\n    return 1\n    print(1)\n  end\nend\n", 5],
  ["semicolon and comment", "function f()\n  return 1; -- done\n  print(2)\nend\n", 3],
  ["same line", "function f() return 1; print(2) end\n", 0],
  ["else", "function f()\n  if x then\n    print(1)\n  else\n    return 1\n    print(2)\n  end\nend\n", 7],
  ["repeat", "function f()\n  repeat\n    return 1\n    print(2)\n  until true\nend\n", 5],
  ["marked function", "function f()\n  & return 1\n  & print(2)\nend\n", 3],
  ["marked do", "function f()\n  do\n    & return 1\n    & print(2)\n  end\nend\n", 5],
  ["marked then", "function f()\n  if x then\n    & return 1\n    & print(2)\n  end\nend\n", 5],
] as const;

describe("return is the final Luau statement in its block (#1298)", () => {
  it("clears a cached follower error after a trailing line comment replaces it", () => {
    const compiler = new SparkdownCompiler();
    const source = (suffix: string) => `-> a\n\nscene a\n  & return 5; ${suffix}\nend\n`;
    const errors = (program: any) => (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError").map((d: any) => ({ message: d.message, range: d.range }));
    expect(errors(compile(source("print(2)"), compiler, 1))).toHaveLength(1);
    expect(errors(compile(source("-- done"), compiler, 2))).toEqual([]);
  });
  it("reuses the checked unit when only following story prose changes", () => {
    const compiler = new SparkdownCompiler();
    const source = (prose: string) => `-> a\n\nscene a\n  & return 5; -- done\n  ${prose}\n  & local x = 1\nend\n`;
    const first = compile(source("Hello there."), compiler, 1);
    const second = compile(source("A different story line."), compiler, 2);
    const syntax = (program: any) => (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError");
    expect(syntax(first)).toEqual([]);
    expect(syntax(second)).toEqual([]);
    expect(compiler.typecheckStats.checked).toBe(0);
    expect(compiler.typecheckStats.reused).toBeGreaterThan(0);
  });
  it.each(["return 5; ", "do return 5; "])("updates cached diagnostics when the marked return suffix changes: %s", (prefix) => {
    const compiler = new SparkdownCompiler();
    const nested = prefix.startsWith("do");
    const suffixes = ["--[[done]]", "print(2)", "other(2)", " print(2)", "--[[done]]", "print(2)"];
    for (const [index, suffix] of suffixes.entries()) {
      const text = `-> a\n\nscene a\n  & ${prefix}${suffix}${nested ? " end" : ""}\nend\n`;
      compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: index + 1, languageId: "sparkdown" }] } as never);
      const program = (compiler.compile({ textDocument: { uri: URI } } as never) as any).program;
      const errors = (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError");
      if (suffix.startsWith("--")) {
        expect(errors).toEqual([]);
      } else {
        const word = suffix.trimStart().split("(")[0]!;
        const from = 4 + prefix.length + (suffix.startsWith(" ") ? 1 : 0);
        expect(errors.map((d: any) => ({ message: d.message, range: d.range }))).toEqual([
          { message: nested ? `Expected 'end' (to close 'do' at column 5), got '${word}'` : `Expected <eof>, got '${word}'`, range: { start: { line: 3, character: from }, end: { line: 3, character: from + word.length } } },
        ]);
      }
    }
  });
  it("publishes the same-line error in the live story with an entry divert", () => {
    const source = "-> a\n\nscene a\n  & return 5; print(2)\n  Hello after the marked line.\nend\n";
    const units = readLuauUnits(parseSource(source), source);
    expect(units.flows[0]!.errors[0]?.message).toBe("Expected <eof>, got 'print'");
    const errors = (Object.values(compile(source).diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError");
    expect(errors.map((d: any) => ({ message: d.message, range: d.range }))).toEqual([
      { message: "Expected <eof>, got 'print'", range: { start: { line: 3, character: 14 }, end: { line: 3, character: 19 } } },
    ]);
  });
  it.each(["return 5 f()", "return 5; f()", "do return 5 f() end", "do return 5; f() end", "return 5 end", "return 5 else", "return 5 until true", "return 5 --[[comment]] f()"])("requires a story return to finish its marked Luau line: %s", (line) => {
    const source = `scene a\n  & ${line}\nend\n`;
    const oracle = officialSyntaxErrors(`    ${line}`)[0]!;
    const units = readLuauUnits(parseSource(source), source);
    expect(units.flows[0]!.errors.slice(0, 1).map((e) => ({ message: e.message, location: e.location }))).toEqual([
      { message: oracle.message, location: { begin: { line: 1, column: oracle.location.begin.column }, end: { line: 1, column: oracle.location.end.column } } },
    ]);
    const errors = (Object.values(compile(source).diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError");
    expect(errors.map((d: any) => ({ message: d.message, range: d.range }))).toEqual([
      { message: oracle.message, range: { start: { line: 1, character: oracle.location.begin.column }, end: { line: 1, character: oracle.location.end.column } } },
    ]);
  });

  it.each([
    "scene a\n  & return 5\n  Hello there.\n  & f()\nend\n",
    "scene a\n  & return 5\n  & f()\nend\n",
    "scene a\n  & return 5; -- f() is a comment\n  Hello there.\n  & f()\nend\n",
    "scene a\r\n  & return 5  \r\n  & f()\r\nend\r\n",
    "scene a\n  & do return 5 end\nend\n",
    "scene a\n  & return 5 --[[comment]]\n  Hello there.\nend\n",
  ])("keeps prose and a new marked line outside the previous story return: %s", (source) => {
    const units = readLuauUnits(parseSource(source), source);
    expect(units.flows[0]!.errors).toEqual([]);
    const errors = (Object.values(compile(source).diagnostics ?? {}) as any[]).flat().filter((d: any) => d.code === "SyntaxError");
    expect(errors).toEqual([]);
  });
  it.each(cases)("reports Luau's syntax error for %s", (_name, source) => {
    const oracle = officialSyntaxErrors(source.replaceAll("&", " "))[0]!;
    expect(oracle).toBeDefined();
    const program = compile(source + "\nBOB:\n  Hello after.\n");
    const errors = (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.severity === 1);
    expect(errors.map((d: any) => ({ message: typeof d.message === "string" ? d.message : d.message?.value, range: d.range }))).toEqual([
      { message: oracle.message, range: { start: { line: oracle.location.begin.line, character: oracle.location.begin.column }, end: { line: oracle.location.end.line, character: oracle.location.end.column } } },
    ]);
  });

  it.each(cases)("preserves the function's own end for %s", (_name, source, endLine) => {
    const program = compile(source + "\nBOB:\n  Hello after.\n");
    expect(program.pathLocations.functions).toEqual([{ path: "f", lines: [0, 0, endLine] }]);
  });

  it.each([
    "function f()\n  return 1;\nend\n",
    "function f()\n  if x then\n    return 1\n  else\n    return 2\n  end\n  print(3)\nend\n",
    "function f()\n  do\n    return\n  end\n  print(3)\nend\n",
    "function f()\n  return\n    1 +\n    2\nend\n",
    "function f()\n  & return\n  & -1\nend\n",
    "function f()\n  & return 1,\n  & print(2)\nend\n",
    "function f()\n  & return 1 +\n  & print(2)\nend\n",
  ])("accepts final Luau returns and multiline return values: %s", (source) => {
    const program = compile(source + "\nBOB:\n  Hello after.\n");
    const errors = (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.severity === 1);
    expect(errors.map((d: any) => typeof d.message === "string" ? d.message : d.message?.value)).toEqual([]);
  });

  it("the story grammar keeps a marked return on one line", () => {
    const source = "scene a\n  & return\n  Hello there.\n  & print(2)\nend\n";
    const tree = parseSource(source);
    const returns: string[] = [];
    const cursor = tree.cursor();
    do {
      if (cursor.name === "LuauReturnStatement" || cursor.name === "LuauSparkdownReturnStatement") returns.push(source.slice(cursor.from, cursor.to).trim());
    } while (cursor.next());
    expect(returns).toEqual(["return"]);
  });

  it("keeps the existing unreachable warning alongside the marked function's syntax error", () => {
    const program = compile("function f()\n  & return 1\n  & print(2)\nend\n");
    const diagnostics = (Object.values(program.diagnostics ?? {}) as any[]).flat();
    expect(diagnostics.filter((d: any) => d.code === "UnreachableCode").map((d: any) => ({ message: d.message.value, severity: d.severity, range: d.range }))).toEqual([
      { message: "Unreachable code (previous statement always returns)", severity: 2, range: { start: { line: 2, character: 4 }, end: { line: 2, character: 12 } } },
    ]);
  });

  it.each(["function", "do", "if"])("marked bare returns keep Luau's multiline values in %s blocks", (block) => {
    for (const follower of ["print(2)", "x = 1"]) for (const marked of [false, true]) {
      const header = block === "do" ? "  do\n" : block === "if" ? "  if x then\n" : "";
      const source = `function f()\n${header}  & return\n  ${marked ? "& " : ""}${follower}\n${header ? "  end\n" : ""}end\n`;
      const oracle = officialSyntaxErrors(source.replaceAll("&", " "))[0];
      const program = compile(source);
      const errors = (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.severity === 1);
      expect(errors.map((d: any) => ({ message: d.message, range: d.range }))).toEqual(oracle ? [
        { message: oracle.message, range: { start: { line: oracle.location.begin.line, character: oracle.location.begin.column }, end: { line: oracle.location.end.line, character: oracle.location.end.column } } },
      ] : []);
    }
  });
});
