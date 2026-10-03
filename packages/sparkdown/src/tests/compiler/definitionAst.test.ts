import { beforeAll, expect, test } from "vitest";
import { loadOfficialLuau, type Json } from "./officialLuau";
import { loadDefinitionAst } from "../../compiler/typecheck/DefinitionFile";
import { AstStatDeclareExternType, AstStatDeclareFunction, AstTableAccess } from "../../compiler/typecheck/Ast";
import { printOfficialAst } from "./printOfficialAst";
import builtin from "../../compiler/typecheck/definitions/builtin.json";
import typeFunctions from "../../compiler/typecheck/definitions/type-functions.json";
import checkedAbs from "./definition-fixtures/checked-abs.json";
import { Frontend, check } from "../../compiler/typecheck/Frontend";
import { Mode, type SourceModule } from "../../compiler/typecheck/Module";
import { errorToString } from "../../compiler/typecheck/Error";
import { toString } from "../../compiler/typecheck/ToString";
import { registerBuiltinGlobals } from "../../compiler/typecheck/BuiltinDefinitions";
import { get, follow } from "../../compiler/typecheck/Type";

let parse: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => { parse = await loadOfficialLuau(); });

function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected AST object");
  return value;
}

test("definition JSON retains extern property access and method semantics", () => {
  const result = parse("declare extern type V with\n read x: number\n function length(self): number\nend\n");
  expect(result.errors).toBe(0);
  const declaration = object((object(result.root)["body"] as Json[])[0]!);
  const props = declaration["props"] as Json[];
  expect(object(props[0]!)["access"]).toBe(1);
  expect(object(props[1]!)["isMethod"]).toBe(true);
});

test("definition JSON retains table property and indexer access", () => {
  const result = parse("declare v: { read x: number, read [string]: number }\n");
  expect(result.errors).toBe(0);
  const declaration = object((object(result.root)["body"] as Json[])[0]!);
  const table = object(declaration["luauType"] ?? declaration["type"]!);
  expect(object((table["props"] as Json[])[0]!)["access"]).toBe(1);
  expect(object(table["indexer"]!)["access"]).toBe(1);
});

test.each([["builtin", builtin], ["type-functions", typeFunctions], ["checked-abs", checkedAbs]] as const)(
  "%s definitions round-trip through real AST classes without losing the official JSON",
  (_, file) => {
    const root = loadDefinitionAst(file);
    expect(printOfficialAst(root)).toEqual(file.root);
  },
);

test("loaded vector properties remain read-only and checking data is isolated between loads", () => {
  const first = loadDefinitionAst(builtin);
  const vector = first.body.find((stat) => stat instanceof AstStatDeclareExternType && stat.name === "vector");
  expect(vector).toBeInstanceOf(AstStatDeclareExternType);
  expect((vector as AstStatDeclareExternType).props.map((prop) => prop.access)).toEqual([
    AstTableAccess.Read, AstTableAccess.Read, AstTableAccess.Read,
  ]);
  (vector as AstStatDeclareExternType).props.length = 0;
  const again = loadDefinitionAst(builtin).body.find((stat) => stat instanceof AstStatDeclareExternType && stat.name === "vector") as AstStatDeclareExternType;
  expect(again.props).toHaveLength(3);
});

test("checked declaration attributes and named parameters survive loading", () => {
  const declaration = loadDefinitionAst(checkedAbs).body[0] as AstStatDeclareFunction;
  expect(declaration).toBeInstanceOf(AstStatDeclareFunction);
  expect(declaration.isCheckedFunction()).toBe(true);
  expect(declaration.paramNames.map((arg) => arg.name)).toEqual(["n"]);
});

test("an old artifact without property access fails instead of silently making vector writable", () => {
  const original = structuredClone(builtin);
  const vector = original.root.body.find((stat) => stat["type"] === "AstStatDeclareClass");
  if (!vector) throw new Error("Vector definition is missing");
  delete (vector as unknown as { props: { access?: number }[] }).props[0]!.access;
  expect(() => loadDefinitionAst(original)).toThrow("no valid property access");
});

test("unsupported artifact versions fail visibly", () => {
  expect(() => loadDefinitionAst({ ...checkedAbs, version: 2 })).toThrow("Unsupported definition AST artifact");
});

test("the checker loads prepared definitions with the same checked function type", () => {
  const frontend = new Frontend();
  const sourceModule: SourceModule = {
    name: "@test", humanReadableName: "@test", root: loadDefinitionAst(checkedAbs),
    mode: Mode.Definition, hotcomments: [], parseErrors: [],
  };
  const module = check(sourceModule, Mode.Definition, [], frontend.builtinTypes, frontend.moduleResolver,
    frontend.globals.globalScope, frontend.globals.globalTypeFunctionScope, undefined);
  expect(module.errors.map(errorToString)).toEqual([]);
  const abs = module.declaredGlobals.get("abs");
  expect(abs).toBeDefined();
  expect(toString(abs!)).toBe("@checked (number) -> number");
});

test("Frontend loads prepared definition data and persists its checked function", () => {
  const frontend = new Frontend();
  const loaded = frontend.loadDefinitionFile(frontend.globals, frontend.globals.globalScope, checkedAbs, "@test");
  expect(loaded.success).toBe(true);
  expect(loaded.parseErrors).toEqual([]);
  const abs = frontend.globals.globalScope.bindings.get("abs");
  expect(abs).toBeDefined();
  expect(toString(abs!.typeId)).toBe("@checked (number) -> number");
});

test("builtin registration loads both prepared scopes and preserves vector read-only fields", () => {
  const frontend = new Frontend();
  registerBuiltinGlobals(frontend, frontend.globals);
  expect(frontend.globals.globalScope.bindings.has("math")).toBe(true);
  expect(frontend.globals.globalTypeFunctionScope.bindings.has("types")).toBe(true);
  const vector = frontend.globals.globalScope.exportedTypeBindings.get("vector");
  expect(vector).toBeDefined();
  const type = get(follow(vector!.type), "ExternType");
  expect(type).toBeDefined();
  expect(type!.props.get("x")?.readTy).toBeDefined();
  expect(type!.props.get("x")?.writeTy).toBeUndefined();
});
