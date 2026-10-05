import { afterEach, beforeEach, expect, it } from "vitest";
import { NativeCheckedType, nativeQuery, nativeScopes } from "../../luau-conformance/typecheckNativeQueries";
import { nativeDiagnostic } from "../../luau-conformance/typecheckNativeDiagnostics";
import { aliasScopeLocationsSource, duplicateAliasLocationSource, exportedAliasLocationSource, exportedTypeFunctionLocationSource, immutableUnionTagSource, inferredGenericAnnotationSource } from "./fixtureSources";
import { runAssertions } from "../../luau-conformance/typecheck/portedCases";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";

let fixture: NativeFixture;
beforeEach(async () => { fixture = await loadNativeFixture(); });
afterEach(() => { fixture?.dispose(); });

it("projects the exact original ordered union-tag causes and native reason discriminant", () => {
  fixture.create("Fixture"); fixture.source("MainModule",immutableUnionTagSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics.length).toBeGreaterThan(0);
  const error = result.diagnostics[0]!; expect(error.kind).toBe("CannotAssignToNever");
  const facts = fixture.errorFacts(result,error.nativeIndex);
  expect(fixture.identical(facts.types["rhsType"]!,fixture.builtin(result,"string"))).toBe(true);
  const mapped = nativeDiagnostic(fixture,result,error);
  expect(mapped.data).toMatchObject({ rhsType:"string", reason:"PropertyNarrowed", cause:['"Dog"','"Cat"'] });
  expect(mapped.data?.["cause"]).not.toEqual(['"Cat"','"Dog"']);
});

it("projects optional previous native location as actual begin/end positions for original field predicates", () => {
  fixture.create("Fixture"); fixture.source("MainModule",duplicateAliasLocationSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(1);
  const mapped = nativeDiagnostic(fixture,result,result.diagnostics[0]!);
  const missing = (): never => { throw Error("location assertion requested a type query"); };
  runAssertions({ checked:true, syntaxDiagnostics:[], compilerMessages:[], diagnostics:[mapped], typeOf:missing, find:missing, decoratedSource:missing },
    { source:duplicateAliasLocationSource, expect:[{ error:0,code:"DuplicateTypeDefinition",fields:{name:"B"},
      fieldLocations:{previousLocation:{present:true,line:2}} }] });
});

it("rejects cached diagnostic field queries after result invalidation, reset and disposal", () => {
  const observe = () => {
    fixture.create("Fixture"); fixture.source("MainModule","local value = missing");
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(1);
    const diagnostic = nativeDiagnostic(fixture,result,result.diagnostics[0]!);
    expect(diagnostic.data).toMatchObject({name:"missing",context:"Binding"});
    return diagnostic;
  };
  const changed = observe(); fixture.source("MainModule","return 1");
  expect(() => changed.data).toThrow("Stale native result handle");
  const reset = observe(); fixture.reset();
  expect(() => reset.fields!({})).toThrow("Stale native result handle");
  const disposed = observe(); fixture.dispose();
  expect(() => disposed.data).toThrow("Disposed native fixture host");
});

it("maps real function and return-pack observations while preserving raw equality and explicit follow", async () => {
  fixture.create("Fixture");
  fixture.source("MainModule", "local function f(x: number, y: string): (boolean, number) return true, x end\nlocal n: number = 1\nreturn n, f");
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const number = nativeQuery(fixture, result, "MainModule", { type: "n" });
  expect(number.kind).toBe("PrimitiveType"); expect(number.print()).toBe("number");
  const bound = new NativeCheckedType(fixture, fixture.boundControl(fixture.mainType(result, "n")));
  expect(bound.print()).toBe(number.print()); expect(bound.is(number)).toBe(false); expect(bound.follow().is(number)).toBe(true);
  const fn = nativeQuery(fixture, result, "MainModule", { type: "f" });
  // ConstraintGenerator.cpp4453 retains a hidden Variadic(any) tail even when
  // source parameters are not variadic. Native printing hides that real tail.
  expect(fn.kind).toBe("FunctionType"); expect(fn.arguments).toEqual({ length: 2, tail: true, tailKind: "VariadicTypePack" });
  expect(fn.print()).not.toContain("...");
  expect(fn.results?.map(value => value.print())).toEqual(["boolean", "number"]);
  expect(nativeQuery(fixture, result, "MainModule", { type: "f", path: [{ argument: 1 }] }).print()).toBe("string");
  const returned = nativeQuery(fixture, result, "MainModule", { moduleReturn: true });
  expect(returned.kind).toBe("TypePack"); expect(returned.results?.[0]?.is(number)).toBe(true);
  const boundPack = new NativeCheckedType(fixture, fixture.boundPackControl(fixture.modulePack(result, "MainModule")));
  expect(boundPack.is(returned)).toBe(false); expect(boundPack.follow().is(returned)).toBe(true);
  const peer = await loadNativeFixture();
  try {
    peer.create("Fixture"); peer.source("MainModule", "local n: number = 1"); const other = peer.check("MainModule");
    expect(() => number.is(nativeQuery(peer, other, "MainModule", { type: "n" }))).toThrow("same fixture instance");
  } finally { peer.dispose(); }
  fixture.source("MainModule", "return 'changed'"); expect(() => number.print()).toThrow("Stale native result handle");
});

it("maps actual diagnostic fields and original indices through annotation filtering with a wrong-index control", () => {
  fixture.create("Fixture"); fixture.flag("DebugLuauForceOldSolver", false); fixture.flag("LuauExportValueSyntax", true);
  fixture.flag("DebugLuauWarnOnUnannotatedTopLevelFunctions", true);
  fixture.source("MainModule", inferredGenericAnnotationSource + "\nlocal wrong: number = 'bad'");
  const result = fixture.check("MainModule");
  const filtered = result.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired");
  expect(filtered).toHaveLength(1); const error = filtered[0]!;
  expect(error.kind).toBe("TypeMismatch"); expect(error.nativeIndex).not.toBe(0);
  const diagnostic = nativeDiagnostic(fixture, result, error);
  expect(diagnostic.nativeIndex).toBe(error.nativeIndex);
  expect(diagnostic.data).toMatchObject({ wantedType: "number", givenType: "string", context: "CovariantContext" });
  expect(diagnostic.fields?.({ wantedType: { exhaustive: true } })["wantedType"]).toBe("number");
  expect(() => diagnostic.fields?.({ reason: {} })).toThrow("not a type or pack");
  const wanted = nativeQuery(fixture, result, "MainModule", { diagnosticType: [0, "wantedType"] }, filtered.map(value => value.nativeIndex));
  expect(wanted.is(nativeQuery(fixture, result, "MainModule", { builtin: "number" }))).toBe(true);
  expect(() => nativeQuery(fixture, result, "MainModule", { diagnosticType: [0, "wantedType"] })).toThrow("Absent native diagnostic type or pack field");
  expect(() => nativeDiagnostic(fixture, result, { ...error })).toThrow("does not belong");
});

it("observes declared TypeFun metadata separately from instantiated types and exported lookup", () => {
  fixture.create("Fixture"); fixture.source("MainModule", "export type Box<T> = { value: T }\nexport type Callback<T> = (T) -> T\nlocal box: Box<number> = { value = 1 }\nlocal callback: Callback<number> = function(x) return x end");
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(nativeQuery(fixture, result, "MainModule", { type: "box" }).instantiatedTypeParameterCount).toBe(1);
  const declared = nativeQuery(fixture, result, "MainModule", { alias: "Callback" });
  expect(declared.typeParameterCount).toBe(1);
  expect(declared.genericCount).toBe(0);
  expect(nativeQuery(fixture, result, "MainModule", { alias: "Box", path: [{ typeParameter: 0 }] }).kind).toBe("GenericType");
  expect(nativeQuery(fixture, result, "MainModule", { exportedAlias: "Box" }).is(nativeQuery(fixture, result, "MainModule", { alias: "Box" }))).toBe(true);
  expect(nativeQuery(fixture, result, "MainModule", { builtin: "unknown" }).kind).toBe("UnknownType");
});

it("retains native declared type/pack defaults and distinct imported/exported lookup", () => {
  // Native Fixture has no require/game globals. The pinned BuiltinsFixture
  // supplies registerBuiltinGlobals + registerTestTypes for actual imports.
  fixture.create("BuiltinsFixture");
  fixture.source("game/Types", "export type Box<T = number, U... = (string, boolean)> = { value: T, call: (U...) -> () }\ntype Private = number\nreturn {}");
  fixture.source("MainModule", "local Import = require(game.Types)\nlocal box: Import.Box = { value = 1, call = function(s, b) end }");
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const declared = fixture.typeFun(result, "MainModule", "Box", "imported", "Import");
  expect(declared.parameters).toHaveLength(1); expect(declared.packParameters).toHaveLength(1);
  expect(fixture.facts(declared.parameters[0]!.type).kind).toBe("generic");
  expect(fixture.printed(declared.parameters[0]!.default!)).toBe("number");
  expect(fixture.packFacts(declared.packParameters[0]!.type, false).tailKind).toBe("generic");
  expect(fixture.printedPack(declared.packParameters[0]!.default!)).toBe("string, boolean");
  expect(nativeQuery(fixture, result, "MainModule", { importedAlias: ["Import", "Box"] }).typeParameterCount).toBe(1);
  expect(nativeQuery(fixture, result, "MainModule", { importedAlias: ["Import", "Box"], path: [{ typeParameter: 0 }] }).kind).toBe("GenericType");
  expect(() => fixture.typeFun(result, "MainModule", "Box")).toThrow("Missing native TypeFun");
  expect(() => fixture.typeFun(result, "game/Types", "Private", "exported")).toThrow("Missing native TypeFun");
  expect(() => fixture.typeFun(result, "MainModule", "Box", "imported", "Wrong")).toThrow("Missing native TypeFun");
  expect(nativeScopes(fixture, result, "MainModule")[0]?.imports["Import"]).toBe("game/Types");
  fixture.clearFrontend(); expect(() => fixture.facts(declared.type)).toThrow("Stale native result handle");
});

it("observes original exported alias and type-function locations from the pinned module export map", () => {
  fixture.create("Fixture"); fixture.source("MainModule", exportedAliasLocationSource);
  let result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(nativeQuery(fixture, result, "MainModule", { exportedAlias: "Value" }).definitionLocation).toEqual([1, 8, 1, 34]);
  fixture.source("MainModule", exportedTypeFunctionLocationSource); result = fixture.check("MainModule");
  expect(result.diagnostics).toEqual([]);
  expect(nativeQuery(fixture, result, "MainModule", { exportedAlias: "Apply" }).definitionLocation).toEqual([1, 8, 2, 11]);
});

it("preserves native scope order and lexical alias-name location ownership", () => {
  fixture.create("Fixture"); fixture.source("MainModule", aliasScopeLocationsSource);
  const result = fixture.check("MainModule"), scopes = nativeScopes(fixture, result, "MainModule");
  expect(result.diagnostics).toEqual([]); expect(scopes.length).toBeGreaterThan(0);
  expect(scopes[0]?.aliases["T"]).toEqual([1, 13, 1, 14]);
  const nested = scopes.find(scope => scope.aliases["X"]);
  expect(nested?.aliases["T"]).toEqual([4, 17, 4, 18]); expect(nested?.aliases["X"]).toEqual([5, 17, 5, 18]);
  expect(scopes[0]?.aliases["X"]).toBeUndefined();
});

it("reports actual native variant, name and own property location observations without printed inference", () => {
  fixture.create("Fixture");
  fixture.source("MainModule", "type Named = { value: number }\nlocal named: Named = { value = 1 }\nlocal singleton: 'exact' = 'exact'\nlocal both: ((number) -> number) & ((string) -> string)\nlocal function empty() end");
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(nativeQuery(fixture, result, "MainModule", { type: "named" }).name).toBe("Named");
  expect(nativeQuery(fixture, result, "MainModule", { type: "named" }).propertyNames).toEqual(["value"]);
  // ConstraintGenerator.cpp4691 sets typeLocation for an annotation property;
  // Parser.cpp2930 uses its name token. It does not set declaration location.
  expect(nativeQuery(fixture, result, "MainModule", { type: "named" }).propertyLocations?.["value"])
    .toEqual({ location: null, typeLocation: [0, 15, 0, 20] });
  expect(nativeQuery(fixture, result, "MainModule", { type: "singleton" }).kind).toBe("SingletonType");
  expect(nativeQuery(fixture, result, "MainModule", { type: "both" }).kind).toBe("IntersectionType");
  for (const [builtin, kind] of [["any", "AnyType"], ["error", "ErrorType"], ["never", "NeverType"], ["unknown", "UnknownType"]] as const)
    expect(nativeQuery(fixture, result, "MainModule", { builtin }).kind).toBe(kind);
  expect(nativeQuery(fixture, result, "MainModule", { builtin: "function" }).print()).toBe("function");
  expect(nativeQuery(fixture, result, "MainModule", { builtin: "table" }).print()).toBe("table");
});

it("searches actual extern parents for shared selectors while retaining own-property API semantics", () => {
  fixture.create("ExternTypeFixture"); fixture.source("MainModule", "local child: ChildClass\nlocal grand: GrandChild");
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const child = fixture.mainType(result, "child");
  expect(fixture.propertyNames(child)).not.toContain("BaseField");
  expect(() => fixture.child(child, "read", "BaseField")).toThrow("Missing native own property");
  const parent = fixture.child(child, "parent");
  expect(fixture.propertyNames(parent)).toContain("BaseField");
  const inherited = nativeQuery(fixture, result, "MainModule", { type: "child", path: [{ property: "BaseField" }] });
  expect(inherited.is(nativeQuery(fixture, result, "MainModule", { builtin: "number" }))).toBe(true);
  expect(nativeQuery(fixture, result, "MainModule", { type: "grand", path: [{ property: "BaseField" }] }).is(inherited)).toBe(true);
  expect(() => nativeQuery(fixture, result, "MainModule", { type: "child", path: [{ property: "Absent" }] })).toThrow();
});
