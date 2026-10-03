import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";

const URI = "inmemory:///main.sd";
function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] } as never);
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
] as const;

describe("return is the final Luau statement in its block (#1298)", () => {
  it.each(cases)("reports Luau's syntax error for %s", (_name, source) => {
    const oracle = parseLuau(source).errors[0]!;
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
    "& return 1\n& print(2)\n",
  ])("accepts final Luau returns and narrative returns: %s", (source) => {
    const program = compile(source + "\nBOB:\n  Hello after.\n");
    const errors = (Object.values(program.diagnostics ?? {}) as any[]).flat().filter((d: any) => d.severity === 1);
    expect(errors.map((d: any) => typeof d.message === "string" ? d.message : d.message?.value)).toEqual([]);
  });
});
