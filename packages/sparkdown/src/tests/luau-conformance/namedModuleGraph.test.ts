import { describe, expect, it } from "vitest";
import {
  AstExprCall, AstExprConstantNumber, AstExprConstantString, AstExprGlobal, AstExprIndexName,
  AstExprFunction, AstExprLocal, AstExprTable, AstLocal, AstStatBlock, AstStatLocal, AstStatLocalFunction, AstStatReturn, QuoteStyle, TableItemKind,
  type AstExpr,
} from "../../compiler/typecheck/Ast";
import { addGlobalBinding, registerBuiltinGlobals } from "../../compiler/typecheck/BuiltinDefinitions";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { copyErrors, errorFields, errorToString, errorToStringWithContext, LuauTypeError, typeMismatch, TYPE_ERROR_KINDS } from "../../compiler/typecheck/Error";
import { Location, Position } from "../../compiler/typecheck/Location";
import { Mode } from "../../compiler/typecheck/Module";
import { toStringPack } from "../../compiler/typecheck/ToString";
import { first, follow, get, PrimitiveKind, TypeArena } from "../../compiler/typecheck/Type";
import { NamedModuleGraph, type NamedModuleSource } from "./namedModuleGraph";

const location = new Location(new Position(1, 0), new Position(1, 25));
function path(name: string): AstExpr {
  const [root, ...segments] = name.split("/");
  let expression: AstExpr = new AstExprGlobal(location, root!);
  for (const segment of segments)
    expression = new AstExprIndexName(location, expression, segment, location, location.begin, ".");
  return expression;
}
function requireCall(name: string): AstExprCall {
  return new AstExprCall(location, new AstExprGlobal(location, "require"), [path(name)], false, [], location);
}
function resolveName(_current: string, expr: AstExpr) {
  if (expr instanceof AstExprCall) expr = expr.args[0]!;
  const parts: string[] = [];
  while (expr instanceof AstExprIndexName) {
    parts.unshift(expr.index);
    expr = expr.expr;
  }
  if (!(expr instanceof AstExprGlobal)) return undefined;
  parts.unshift(expr.name);
  return { name: parts.join("/"), optional: false };
}
function frontend(): Frontend {
  const f = new Frontend();
  registerBuiltinGlobals(f, f.globals);
  addGlobalBinding(f.globals, "game", f.builtinTypes.anyType, "@luau");
  return f;
}

// These are direct AST support tests. They exercise the actual checker while
// #879 blocks the exact upstream require source in Sparkdown's parser.
function input(name: string, dependency?: string, exported: "table" | "number" = "table", directive = "strict"): NamedModuleSource {
  const module = new AstLocal("module", location, undefined, 0, 0, undefined);
  const peer = new AstLocal("peer", location, undefined, 0, 0, undefined);
  const table = new AstExprTable(location, [{ kind: TableItemKind.Record,
    key: new AstExprConstantString(location, "value", QuoteStyle.QuotedSimple), value: new AstExprConstantNumber(location, 2) }]);
  const statements = [new AstStatLocal(location, [module], [table], location)];
  if (dependency) statements.push(new AstStatLocal(location, [peer], [requireCall(dependency)], location));
  const result = exported === "table" ? new AstExprLocal(location, module, false) : new AstExprConstantNumber(location, 7);
  return {
    source: `${directive ? `--!${directive}\n` : ""}local module = { value = 2 }\n${dependency ? `local peer = require(${dependency.replaceAll("/", ".")})\n` : ""}return ${exported === "table" ? "module" : "7"}\n`,
    sourceModule: { name, humanReadableName: name, root: new AstStatBlock(location, [...statements, new AstStatReturn(location, [result])]),
      hotcomments: directive ? [{ header: true, location, content: directive }] : [], parseErrors: [] },
  };
}

describe("named module graph default pinned cycle path", () => {
  it("checks one entrypoint and keeps the dependency's genuine exported table", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const a = input("game/A", "game/B");
    const b = input("game/B", "game/A");
    graph.setSources([a, b]);
    expect(graph.getResult("game/B")).toBeUndefined();
    expect(() => graph.getReturnPack("game/B")).toThrow("no checked return pack");
    const checked = graph.check("game/A");
    expect(checked.module.name).toBe("game/A");
    const dependency = graph.getResult("game/B")!;
    expect(dependency.sourceModule).toBe(b.sourceModule);
    expect(dependency.source).toBe(b.source);
    expect(dependency.module.name).toBe("game/B");
    expect(graph.resolver.getModule("game/B")).toBe(dependency.module);
    expect(graph.getReturnPack("game/B")).toBe(dependency.module.returnType);
    expect(toStringPack(graph.getReturnPack("game/B"))).toBe("module");
    const table = get(follow(first(graph.getReturnPack("game/B"))!), "TableType")!;
    expect(table.props.has("value")).toBe(true);
    expect(graph.getResult("game/B")).toBe(dependency);
    expect(checked.errors.map((error) => error.data.kind)).toEqual(["ModuleHasCyclicDependency"]);
    expect(dependency.errors.map((error) => error.data.kind)).toEqual(["ModuleHasCyclicDependency"]);
    const error = dependency.errors[0]!;
    expect(error.moduleName).toBe("game/B");
    expect(error.location).toBe(location);
    expect(errorFields(error)).toEqual({ cycle: ["game/A", "game/B"] });
    expect(errorToString(error)).toBe("Cyclic module dependency: game/A -> game/B");
    expect(errorFields(checked.errors[0]!)).toEqual({ cycle: ["game/B", "game/A"] });
    expect(errorToString(checked.errors[0]!)).not.toBe(errorToString(error));
  });

  it("supplies real cycle paths so the checker resolves only cycle-leading requires to any", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), input("game/B", "game/A")]);
    expect(graph.requireCycles("game/A").map((c) => c.path)).toEqual([["game/B", "game/A"]]);
    expect(graph.requireCycles("game/B").map((c) => c.path)).toEqual([["game/A", "game/B"]]);
    graph.check("game/A");
    const peer = [...graph.getResult("game/B")!.module.getModuleScope()!.bindings].find(([key]) => key instanceof AstLocal && key.name === "peer")![1].typeId;
    expect(follow(peer).ty.kind).toBe("AnyType");
    expect(follow(first(graph.getReturnPack("game/B"))!).ty.kind).toBe("TableType");
  });

  it("has an acyclic control that imports the actual numeric dependency type", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), input("game/B", undefined, "number")]);
    expect(graph.requireCycles("game/A")).toEqual([]);
    graph.check("game/A");
    const peer = [...graph.getResult("game/A")!.module.getModuleScope()!.bindings].find(([key]) => key instanceof AstLocal && key.name === "peer")![1].typeId;
    expect(get(follow(peer), "PrimitiveType")?.type).toBe(PrimitiveKind.Number);
    expect(toStringPack(graph.getReturnPack("game/B"))).toBe("number");
  });

  it("invalidates parents and dependency identities across changed shared-session graphs", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const a = input("game/A", "game/B");
    graph.setSources([a, input("game/B", "game/A")]);
    const oldA = graph.check("game/A").module;
    const oldB = graph.getResult("game/B")!.module;
    graph.setSources([a, input("game/B", undefined, "number", "nonstrict")]);
    expect(graph.getResult("game/A")).toBeUndefined();
    expect(graph.getResult("game/B")).toBeUndefined();
    expect(graph.check("game/A").module).not.toBe(oldA);
    const b = graph.getResult("game/B")!.module;
    expect(b).not.toBe(oldB);
    expect(b.mode).toBe(Mode.Nonstrict);
    expect(graph.getResult("game/A")!.module.mode).toBe(Mode.Strict);
    // Negative control: looking up A or preserving the old table cannot pass.
    expect(toStringPack(graph.getReturnPack("game/B"))).toBe("number");
    expect(toStringPack(graph.getReturnPack("game/A"))).toBe("module");
  });

  it("isolates independent frontend sessions and never checks unrelated sources", () => {
    const firstGraph = new NamedModuleGraph(frontend(), resolveName);
    const secondGraph = new NamedModuleGraph(frontend(), resolveName);
    firstGraph.setSources([input("game/A", "game/B"), input("game/B", "game/A"), input("game/unused")]);
    secondGraph.setSources([input("game/A", "game/B"), input("game/B", undefined, "number")]);
    firstGraph.check("game/A");
    expect(secondGraph.getResult("game/B")).toBeUndefined();
    secondGraph.check("game/A");
    expect(firstGraph.getResult("game/unused")).toBeUndefined();
    expect(firstGraph.getReturnPack("game/B")).not.toBe(secondGraph.getReturnPack("game/B"));
    expect(toStringPack(firstGraph.getReturnPack("game/B"))).toBe("module");
    expect(toStringPack(secondGraph.getReturnPack("game/B"))).toBe("number");
  });

  it("handles a self-cycle with a top-level return", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/A")]);
    expect(graph.requireCycles("game/A").map((c) => c.path)).toEqual([["game/A"]]);
    graph.check("game/A");
    expect(toStringPack(graph.getReturnPack("game/A"))).toBe("module");
    expect(() => graph.check("game/A", Mode.Strict, true)).not.toThrow();
  });

  it("preserves nocheck suppression and the independent source identities", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const a = input("game/A", "game/B", "table", "nocheck");
    const b = input("game/B", "game/A");
    graph.setSources([a, b]);
    expect(graph.check("game/A").errors).toEqual([]);
    expect(graph.getResult("game/A")!.module.mode).toBe(Mode.NoCheck);
    expect(graph.getResult("game/B")!.module.mode).toBe(Mode.Strict);
    expect(graph.getResult("game/B")!.sourceModule).toBe(b.sourceModule);
    expect(graph.getResult("game/B")!.errors.map((e) => e.data.kind)).toEqual(["ModuleHasCyclicDependency"]);
  });

  it("registers and copies actual cycle diagnostics without losing their fields", () => {
    const f = frontend();
    const error = new LuauTypeError(location, { kind: "ModuleHasCyclicDependency", cycle: ["game/X", "game/Y"] }, "game/X");
    const errors = [error];
    expect(TYPE_ERROR_KINDS.has(error.kind)).toBe(true);
    expect(errorToString(error)).toBe("Cyclic module dependency: game/X -> game/Y");
    copyErrors(errors, new TypeArena(), f.builtinTypes);
    expect(errorFields(errors[0]!)).toEqual({ cycle: ["game/X", "game/Y"] });
    expect(errorToString(new LuauTypeError(location, { kind: "ModuleHasCyclicDependency", cycle: [] }))).toBe("Cyclic module dependency detected");
    expect(errorToString(new LuauTypeError(location, { kind: "UnknownRequire", modulePath: "missing" }))).toBe("Unknown require: missing");
  });

  it("rebuilds parents when an unmarked dependency's default mode changes", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), input("game/B", undefined, "number", "")]);
    const a = graph.check("game/A", Mode.Strict).module;
    const b = graph.getResult("game/B")!.module;
    expect(b.mode).toBe(Mode.Strict);
    expect(graph.check("game/A", Mode.Nonstrict).module).not.toBe(a);
    expect(graph.getResult("game/B")!.module).not.toBe(b);
    expect(graph.getResult("game/B")!.module.mode).toBe(Mode.Nonstrict);
    expect(graph.getResult("game/A")!.module.mode).toBe(Mode.Strict);
  });

  it("removes stale dependency results and preserves genuine unknown-require errors", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const a = input("game/A", "game/B");
    graph.setSources([a, input("game/B")]);
    graph.check("game/A");
    graph.setSources([a]);
    expect(graph.getResult("game/B")).toBeUndefined();
    expect(() => graph.getReturnPack("game/B")).toThrow("no checked return pack");
    expect(graph.check("game/A").errors.map((e) => e.data.kind)).toEqual(["UnknownRequire"]);
    expect(graph.requireCycles("game/A")).toEqual([]);
    expect(() => graph.check("game/absent")).toThrow("unknown entry module");
    expect(() => graph.setSources([a, a])).toThrow("duplicate named module");
  });
});

describe("named module graph enabled pinned cycle path", () => {
  it("executes returned-table cycles in enabled mode and keeps the actual dependency pack", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), input("game/B", "game/A")]);
    expect(() => graph.check("game/A", Mode.Strict, true)).not.toThrow();
    const dependency = graph.getResult("game/B")!;
    expect(dependency.module.mode).toBe(Mode.Strict);
    expect(toStringPack(graph.getReturnPack("game/B"))).toBe("module");
    expect(get(follow(first(graph.getReturnPack("game/B"))!), "TableType")?.props.has("value")).toBe(true);
    expect(errorFields(dependency.errors[0]!)).toEqual({ cycle: ["game/A", "game/B"] });
    expect(dependency.cyclicRequireTypeInference).toBe(true);
    expect(dependency.diagnosticMessage(dependency.errors[0]!)).toBe("Cyclic dependencies are only supported if all modules in the cycle use 'export' syntax. The following modules do not use 'export': game/A, game/B");
    expect(dependency.diagnosticMessage(dependency.errors[0]!)).not.toBe(errorToString(dependency.errors[0]!));
  });

  function noReturn(name: string, dependency: string): NamedModuleSource {
    const result = input(name, dependency);
    result.sourceModule.root.body = result.sourceModule.root.body.filter((statement) => !(statement instanceof AstStatReturn));
    result.source = result.source.replace("return module\n", "");
    return result;
  }

  it("filters only diagnostic members and preserves full solver cycle metadata", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), noReturn("game/B", "game/A")]);
    const checked = graph.check("game/A", Mode.Strict, true);
    const dependency = graph.getResult("game/B")!;
    expect(graph.requireCycles("game/B").map((cycle) => cycle.path)).toEqual([["game/A", "game/B"]]);
    expect(errorFields(dependency.errors[0]!)).toEqual({ cycle: ["game/A"] });
    expect(errorFields(checked.errors[0]!)).toEqual({ cycle: ["game/A"] });
    const peer = [...dependency.module.getModuleScope().bindings].find(([key]) => key instanceof AstLocal && key.name === "peer")![1].typeId;
    expect(follow(peer).ty.kind).toBe("AnyType");
    expect(dependency.diagnosticMessage(dependency.errors[0]!)).toBe("Cyclic dependencies are only supported if all modules in the cycle use 'export' syntax. The following modules do not use 'export': game/A");
  });

  it("uses whole component eligibility and retains cycles with an empty filtered report", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const b = noReturn("game/B", "game/A");
    b.sourceModule.root.body.push(new AstStatLocal(location, [new AstLocal("link", location, undefined, 0, 0, undefined)], [requireCall("game/C")], location));
    b.source += "local link = require(game.C)\n";
    graph.setSources([input("game/A", "game/B"), b, noReturn("game/C", "game/B")]);
    graph.check("game/A", Mode.Strict, true);
    const c = graph.getResult("game/C")!;
    expect(c.errors.map((error) => error.data.kind)).toEqual(["ModuleHasCyclicDependency"]);
    expect(errorFields(c.errors[0]!)).toEqual({ cycle: [] });
    expect(c.diagnosticMessage(c.errors[0]!)).toBe("Cyclic dependencies are only supported if all modules in the cycle use 'export' syntax");
    expect(graph.requireCycles("game/C").map((cycle) => cycle.path)).toEqual([["game/B", "game/C"]]);
  });

  it("rejects eligible no-return components even when a returning parent requires them", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/entry", "game/A"), noReturn("game/A", "game/B"), noReturn("game/B", "game/A")]);
    expect(() => graph.check("game/entry", Mode.Strict, true)).toThrow("all-no-return cyclic named module component");
    expect(graph.getResult("game/A")).toBeUndefined();
    expect(graph.getResult("game/entry")).toBeUndefined();
    // A disconnected unsupported component does not change the entry graph.
    graph.setSources([input("game/entry"), noReturn("game/A", "game/B"), noReturn("game/B", "game/A")]);
    expect(() => graph.check("game/entry", Mode.Strict, true)).not.toThrow();
    expect(graph.getResult("game/A")).toBeUndefined();
  });

  it("recognizes that a nested function return does not make a self-cycle ineligible", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    const source = noReturn("game/A", "game/A");
    const fn = new AstExprFunction(location, [], [], [], undefined, [], false, location,
      new AstStatBlock(location, [new AstStatReturn(location, [new AstExprConstantNumber(location, 1)])]), 1, "nested", undefined, undefined, location);
    source.sourceModule.root.body.push(new AstStatLocalFunction(location, new AstLocal("nested", location, undefined, 0, 0, undefined), fn));
    source.source += "local function nested() return 1 end\n";
    graph.setSources([source]);
    expect(() => graph.check("game/A", Mode.Strict, true)).toThrow("separate SCC solver path");
    expect(() => graph.check("game/A", Mode.Strict, false)).not.toThrow();
  });

  it("invalidates results across enabled/default transitions while retaining each result's print context", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), noReturn("game/B", "game/A")]);
    graph.check("game/A", Mode.Strict, false);
    const prior = graph.getResult("game/B")!;
    expect(errorFields(prior.errors[0]!)).toEqual({ cycle: ["game/A", "game/B"] });
    graph.check("game/A", Mode.Strict, true);
    const enabled = graph.getResult("game/B")!;
    expect(enabled.module).not.toBe(prior.module);
    expect(errorFields(enabled.errors[0]!)).toEqual({ cycle: ["game/A"] });
    expect(prior.diagnosticMessage(prior.errors[0]!)).toBe("Cyclic module dependency: game/A -> game/B");
    expect(enabled.diagnosticMessage(enabled.errors[0]!)).toContain("do not use 'export': game/A");
    graph.check("game/A", Mode.Strict, false);
    expect(graph.getResult("game/B")!.module).not.toBe(enabled.module);
    expect(errorFields(graph.getResult("game/B")!.errors[0]!)).toEqual({ cycle: ["game/A", "game/B"] });
  });

  it("prints enabled empty/raw/human-readable cycles and retains defaults for ordinary diagnostics", () => {
    const error = new LuauTypeError(location, { kind: "ModuleHasCyclicDependency", cycle: ["game/X", "game/Y"] });
    const context = { cyclicRequireTypeInference: true, getHumanReadableModuleName: (name: string) => name.replaceAll("/", ".") };
    expect(errorToStringWithContext(error, context)).toBe("Cyclic dependencies are only supported if all modules in the cycle use 'export' syntax. The following modules do not use 'export': game.X, game.Y");
    expect(errorToStringWithContext(error, { ...context, cyclicRequireTypeInference: false })).toBe("Cyclic module dependency: game.X -> game.Y");
    expect(errorFields(error)).toEqual({ cycle: ["game/X", "game/Y"] });
    expect(errorToStringWithContext(new LuauTypeError(location, { kind: "ModuleHasCyclicDependency", cycle: [] }), context)).toBe("Cyclic dependencies are only supported if all modules in the cycle use 'export' syntax");
    const ordinary = new LuauTypeError(location, { kind: "UnknownRequire", modulePath: "missing" });
    expect(errorToStringWithContext(ordinary, context)).toBe(errorToString(ordinary));
    const f = frontend();
    const nested = new LuauTypeError(location, typeMismatch(f.builtinTypes.stringType, f.builtinTypes.numberType, { error }));
    expect(errorToStringWithContext(nested, context)).toContain("The following modules do not use 'export': game.X, game.Y");
    expect(errorToString(nested)).toContain("Cyclic module dependency: game/X -> game/Y");
  });

  it("preserves acyclic execution and nocheck suppression in enabled mode", () => {
    const graph = new NamedModuleGraph(frontend(), resolveName);
    graph.setSources([input("game/A", "game/B"), input("game/B", undefined, "number", "nonstrict")]);
    expect(graph.check("game/A", Mode.Strict, true).errors).toEqual([]);
    expect(graph.getResult("game/B")!.module.mode).toBe(Mode.Nonstrict);
    expect(toStringPack(graph.getReturnPack("game/B"))).toBe("number");
    graph.setSources([input("game/A", "game/B", "table", "nocheck"), input("game/B", "game/A")]);
    expect(graph.check("game/A", Mode.Strict, true).errors).toEqual([]);
    expect(graph.getResult("game/B")!.errors.map((error) => error.data.kind)).toEqual(["ModuleHasCyclicDependency"]);
  });
});
