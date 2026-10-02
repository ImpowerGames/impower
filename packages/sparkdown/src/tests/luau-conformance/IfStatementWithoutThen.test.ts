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
    ["a statement after a blank line", "local flag = true\nif flag\n\n  print(1)\nend\n"],
    ["a statement after a comment-only line", "local flag = true\nif flag\n  -- note\n  print(1)\nend\n"],
    ["a condition on the line after `if`, then a statement", "local flag = true\nif\n  flag\n  print(1)\nend\n"],
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
    ["its first line after `if`", "local flag = true\nif\n  flag\nthen\nend\n"],
    ["its first line after `elseif`", "local flag = true\nif flag then\nelseif\n  flag\nthen\nend\n"],
    ["several lines after `if`", "local a, b = true, false\nif\n\n  a and\n  b\nthen\nend\n"],
    ["a blank line before `then`", "local flag = true\nif flag\n\nthen\nend\n"],
    ["a comment-only line before `then`", "local flag = true\nif flag\n  -- note\nthen\nend\n"],
    ["a comment-only line between `if` and its first line", "local flag = true\nif\n  -- note\n  flag\nthen\nend\n"],
    ["a comment-only line between `elseif` and its first line", "local flag = true\nif flag then\nelseif\n  -- note\n  flag\nthen\nend\n"],
    ["a comment after `if` on its line", "local flag = true\nif -- note\n  flag\nthen\nend\n"],
    ["a block comment after `if` on its line", "local flag = true\nif --[[ note ]]\n  flag\nthen\nend\n"],
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

  // The second operand differs from the first: `flag and flag` repeats a
  // condition, which DuplicateCondition reports in a narrative `if` too.
  test.each([
    ["whose `then` is on a later line", "  if flag\n    and flag ~= false\n    then\n"],
    ["that begins on the line after `if`", "  if\n    flag\n  then\n"],
    ["that begins after a comment-only line", "  if\n    -- note\n    flag\n  then\n"],
  ])("in a story, a condition %s keeps both branches", (_, header) => {
    const program = compile(STORY.replace("  if flag\n", header));
    expect(diagnosticsOf(program).map(describeLsp)).toEqual([]);
    const compiled = JSON.stringify(program.compiled);
    expect(compiled).toContain('"^Went down the true side."');
    expect(compiled).toContain('"^Went down the false side."');
  });
});
