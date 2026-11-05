import { describe, expect, test } from "vitest";
import { AstExprConstantNumber, AstLocal, AstStatBlock, AstStatLocal, AstTypeReference } from "../../compiler/typecheck/Ast";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { Location, Position } from "../../compiler/typecheck/Location";
import { Mode, type SourceModule } from "../../compiler/typecheck/Module";
import type { TypeCheckLimits } from "../../compiler/typecheck/TypeFunction";
import { checkerConfiguration } from "./checkerConfiguration";
import { ConstraintGenerator } from "../../compiler/typecheck/ConstraintGenerator";
import { ConstraintGraph } from "../../compiler/typecheck/ConstraintGraph";
import { DataFlowGraphBuilder } from "../../compiler/typecheck/DataFlowGraph";
import { Module, NullModuleResolver } from "../../compiler/typecheck/Module";
import { Normalizer, UnifierSharedState } from "../../compiler/typecheck/Normalize";
import { TypeFunctionRuntime } from "../../compiler/typecheck/TypeFunction";

const location = new Location(new Position(0, 0), new Position(0, 30));
function source(name = "_luau_force_constraint_solving_incomplete"): SourceModule {
  const annotation = new AstTypeReference(location, undefined, name, undefined, location);
  const local = new AstLocal("x", location, undefined, 0, 0, annotation);
  return { name: "config", humanReadableName: "config", hotcomments: [], parseErrors: [], root: new AstStatBlock(location, [new AstStatLocal(location, [local], [new AstExprConstantNumber(location, 1)], undefined)]) };
}
// Structural type keeps the reproduction runnable before these optional fields exist.
type Configuration = TypeCheckLimits & { debugMagicTypes?: boolean; nonStrictRecursionLimit?: number; addRecursionCounterToNonStrictTypeChecker?: boolean };
function check(config: Configuration = {}) {
  return new Frontend().checkSourceModule(source(), Mode.Nonstrict, undefined, config).errors.map((error) => error.kind);
}

describe("per-check non-strict checker configuration", () => {
  test("constraint generator cap affects real nested-block traversal and remains per instance", () => {
    let block = source().root;
    for (let i = 0; i < 250; i++) block = new AstStatBlock(location, [block]);
    const generate = (limit?: number) => {
      const f = new Frontend(), m = new Module();
      const dfg = DataFlowGraphBuilder.build(block, m.defArena, m.keyArena);
      const generator = new ConstraintGenerator(m, new Normalizer(m.internalTypes, f.builtinTypes, new UnifierSharedState()), new TypeFunctionRuntime(), new NullModuleResolver(), f.builtinTypes, f.globals.globalScope, f.globals.globalTypeFunctionScope, undefined, dfg, [], new ConstraintGraph(), { constraintGeneratorRecursionLimit: limit });
      return { errors: generator.run(block).errors.map((error) => error.kind), incomplete: generator.recursionLimitMet };
    };
    expect(generate(150)).toEqual({ errors: ["CodeTooComplex"], incomplete: true });
    expect(generate(750)).toEqual({ errors: [], incomplete: false });
    expect(generate()).toEqual({ errors: ["CodeTooComplex"], incomplete: true });
  });
  test("audited configuration preserves numeric values and rejects unknown or malformed settings", () => {
    const result = checkerConfiguration({ LuauAddRecursionCounterToNonStrictTypeChecker: true }, {
      LuauNonStrictTypeCheckerRecursionLimit: 150,
      LuauConstraintGeneratorRecursionLimit: 750,
      LuauCheckRecursionLimit: 750,
    });
    expect(result.limits).toEqual({ addRecursionCounterToNonStrictTypeChecker: true, nonStrictRecursionLimit: 150, constraintGeneratorRecursionLimit: 750 });
    expect(result.inactiveLimits).toMatchObject([{ name: "LuauCheckRecursionLimit", value: 750 }]);
    expect(result.inactiveLimits[0]!.provenance).toContain("only in old-solver");
    expect(() => checkerConfiguration({ UnknownFlag: true })).toThrow("unsupported checker flag");
    expect(() => checkerConfiguration({}, { UnknownLimit: 750 })).toThrow("unsupported checker limit");
    expect(() => checkerConfiguration({}, { LuauNonStrictTypeCheckerRecursionLimit: 1.5 })).toThrow("invalid integer");
    expect(checkerConfiguration().limits).toEqual({});
  });
  test("magic annotation executes its real checker branch and remains isolated", () => {
    expect(check()).toEqual(["UnknownSymbol"]);
    expect(check({ debugMagicTypes: true })).not.toContain("UnknownSymbol");
    // Frontend currently suppresses a lone incomplete error, so the check returns no errors.
    expect(check({ debugMagicTypes: true })).toEqual([]);
    expect(check()).toEqual(["UnknownSymbol"]);
  });
  test("force-incomplete emits the actual diagnostic alongside another error in both checker modes", () => {
    for (const mode of [Mode.Nonstrict, Mode.Strict]) {
      const input = source();
      input.root.body.push(...source("OtherMissingType").root.body);
      const errors = new Frontend().checkSourceModule(input, mode, undefined, { debugMagicTypes: true }).errors;
      expect(errors.map((error) => error.kind)).toContain("ConstraintSolvingIncompleteError");
      expect(errors.filter((error) => error.kind === "UnknownSymbol")).toHaveLength(1);
      expect(() => checkerConfiguration({ DebugLuauMagicTypes: true }, {}, [source("_luau_print").root])).toThrow("unsupported debug magic type");
      expect(() => checkerConfiguration({ DebugLuauMagicTypes: true }, {}, [source().root])).not.toThrow();
    }
  });
  test("numeric recursion limit changes real visitation and counter flag controls it", () => {
    expect(check({ nonStrictRecursionLimit: 1 })).toEqual([]);
    expect(check({ nonStrictRecursionLimit: 750 })).toEqual(["UnknownSymbol"]);
    expect(check({ nonStrictRecursionLimit: 1, addRecursionCounterToNonStrictTypeChecker: false })).toEqual(["UnknownSymbol"]);
    expect(check()).toEqual(["UnknownSymbol"]);
  });
});
