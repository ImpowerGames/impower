import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownAnalysisInputs } from "../../compiler/typecheck/SparkdownAnalysisInputs";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const read = (source: string) => {
  const units = sparkdownUnits(compiler.documents.parser.parse(source), source);
  return [units.prelude, ...units.flows];
};
const source = "function give(value: number): number\n  return value\nend\n\nscene alpha\n  local result: number = give(1)\n  A narrative line.\nend\n";

describe("compact analysis transfer", () => {
  test("retained units share an immutable packed input after no-op and story edits", () => {
    const cache = new SparkdownAnalysisInputs(), cold = cache.update("main", 1, read(source));
    const packed = cold.units.map(unit => packSparkdownAnalysisAst(unit.ast));
    const warm = cache.update("main", 2, read(source.replace("A narrative line.", "A changed line.\n  A second line.")));
    warm.units.forEach((unit, index) => expect(packSparkdownAnalysisAst(unit.ast)).toBe(packed[index]));
    expect(warm.updates).toEqual([]);
    expect(Object.isFrozen(packed[0]!.nodes[0])).toBe(true);
    expect(Object.isFrozen(packed[0]!.layouts[0])).toBe(true);
    const changed = cache.update("main", 3, read(source.replace("return value", "return 2")));
    expect(packSparkdownAnalysisAst(changed.units[0]!.ast)).not.toBe(packed[0]);
    expect(packSparkdownAnalysisAst(changed.units[1]!.ast)).toBe(packed[1]);
  });

  test("rejects unknown schema, constructor fields and invalid special numbers", () => {
    const cache = new SparkdownAnalysisInputs(), cold = cache.update("main", 1, read(source));
    const ast = JSON.parse(JSON.stringify(cold.units[0]!.ast));
    ast.schemaVersion = 99;
    expect(() => packSparkdownAnalysisAst(ast)).toThrow("schema");
    ast.schemaVersion = 1;
    const expression = ast.nodes.find((node: { kind: string }) => node.kind === "ExprLocal");
    expression.fields.hasSemicolon = false;
    expect(() => packSparkdownAnalysisAst(ast)).toThrow("fields");
    delete expression.fields.hasSemicolon;
    expression.fields.upvalue = { tag: "number", value: "invented" };
    expect(() => packSparkdownAnalysisAst(ast)).toThrow("special number");
  });

  test("mutable encoded inputs are packed again after a semantic change", () => {
    const cache = new SparkdownAnalysisInputs(), cold = cache.update("main", 1, read(source));
    const ast = JSON.parse(JSON.stringify(cold.units[0]!.ast));
    const first = packSparkdownAnalysisAst(ast);
    const global = ast.nodes.find((node: { kind: string }) => node.kind === "ExprGlobal");
    global.fields.name = "changed";
    const second = packSparkdownAnalysisAst(ast);
    expect(second).not.toBe(first);
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  });
});
