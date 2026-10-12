import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";
import { AstExprBinary, AstExprLocal, AstStatRepeat, visitAst } from "../../compiler/typecheck/Ast";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const URI = "inmemory:///main.sd";

function read(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const tree = compiler.documents.tree(URI);
  expect(tree).toBeDefined();
  const units = sparkdownUnits(tree!, text);
  const repeats: AstStatRepeat[] = [];
  for (const unit of [units.prelude, ...units.flows]) {
    visitAst(unit.root, { visit(node) { if (node instanceof AstStatRepeat) repeats.push(node); return true; } });
  }
  return { units, repeats, result };
}

describe("top-level repeat conditions remain in checking units (#1304)", () => {
  test.each([
    "store n = 0\nrepeat n = n + 1 until n > 3\nCount {n}.",
    "store n = 0\nrepeat\n  n = n + 1\nuntil n > 3\nCount {n}.",
  ])("reads the complete repeat without a missing-until error: %s", (text) => {
    const { units, repeats } = read(text);
    expect(units.prelude.errors.map((error) => error.message)).toEqual([]);
    expect(repeats).toHaveLength(1);
    expect(repeats[0]!.condition).toBeInstanceOf(AstExprBinary);
    const condition = repeats[0]!.condition as AstExprBinary;
    expect(condition.right).toMatchObject({ kind: "ExprConstantNumber", value: 3 });
  });

  test.each([
    "store n = 0\nrepeat n = n + 1 until n > 3\nCount {n}.",
    "store n = 0\nrepeat\n  n = n + 1\nuntil n > 3\nCount {n}.",
  ])("preserves completed loop output: %s", (text) => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(text);
    expect(errorMessages).toEqual([]);
    expect(story.ContinueMaximally().trim()).toBe("Count 4.");
  });

  test.each([
    "scene MAIN\nlocal n = 0\nrepeat n += 1 until n > 3\nCount {n}.\nend",
    "branch MAIN\nlocal n = 0\nrepeat n += 1 until n > 3\nCount {n}.\nend",
    "function f()\nlocal n = 0\nrepeat n += 1 until n > 3\nreturn n\nend",
  ])("keeps complete conditions inside flows and functions: %s", (text) => {
    const { units, repeats } = read(text);
    expect([units.prelude, ...units.flows].flatMap((unit) => unit.errors)).toEqual([]);
    expect(repeats).toHaveLength(1);
    expect(repeats[0]!.condition).toBeInstanceOf(AstExprBinary);
  });

  test("resolves a repeat-body local in the until condition", () => {
    const { units, repeats } = read("repeat local done = true until done\nFinished.");
    expect(units.prelude.errors).toEqual([]);
    expect(repeats[0]!.condition).toBeInstanceOf(AstExprLocal);
    expect((repeats[0]!.condition as AstExprLocal).local.name).toBe("done");
  });

  test("retains both nested conditions", () => {
    const { units, repeats } = read("repeat\n  repeat local inner = true until inner\n  local outer = true\nuntil outer\nFinished.");
    expect(units.prelude.errors).toEqual([]);
    expect(repeats).toHaveLength(2);
    expect(repeats.map((repeat) => (repeat.condition as AstExprLocal).local.name)).toEqual(["outer", "inner"]);
  });

  test("checks a type error in the written until condition at its source line", () => {
    const { result } = read("---\ntypecheck: strict\n---\nrepeat local n: number = 1 until n + true > 3\nFinished.");
    const diagnostics = result.program.diagnostics?.[URI] ?? [];
    expect(diagnostics.some((diagnostic) => diagnostic.range.start.line === 3 &&
      String(typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value).includes("boolean"))).toBe(true);
  });

  test.each([
    "repeat local n = 1",
    "repeat local n = 1 until",
    "repeat local n = 1 until n >",
    "until true",
  ])("reports invalid written repeat syntax: %s", (text) => {
    const { units, result } = read(text);
    const errors = [units.prelude, ...units.flows].flatMap((unit) => unit.errors);
    const diagnostics = result.program.diagnostics?.[URI] ?? [];
    expect(errors.length + diagnostics.filter((diagnostic) => diagnostic.severity === 1).length).toBeGreaterThan(0);
  });
});
