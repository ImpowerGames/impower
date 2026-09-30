import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { diagnosticMessage } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

// An if statement's condition ends with its line unless the next line begins
// with its `then` or continues the expression. A condition written without
// `then` is reported in Luau's words at the token Luau names, and the line
// after it stays in the branch's body (#1159).

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const warn = console.warn;
  console.warn = () => {};
  try {
    return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
  } finally {
    console.warn = warn;
  }
}

function diagnosticsOf(program: any): any[] {
  return Array.isArray(program.diagnostics) ? program.diagnostics : Object.values(program.diagnostics ?? {}).flat();
}

const describeLsp = (d: any) =>
  `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.severity === 1 ? "error" : "other"}: ${diagnosticMessage(d)}`;

const luauSyntaxErrors = (source: string) =>
  checkLuau(source, { fixture: "BuiltinsFixture" })
    .diagnostics.filter((d) => d.code === "SyntaxError")
    .map(describeDiagnostic);

describe("an if statement without `then`", () => {
  test.each([
    ["a statement on the next line", "local flag = true\nif flag\n  print(1)\nend\n"],
    ["`end` on the next line", "local flag = true\nif flag\nend\n"],
    ["an `elseif` whose next line is a statement", "local flag = true\nif flag then\nelseif flag\n  print(1)\nend\n"],
  ])("%s is reported as Luau reports it", (_, source) => {
    const expected = luauSyntaxErrors(source);
    expect(expected).toEqual([expect.stringContaining("Expected 'then' when parsing if statement, got '")]);
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual(expected);
  });

  test.each([
    ["`then` on the next line", "local flag = true\nif flag\nthen\nend\n"],
    ["a next line that continues with an operator", "local flag, b = true, false\nif flag\n  and b then\nend\n"],
    ["an operator that ends the line", "local flag, b = true, false\nif flag and\n  b then\nend\n"],
    ["an access on the next line", "local t = {a = true}\nif t\n  .a then\nend\n"],
  ])("a condition with %s still reads to its `then`", (_, source) => {
    expect(luauSyntaxErrors(source)).toEqual([]);
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  const STORY =
    "store flag = true\n\n-> start\n\nscene start\n  Opening beat.\n  if flag\n    Went down the true side.\n  else\n    Went down the false side.\n  end\n  Shared beat after the branch.\nend\n";

  test("in a story, is an error at the branch's first word", () => {
    expect(diagnosticsOf(compile(STORY)).map(describeLsp)).toEqual([
      "7:4-7:8 error: Expected 'then' when parsing if statement, got 'Went'",
    ]);
  });

  test("in a story, keeps the branch's first line as story text", () => {
    const compiled = JSON.stringify(compile(STORY).compiled);
    expect(compiled).toContain('"^Went down the true side."');
    expect(compiled).toContain('"^Went down the false side."');
  });

  test("in a story, a condition whose `then` is on a later line keeps both branches", () => {
    const source = STORY.replace("  if flag\n", "  if flag\n    and flag\n    then\n");
    const program = compile(source);
    expect(diagnosticsOf(program).map(describeLsp)).toEqual([]);
    expect(JSON.stringify(program.compiled)).toContain('"^Went down the true side."');
  });
});
