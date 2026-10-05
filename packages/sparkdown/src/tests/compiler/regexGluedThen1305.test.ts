import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { checkerTextUnits } from "./luauCheckerText";
import { officialSyntaxErrors } from "./officialSyntax";

const URI = "inmemory:///main.sd";

function readings(expression: string) {
  const text = `function f(c)\n  local s = ${expression}\n  return s\nend\n`;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
    .map((diagnostic) => typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value);
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("Compiler kept no syntax tree");
  const units = checkerTextUnits(tree, text);
  const official = [units.prelude, ...units.flows].flatMap((unit) => officialSyntaxErrors(unit.text));
  return { errors, official };
}

describe("regex flags glued to an if expression's then (#1305)", () => {
  test.each([
    "if @/x/githen 1 else 2",
    "if if c then false else @/x/githen 1 else 2",
    "if @/x/gi then 1 else 2",
    "if if c then false else @/x/gi then 1 else 2",
    "if @/x/then 1 else 2",
    "if if c then false else @/x/then 1 else 2",
    "if @/x/gthen 1 else 2",
    "if @/x/ithen 1 else 2",
    "if @/x/mthen 1 else 2",
    "if @/x/gimthen 1 else 2",
    "if c then 0 elseif @/x/githen 1 else 2",
    "if @/x/githen\n    1\n  else 2",
  ])("accepts %s", (expression) => {
    const result = readings(expression);
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("still rejects an if expression missing then", () => {
    const result = readings("if @/x/gi 1 else 2");
    expect(result.official.length).toBeGreaterThan(0);
    expect(result.errors).toContain("Expected 'then' when parsing if then else expression");
  });

  test.each([
    "if @/x/gi then else 2",
    "if @/x/githen else 2",
    "if @/x/gi then 1 else",
    "if @/x/githen 1 else",
    "if if c then false else @/x/gi 1 else 2",
    "if @/x/githenValue 1 else 2",
    "if @/x/githen_ 1 else 2",
    "if @/x/githen2 1 else 2",
    "if cthen 1 else 2",
  ])("rejects invalid clause or identifier boundary %s", (expression) => {
    const result = readings(expression);
    expect(result.official.length, "official Luau parser rejects projected checker text").toBeGreaterThan(0);
    expect(result.errors.length, "compiler rejects the authored expression").toBeGreaterThan(0);
  });
});
