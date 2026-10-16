import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { clearFirstSource, clearSecondSource, cycleModuleA, cycleModuleB, decoratedExpected, decoratedSource, explicitNewSource, graphCountSource,
  hiddenFunctionSource, instantiatedFirstSource, instantiatedSecondSource, matchingOverloadSource, mixedPolaritySource,
  noLossyFunctionSource, positionRefinementSource, recursiveDefinitionSource, variadicSource,
  duplicatePropertyDefinition, nonClassSuperclassDefinition, cyclicSuperclassDefinition,
  incorrectGenericCountSource, duplicateGenericSource, missingPropertiesSource, detailedPropertySource, badMetatableTypeFunctionSource,
  normalizeRefinementSource, instanceRefinementSource, folderPartRefinementSource, inferredGenericAnnotationSource } from "./fixtureSources";

describe("official native query vocabulary", () => {
  let fixture: NativeFixture;
  beforeEach(async () => { fixture = await loadNativeFixture(); });
  afterEach(() => { fixture?.dispose(); });

  it("keeps raw native identity distinct from explicit follow for real bound types and packs", () => {
    fixture.create("Fixture"); fixture.source("MainModule", "local value = 1\nreturn value");
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    const target = fixture.builtin(result, "number"), bound = fixture.boundControl(target);
    expect(fixture.printed(bound)).toBe(fixture.printed(target));
    expect(fixture.identical(bound, target)).toBe(false);
    expect(fixture.identical(fixture.follow(bound), target)).toBe(true);
    expect(fixture.identical(fixture.follow(target), target)).toBe(true);
    const pack = fixture.modulePack(result, "MainModule"), boundPack = fixture.boundPackControl(pack);
    expect(fixture.printedPack(boundPack)).toBe(fixture.printedPack(pack));
    expect(fixture.identicalPack(boundPack, pack)).toBe(false);
    expect(fixture.identicalPack(fixture.followPack(boundPack), pack)).toBe(true);
    expect(fixture.identicalPack(fixture.followPack(pack), pack)).toBe(true);
    fixture.source("MainModule", "return 'new'");
    for (const query of [() => fixture.follow(bound), () => fixture.followPack(boundPack), () => fixture.normalized(bound)])
      expect(query).toThrow("Stale native result handle");
  });

  it("executes the exact native refinement Normalizer recipe and retains its real arena", () => {
    fixture.create("Fixture"); fixture.source("MainModule", normalizeRefinementSource);
    const result = fixture.check("MainModule");
    expect(result.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).toEqual([]);
    expect(fixture.printed(fixture.positionType(result, "MainModule", 3, 33))).toBe("unknown");
    const normalized = fixture.normalized(fixture.positionType(result, "MainModule", 3, 36));
    expect(fixture.printed(normalized)).toBe("string?");
    const other = fixture.normalized(fixture.builtin(result, "number"));
    expect(fixture.printed(other)).toBe("number"); expect(fixture.printed(normalized)).toBe("string?");
    expect(fixture.identical(normalized, fixture.builtin(result, "number"))).toBe(false);
    fixture.clearFrontend(); expect(() => fixture.printed(normalized)).toThrow("Stale native result handle");
    expect(() => fixture.normalized(fixture.builtin(fixture.context(), "number"))).toThrow("Native context has no check result");
  });

  it("uses the exact pinned refinement extern graph and IsA magic across a SAME fixture", () => {
    fixture.create("RefinementExternTypeFixture");
    const setup = fixture.context();
    const instance = fixture.globalAlias(setup, "Instance"), part = fixture.globalAlias(setup, "Part");
    expect(fixture.identical(fixture.child(part, "parent"), instance)).toBe(true);
    expect(fixture.facts(fixture.child(instance, "read", "IsA")).kind).toBe("function");
    expect(fixture.identical(fixture.child(fixture.globalAlias(setup, "Vector3"), "read", "X"), fixture.builtin(setup, "number"))).toBe(true);
    expect(fixture.printed(fixture.child(fixture.globalAlias(setup, "WeldConstraint"), "read", "Part0"))).toBe("Part?");
    fixture.source("MainModule", instanceRefinementSource);
    const first = fixture.check("MainModule"); expect(first.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.positionType(first, "MainModule", 3, 28))).toBe("Folder");
    expect(fixture.printed(fixture.positionType(first, "MainModule", 5, 28))).toBe("never");
    fixture.source("MainModule", folderPartRefinementSource);
    const second = fixture.check("MainModule"); expect(second.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.positionType(second, "MainModule", 3, 28))).toBe("Folder");
    expect(fixture.printed(fixture.positionType(second, "MainModule", 5, 28))).toBe("Part");
    expect(() => fixture.printed(instance)).toThrow("Stale native result handle");
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", instanceRefinementSource);
    expect(fixture.check("MainModule").diagnostics.some(error => error.kind === "UnknownSymbol")).toBe(true);
  });

  it("keeps original diagnostic indices when annotation errors are filtered before native queries", () => {
    fixture.create("Fixture");
    fixture.flag("DebugLuauForceOldSolver", false); fixture.flag("LuauExportValueSyntax", true);
    fixture.flag("DebugLuauWarnOnUnannotatedTopLevelFunctions", true);
    fixture.source("MainModule", inferredGenericAnnotationSource);
    const original = fixture.check("MainModule"); expect(original.diagnostics).toHaveLength(1);
    expect(original.diagnostics[0]?.kind).toBe("TypeAnnotationRequired");
    expect(original.diagnostics[0]?.message).toBe("Type annotation required here.  Consider <T>(x: T) -> T");
    // Original indicate_an_inferred_generic source/setup plus a disclosed wrong-assignment control.
    fixture.source("MainModule", inferredGenericAnnotationSource + "\nlocal wrong: number = 'bad'");
    const result = fixture.check("MainModule");
    expect(result.diagnostics.map(error => error.nativeIndex)).toEqual(result.diagnostics.map((_, index) => index));
    expect(result.diagnostics.some(error => error.kind === "TypeAnnotationRequired")).toBe(true);
    const filtered = result.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired");
    const mismatch = filtered.find(error => error.kind === "TypeMismatch")!;
    expect(mismatch).toBeDefined();
    expect(mismatch.nativeIndex).not.toBe(filtered.indexOf(mismatch));
    const facts = fixture.errorFacts(result, mismatch.nativeIndex);
    expect(facts.kind).toBe(mismatch.kind); expect(facts.begin).toEqual(mismatch.begin); expect(facts.end).toEqual(mismatch.end);
    expect(fixture.identical(facts.types["wanted"]!, fixture.builtin(result, "number"))).toBe(true);
    expect(fixture.identical(facts.types["given"]!, fixture.builtin(result, "string"))).toBe(true);
    expect(fixture.errorFacts(result, filtered.indexOf(mismatch)).kind).not.toBe("TypeMismatch");
    expect(fixture.mismatchErrorEquals(result, mismatch.nativeIndex, fixture.builtin(result, "number"), fixture.builtin(result, "string"),
      [mismatch.begin.line, mismatch.begin.column, mismatch.end.line, mismatch.end.column])).toBe(true);
  });

  it("retains exact annotation error fields and native generic parameter identities", () => {
    fixture.create("Fixture"); fixture.source("MainModule", incorrectGenericCountSource);
    const first = fixture.check("MainModule"); expect(first.diagnostics).toHaveLength(1);
    expect(first.diagnostics[0]?.begin.line).toBe(2);
    expect(first.diagnostics[0]?.message).toBe("Generic type 'Callback<A, R>' expects 2 type arguments, but 3 are specified");
    const error = fixture.errorFacts(first, 0);
    expect(error.kind).toBe("IncorrectGenericParameterCount");
    expect(error.fields).toMatchObject({ name: "Callback", actualParameters: 3, typeParamsCount: 2, actualPackParameters: 0, typePackParamsCount: 0 });
    expect(fixture.facts(error.types["typeParam:0"]!).kind).toBe("generic");
    expect(fixture.facts(error.types["typeParam:1"]!).kind).toBe("generic");
    expect(fixture.identical(error.types["typeParam:0"]!, error.types["typeParam:1"]!)).toBe(false);
    expect(error.begin).toEqual(first.diagnostics[0]?.begin); expect(error.end).toEqual(first.diagnostics[0]?.end);
    fixture.source("MainModule", duplicateGenericSource);
    const second = fixture.check("MainModule"); expect(second.diagnostics).toHaveLength(1);
    expect(fixture.errorFacts(second, 0)).toMatchObject({ kind: "DuplicateGenericParameter", fields: { parameterName: "T" } });
    expect(() => fixture.printed(error.types["typeParam:0"]!)).toThrow("Stale");
  });

  it("preserves ordered MissingProperties collections and actual selected-New mismatch reason", () => {
    fixture.create("Fixture"); fixture.flag("LuauFixIndexerSubtypingOrdering", true);
    fixture.source("MainModule", missingPropertiesSource);
    const first = fixture.check("MainModule"); expect(first.diagnostics).toHaveLength(2);
    for (let index = 0; index < 2; index++) {
      const error = fixture.errorFacts(first, index);
      expect(error.kind).toBe("MissingProperties"); expect(error.strings["properties"]).toEqual(["prop"]);
      expect(fixture.identical(fixture.child(error.types["superType"]!, "read", "prop"), fixture.builtin(first, "boolean"))).toBe(true);
      expect(() => fixture.child(error.types["subType"]!, "read", "prop")).toThrow("Missing native own property: prop");
    }
    fixture.flag("LuauNewTypePathErrorMessages", true); fixture.source("MainModule", detailedPropertySource);
    const second = fixture.check("MainModule"); expect(second.diagnostics.length).toBeGreaterThan(0);
    expect(second.diagnostics[0]?.message).toBe("Expected this to be 'B', but got 'A'; \nExpected property `b.y` to be exactly `string`, but got `number`");
    const mismatch = fixture.errorFacts(second, 0);
    expect(mismatch.kind).toBe("TypeMismatch"); expect(mismatch.fields["reason"]).not.toBe("");
    // Pinned TypeChecker2.cpp3675 constructs this selected-New error with a reason and no nested error.
    expect(mismatch.fields["nestedErrorPresent"]).toBe(false);
    expect(fixture.printed(mismatch.types["wanted"]!)).toBe("B"); expect(fixture.printed(mismatch.types["given"]!)).toBe("A");
    expect(() => fixture.errorFacts(second, 0, 1)).toThrow("Absent native nested TypeMismatch error");
    expect(() => fixture.errorFacts(second, 0, 9)).toThrow("Native nested error observation limit");
  });

  it("observes the exact official VM runtime error data rather than deriving it from text", () => {
    fixture.create("BuiltinsFixture"); fixture.flag("DebugLuauForceOldSolver", false);
    fixture.source("MainModule", badMetatableTypeFunctionSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(2);
    const error = fixture.errorFacts(result, 0);
    expect(error.kind).toBe("UserDefinedTypeFunctionError");
    expect(error.fields["message"]).toBe("'badmetatable' type function errored at runtime: [string \"badmetatable\"]:3: types.newtable: expected to be given a table type as a metatable, but got number instead");
    expect(error.types).toEqual({}); expect(error.packs).toEqual({});
    expect(() => fixture.errorFacts(result, 0, 1)).toThrow("Absent native nested TypeMismatch error");
  });

  it("uses exact native positions for truthy refinements and function self metadata", () => {
    fixture.create("Fixture"); fixture.source("MainModule", positionRefinementSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.positionType(result, "MainModule", 3, 26))).toBe("string");
    expect(fixture.printed(fixture.positionType(result, "MainModule", 5, 26))).toBe("nil");
    expect(() => fixture.positionType(result, "MainModule", 50, 0)).toThrow("Absent native position type");
    fixture.source("MainModule", noLossyFunctionSource);
    const second = fixture.check("MainModule");
    expect(second.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).toEqual([]);
    const type = fixture.positionType(second, "MainModule", 6, 14);
    expect(fixture.printed(type)).toBe("(unknown, number, number) -> number");
    expect(fixture.facts(type)).toMatchObject({ kind: "function", hasSelf: true });
  });

  it("queries the actual penultimate call AST and recorded matching overload", () => {
    fixture.create("Fixture"); fixture.source("MainModule", matchingOverloadSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    const overload = fixture.overloadAt(result, "MainModule", 3, 10);
    expect(overload.ancestry).toBeGreaterThanOrEqual(2);
    expect(overload.expression).toBe(true); expect(overload.call).toBe(true); expect(overload.resolved).not.toBeNull();
    expect(fixture.printed(overload.resolved!)).toBe("(number) -> number");
    expect(fixture.overloadAt(result, "MainModule", 50, 0).resolved).toBeNull();
  });

  it("observes native generic Mixed polarity without inventing a no-error assertion", () => {
    fixture.create("Fixture"); fixture.source("MainModule", mixedPolaritySource);
    const result = fixture.check("MainModule");
    const functionType = fixture.mainType(result, "f"); expect(fixture.facts(functionType).kind).toBe("function");
    expect(fixture.facts(fixture.child(functionType, "generic", "", 0))).toMatchObject({ kind: "generic", polarity: 3 });
    expect(() => fixture.child(functionType, "generic", "", 1)).toThrow("Invalid native generic index");
  });

  it("keeps actual versus expected position types and exact native decoration separate", () => {
    fixture.create("Fixture"); fixture.source("MainModule", "local x: number = 'wrong'");
    const mismatch = fixture.check("MainModule"); expect(mismatch.diagnostics).toHaveLength(1);
    const actual = fixture.positionType(mismatch, "MainModule", 0, 19);
    const expected = fixture.positionType(mismatch, "MainModule", 0, 19, true);
    expect(fixture.printed(actual)).toBe("string"); expect(fixture.printed(expected)).toBe("number");
    expect(fixture.identical(actual, expected)).toBe(false);
    fixture.reset(); fixture.source("MainModule", decoratedSource);
    const result = fixture.check("MainModule"); // Exact PrettyPrinter attach_types does not assert errors.
    expect(fixture.decorated(result, "MainModule")).toBe(decoratedExpected);
  });

  it("preserves both exact type-alias checks and instantiated type/pack metadata", () => {
    fixture.create("Fixture"); fixture.source("MainModule", instantiatedFirstSource);
    const first = fixture.check("MainModule"); expect(first.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.alias(first, "MainModule", "Packed"))).toBe("(T...) -> (T...)");
    for (const [name, printed] of [["a", "() -> ()"], ["b", "(number) -> number"], ["c", "(string, number) -> (string, number)"]])
      expect(fixture.printed(fixture.mainType(first, name!))).toBe(printed);
    fixture.source("MainModule", instantiatedSecondSource);
    const second = fixture.check("MainModule"); expect(second.diagnostics).toEqual([]);
    const alias = fixture.alias(second, "MainModule", "Packed");
    expect(fixture.printed(alias)).toBe("Packed<T, U...>"); expect(fixture.printed(alias, true)).toBe("{ f: (T, U...) -> (T, U...) }");
    const expected = [
      ["a", "Packed<number>", "{ f: (number) -> number }", "number", "()"],
      ["b", "Packed<string, number>", "{ f: (string, number) -> (string, number) }", "string", "number"],
      ["c", "Packed<string, number, boolean>", "{ f: (string, number, boolean) -> (string, number, boolean) }", "string", "number, boolean"],
    ];
    for (const [name, printed, exhaustive, type, pack] of expected) {
      const native = fixture.mainType(second, name!);
      expect(fixture.facts(native)).toMatchObject({ kind: "table", typeParameters: 1, packParameters: 1 });
      expect(fixture.printed(native)).toBe(printed); expect(fixture.printed(native, true)).toBe(exhaustive);
      expect(fixture.printed(fixture.child(native, "typeParameter", "", 0), true)).toBe(type);
      expect(fixture.printedPack(fixture.selectedPack(native, "packParameter", 0), true)).toBe(pack);
    }
  });

  it("uses exact variadic setup and native TypeError structural equality with location controls", () => {
    fixture.create("Fixture"); fixture.synthetic("variadicFunctions"); fixture.source("MainModule", variadicSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(2);
    const number = fixture.builtin(result, "number"), string = fixture.builtin(result, "string");
    expect(fixture.mismatchErrorEquals(result, 0, number, string, [3, 21, 3, 26])).toBe(true);
    expect(fixture.mismatchErrorEquals(result, 1, string, number, [4, 29, 4, 30])).toBe(true);
    expect(fixture.mismatchErrorEquals(result, 0, number, string, [3, 20, 3, 26])).toBe(false);
    expect(fixture.mismatchErrorEquals(result, 0, string, number, [3, 21, 3, 26])).toBe(false);
    const fields = fixture.errorFacts(result, 0); expect(fields.kind).toBe("TypeMismatch");
    expect(fixture.identical(fields.types["wanted"]!, number)).toBe(true);
    const foo = fixture.global(result, "foo"), argumentsPack = fixture.selectedPack(foo, "arguments");
    expect(fixture.packFacts(argumentsPack, false)).toMatchObject({ direct: false, size: 0, finite: false, tailKind: "variadic" });
    expect(fixture.identicalPack(argumentsPack, fixture.selectedPack(foo, "arguments"))).toBe(true);
    expect(fixture.identicalPack(argumentsPack, fixture.selectedPack(foo, "returns"))).toBe(false);
    fixture.reset(); expect(() => fixture.printedPack(argumentsPack)).toThrow("Stale native result handle");
  });

  it("queries the dependency return pack from the original single-entry cyclic module check", () => {
    fixture.create("BuiltinsFixture"); fixture.source("game/A", cycleModuleA); fixture.source("game/B", cycleModuleB);
    const result = fixture.check("game/A"); // Original case does not assert diagnostic absence.
    const pack = fixture.modulePack(result, "game/B"); expect(fixture.printedPack(pack)).toBe("module");
    const first = fixture.packFirst(pack); expect(fixture.facts(first).rawTable).toBe(true);
    expect(fixture.facts(fixture.child(first, "read", "foo")).kind).toBe("function");
    expect(fixture.moduleFacts(result, "game/B").checkedInNewSolver).toBe(true);
    expect(() => fixture.modulePack(result, "game/Missing")).toThrow("Missing native pack module");
  });

  it("runs the exact builtin mutation and clear sequence without reconstructing the fixture", () => {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", clearFirstSource);
    const first = fixture.check("MainModule"); expect(first.diagnostics).toEqual([]);
    const old = fixture.mainType(first, "s"); fixture.clearFrontend();
    expect(() => fixture.printed(old)).toThrow("Stale native result handle");
    fixture.source("MainModule", clearSecondSource);
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
  });

  it("registers hidden types on the original Fixture and rejects late synthetic setup", () => {
    fixture.create("Fixture"); fixture.hiddenTypes(); fixture.source("MainModule", hiddenFunctionSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    expect(() => fixture.synthetic("cyclicUnion")).toThrow("fresh fixture");
    fixture.reset(); fixture.source("MainModule", hiddenFunctionSource);
    expect(fixture.check("MainModule").diagnostics).not.toEqual([]);
  });

  it("observes definition state before checks and invalidates snapshots across ordered loads", () => {
    fixture.create("Fixture");
    const loaded = fixture.observe("definition", recursiveDefinitionSource);
    expect(loaded.success).toBe(true); expect(loaded["sourceModuleName"]).toBe("@test");
    expect(loaded["sourceHumanReadableName"]).toBe("@test");
    const context = fixture.context(), cls = fixture.globalAlias(context, "MyClass");
    expect(fixture.facts(cls).documentation).toBe("@test/globaltype/MyClass");
    expect(fixture.bindingFacts(context, "myFunc").documentation).toBe("@test/global/myFunc");
    fixture.definition("declare freshValue: string");
    expect(() => fixture.facts(cls)).toThrow("Stale native result handle");
    expect(fixture.printed(fixture.global(fixture.context(), "freshValue"))).toBe("string");
    expect(() => fixture.mainType(fixture.context(), "freshValue")).toThrow("no check result");
  });

  it("reads actual logical graph counts and refuses discarded-graph counts", () => {
    fixture.create("Fixture"); fixture.source("MainModule", graphCountSource);
    const result = fixture.check("MainModule"); // Upstream asserts only graph size.
    const nodes = fixture.moduleFacts(result, "MainModule").internalNodes;
    expect(nodes).toBeLessThanOrEqual(80); expect(nodes).toBeGreaterThan(0);
    expect(nodes <= 0).toBe(false); // Detects using a discarded/empty arena as the <=80 proof.
    fixture.reset(); fixture.retainGraphs(false); fixture.source("MainModule", graphCountSource);
    const discarded = fixture.check("MainModule");
    expect(() => fixture.moduleFacts(discarded, "MainModule")).toThrow("node counts unavailable");
  });

  it("retains raw old-solver flag while selecting the audited explicit new extern frontend", () => {
    fixture.flag("DebugLuauForceOldSolver", true, "initialization"); fixture.create("ExternExplicitNewFixture");
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(true);
    fixture.source("MainModule", explicitNewSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(fixture.moduleFacts(result, "MainModule")).toMatchObject({ effectiveNewSolver: true, checkedInNewSolver: true });
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(true);
    expect(() => fixture.create("ExternTypeFixture")).toThrow("requires selected new solver");
    fixture.clearFlags(); fixture.create("ExternTypeFixture"); expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(false);
  });

  it("reads native variant names from exact unsuccessful definition loads", () => {
    fixture.create("Fixture");
    const duplicate = fixture.observe("definition", duplicatePropertyDefinition);
    expect(duplicate.success).toBe(false); expect(duplicate.parseErrors).toEqual([]); expect(duplicate["modulePresent"]).toBe(true);
    expect(duplicate["diagnostics"]).toMatchObject([
      { kind: "GenericError", message: "Cannot overload read type of non-function extern type member 'X'" },
      { kind: "GenericError", message: "Cannot overload write type of non-function extern type member 'X'" },
    ]);
    expect(duplicate["diagnostics"]).toHaveLength(2);
    const superclass = fixture.observe("definition", nonClassSuperclassDefinition);
    expect(superclass.success).toBe(false); expect(superclass.parseErrors).toEqual([]); expect(superclass["modulePresent"]).toBe(true);
    expect(superclass["diagnostics"]).toMatchObject([
      { kind: "GenericError", message: "Cannot use non-class type 'NotAClass' as a superclass of class 'Foo'" },
    ]);
    expect(superclass["diagnostics"]).toHaveLength(1);
    // The original cyclic declaration assertion requires only unsuccessful loading.
    expect(fixture.observe("definition", cyclicSuperclassDefinition).success).toBe(false);
  });

  it("uses audited native printing options and rejects unknown selectors", () => {
    fixture.create("Fixture"); fixture.definition("declare function named(x: number): number");
    const context = fixture.context(), named = fixture.global(context, "named");
    expect(fixture.printedOptions(named, { functionTypeArguments: true })).toBe("(x: number) -> number");
    expect(fixture.printedOptions(named, { functionTypeArguments: false })).toBe("(number) -> number");
    const pack = fixture.selectedPack(named, "arguments");
    expect(fixture.printedOptions(pack)).toBe("number");
    const number = fixture.builtin(context, "number");
    for (const option of ["exhaustive", "useLineBreaks", "functionTypeArguments", "hideTableKind", "hideNamedFunctionTypeParameters",
      "hideFunctionSelfArgument", "hideTableAliasExpansions", "useQuestionMarks", "ignoreSyntheticName"])
      expect(fixture.printedOptions(number, { [option]: true })).toBe("number");
    expect(() => fixture.printedOptions(number, { other: true } as never)).toThrow("Unknown or mistyped");
    expect(fixture.observe("print_options", number.session, number.revision, number.index, 512, 0).status).toBe("error");
    fixture.source("MainModule", "local value: string?");
    const result = fixture.check("MainModule"), optional = fixture.mainType(result, "value");
    expect(fixture.printedOptions(optional)).toBe("string?");
    expect(fixture.printedOptions(optional, { useQuestionMarks: false })).toBe("nil | string");
  });

  it("executes native directional subtype checks with failed-scope and stale controls", () => {
    fixture.create("Fixture");
    const context = fixture.context(), number = fixture.builtin(context, "number");
    expect(() => fixture.subtypeOf(number, number)).toThrow("no check result");
    fixture.source("MainModule", "type Narrow = { x: number }\ntype Wide = { x: number, y: string }\nlocal a: Narrow\nlocal b: Wide");
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    const narrow = fixture.mainType(result, "a"), wide = fixture.mainType(result, "b");
    expect(fixture.subtypeOf(wide, narrow)).toBe(true); expect(fixture.subtypeOf(narrow, wide)).toBe(false);
    const checkedNumber = fixture.builtin(result, "number"), string = fixture.builtin(result, "string");
    expect(fixture.subtypeOf(checkedNumber, checkedNumber)).toBe(true); expect(fixture.subtypeOf(checkedNumber, string)).toBe(false);
    fixture.reset(); expect(() => fixture.subtypeOf(narrow, wide)).toThrow("Stale native result handle");
  });

  it("keeps operation flags through native queries and restores initialization values on failures", () => {
    const flag = "LuauTypeMaximumStringifierLength";
    fixture.flag(flag, 128, "initialization"); fixture.create("Fixture");
    expect(fixture.flagValue(flag)).toBe(128);
    fixture.source("MainModule", "local f: (number, string, boolean) -> (number, string, boolean)");
    const result = fixture.check("MainModule"), type = fixture.mainType(result, "f");
    const full = fixture.printed(type);
    fixture.flag(flag, 8);
    expect(fixture.flagValue(flag)).toBe(128); expect(fixture.scopedFlagValue(flag)).toBe(8); expect(fixture.flagValue(flag)).toBe(128);
    expect(fixture.printed(type)).not.toBe(full);
    expect(fixture.printedOptions(type)).not.toBe(full);
    expect(fixture.flagValue(flag)).toBe(128);
    expect(fixture.subtypeOf(type, type)).toBe(true); expect(fixture.flagValue(flag)).toBe(128);
    expect(fixture.observe("print_options", type.session, type.revision, type.index, 512, 0).status).toBe("error");
    expect(fixture.flagValue(flag)).toBe(128);
    expect(() => fixture.child(type, "read", "absent")).toThrow(); expect(fixture.flagValue(flag)).toBe(128);
    fixture.clearFlags(); expect(fixture.printed(type)).toBe(full); expect(fixture.flagValue(flag)).toBe(128);
    fixture.flag(flag, 8); fixture.flag("UnknownOperationFlag", true);
    expect(() => fixture.printed(type)).toThrow("Unknown or mistyped"); expect(fixture.flagValue(flag)).toBe(128);
    fixture.clearFlags(); fixture.reset(); expect(fixture.flagValue(flag)).toBe(128);
    fixture.create("Fixture"); expect(fixture.flagValue(flag)).not.toBe(128);
  });
});
