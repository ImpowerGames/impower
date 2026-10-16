import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { asymmetricExternSource, cyclicUnionSource, externMethodSource, genericSource, negationFirstSource,
  negationSecondSource, nonStrictDefinitions, nonStrictModuleA, nonStrictModuleB, nonTestableSource,
  recursiveDefinitionSource, stringFormatMismatchSource, parsePollutionDefinition, checkPollutionDefinition,
  documentationDefinition, persistentDocumentationDefinition } from "./fixtureSources";

describe("official native fixture graphs and queries", () => {
  let fixture: NativeFixture;
  beforeEach(async () => { fixture = await loadNativeFixture(); });
  afterEach(() => { fixture?.dispose(); });

  it("constructs the exact cyclic union in the native arena and detects missing setup", () => {
    fixture.create("Fixture");
    fixture.synthetic("cyclicUnion");
    fixture.source("MainModule", cyclicUnionSource);
    const result = fixture.check("MainModule");
    // Matches the upstream ignoreMissingAnnotations, by actual native error variant.
    expect(result.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).toEqual([]);
    const union = fixture.alias(result, "MainModule", "BadCyclicUnion");
    expect(fixture.facts(union).kind).toBe("union");
    expect(fixture.identical(union, fixture.child(union, "option", "", 0))).toBe(true);
    const table = fixture.child(union, "option", "", 1);
    expect(fixture.tableState(table)).toBe(0); // Native TableState::Sealed.
    expect(fixture.identical(fixture.child(table, "index"), fixture.builtin(result, "number"))).toBe(true);
    expect(fixture.identical(fixture.child(table, "indexResult"), fixture.builtin(result, "number"))).toBe(true);
    expect(() => fixture.child(union, "option", "", 2)).toThrow("Invalid native union option");
    fixture.reset();
    fixture.source("MainModule", cyclicUnionSource);
    expect(fixture.check("MainModule").diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).not.toEqual([]);
    fixture.create("BuiltinsFixture");
    expect(() => fixture.synthetic("cyclicUnion")).toThrow("exact Fixture preset");
  });

  it("preserves the exact asymmetric extern graph and structural mismatch", () => {
    fixture.create("Fixture");
    fixture.synthetic("asymmetricExtern");
    fixture.source("MainModule", asymmetricExternSource);
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.begin).toEqual({ line: 1, column: 40 });
    expect(result.diagnostics[0]?.end).toEqual({ line: 1, column: 48 });
    expect(fixture.firstErrorAt(result, 1, 40)).toBe(0);
    expect(() => fixture.firstErrorAt(result, 1, 39)).toThrow("No native diagnostic");
    const string = fixture.builtin(result, "string"), number = fixture.builtin(result, "number");
    expect(fixture.mismatchEquals(result, 0, string, number)).toBe(true);
    expect(fixture.mismatchEquals(result, 0, number, string)).toBe(false);
    expect(fixture.identical(fixture.errorType(result, 0, "wanted"), string)).toBe(true);
    expect(fixture.identical(fixture.errorType(result, 0, "given"), number)).toBe(true);
    const script = fixture.global(result, "script");
    const read = fixture.child(script, "read", "Parent"), write = fixture.child(script, "write", "Parent");
    expect(fixture.printed(read)).toBe("Workspace");
    expect(fixture.printed(write)).toBe("Instance");
    expect(fixture.identical(read, write)).toBe(false);
    expect(fixture.identical(fixture.child(script, "parent"), write)).toBe(true);
    const part = fixture.child(read, "read", "Part");
    expect(() => fixture.child(read, "write", "Part")).toThrow("Absent native property direction");
    expect(fixture.identical(fixture.child(part, "read", "BrickColor"), string)).toBe(true);
    fixture.reset(); fixture.source("MainModule", asymmetricExternSource);
    expect(fixture.check("MainModule").diagnostics).not.toEqual(result.diagnostics);
  });

  it("reuses the pinned standard extern fixture with a wrong-preset control", () => {
    fixture.create("ExternTypeFixture"); fixture.source("MainModule", externMethodSource);
    const first = fixture.check("MainModule");
    expect(first.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(first, "MainModule", "m"))).toBe("number");
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", externMethodSource);
    expect(fixture.check("MainModule").diagnostics).not.toEqual([]);
  });

  it("observes actual recursive definition metadata and self identity without graph expansion", () => {
    fixture.create("Fixture"); fixture.definition(recursiveDefinitionSource);
    fixture.source("MainModule", ""); const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    const cls = fixture.alias(result, "MainModule", "MyClass");
    expect(fixture.facts(cls)).toMatchObject({ kind: "extern", ownProperties: 1, documentation: "@test/globaltype/MyClass" });
    expect(fixture.propertyFacts(cls, "myMethod").documentation).toBe("@test/globaltype/MyClass.myMethod");
    const method = fixture.child(cls, "read", "myMethod");
    expect(fixture.facts(method)).toMatchObject({ kind: "function", definition: { module: "@test",
      begin: { line: 2, column: 12 }, end: { line: 2, column: 35 }, nameBegin: { line: 2, column: 21 },
      nameEnd: { line: 2, column: 29 }, varargPresent: false } });
    const pack = fixture.functionPack(method, "arguments", false);
    expect(pack.direct).toBe(true); expect(pack.head).toHaveLength(1);
    expect(fixture.identical(pack.head[0]!, cls)).toBe(true);
    expect(fixture.functionPack(method, "arguments", true).head).toHaveLength(1);
    expect(() => fixture.functionPack(cls, "returns", true)).toThrow("not a function");
  });

  it("runs exact generic identity assertions on native builtins", () => {
    fixture.create("Fixture"); fixture.source("MainModule", genericSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    expect(fixture.identical(fixture.binding(result, "MainModule", "x"), fixture.builtin(result, "string"))).toBe(true);
    expect(fixture.identical(fixture.binding(result, "MainModule", "y"), fixture.builtin(result, "number"))).toBe(true);
  });

  it("checks only the exact nonstrict entrypoint with the upstream expression-path resolver", () => {
    fixture.create("NonStrictTypeCheckerFixture");
    fixture.source("Modules/A", nonStrictModuleA); fixture.source("Modules/B", nonStrictModuleB);
    const result = fixture.checkNonStrict("Modules/B", nonStrictDefinitions);
    expect(result.diagnostics).toEqual([]);
    const dependency = fixture.binding(result, "Modules/A", "e");
    expect(fixture.facts(dependency).kind).toBe("table");
    expect(fixture.printed(fixture.child(dependency, "read", "x"))).toBe("number");
    fixture.reset(); fixture.source("Modules/B", nonStrictModuleB);
    const missing = fixture.checkNonStrict("Modules/B", nonStrictDefinitions);
    // Checked any require in nonstrict mode does not promise a missing-module diagnostic.
    // The setup control observes the real dependency result instead.
    expect(missing.diagnostics).toEqual([]);
    expect(() => fixture.binding(missing, "Modules/A", "e")).toThrow("Missing native module scope");
  });

  it("retains the exact nonstrict negation cache across checks and first-position error order", () => {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", negationFirstSource);
    expect(fixture.checkNonStrict("MainModule", nonStrictDefinitions).diagnostics).toEqual([]);
    fixture.source("MainModule", negationSecondSource);
    const result = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(result.diagnostics).toHaveLength(2);
    for (const line of [2, 3]) {
      const index = fixture.firstErrorAt(result, line, 10);
      expect(result.diagnostics[index]).toMatchObject({ kind: "CheckedFunctionCallError", checkedFunctionName: "contrived" });
    }
  });

  it("classifies the exact upstream non-testable exception and destroys its session", () => {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", nonTestableSource);
    expect(fixture.observe("check_nonstrict", "MainModule", nonStrictDefinitions).status).toBe("internal-compiler-error");
    expect(() => fixture.check("MainModule")).toThrow("requires create");
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", "onlyNums(1)");
    expect(fixture.checkNonStrict("MainModule", nonStrictDefinitions).diagnostics).toEqual([]);
  });

  it("executes the audited 250 blocks with actual scoped recursion limits", () => {
    fixture.create("NonStrictTypeCheckerFixture");
    fixture.flag("LuauAddRecursionCounterToNonStrictTypeChecker", true);
    fixture.flag("LuauNonStrictTypeCheckerRecursionLimit", 150);
    fixture.flag("LuauConstraintGeneratorRecursionLimit", 750);
    fixture.flag("LuauCheckRecursionLimit", 750);
    fixture.source("MainModule", "do ".repeat(250) + "local a = 1" + " end".repeat(250));
    const result = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(result.diagnostics).toEqual([]);
    expect(result.effectiveFlags).toEqual([
      { name: "LuauAddRecursionCounterToNonStrictTypeChecker", value: true },
      { name: "LuauNonStrictTypeCheckerRecursionLimit", value: 150 },
      { name: "LuauConstraintGeneratorRecursionLimit", value: 750 },
      { name: "LuauCheckRecursionLimit", value: 750 },
    ]);
  });

  it("preserves all six exact string-format structural errors and their native order", () => {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", stringFormatMismatchSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(6);
    const string = fixture.builtin(result, "string"), number = fixture.builtin(result, "number"), boolean = fixture.builtin(result, "boolean");
    const expected = [
      { wanted: string, given: number, begin: [1, 26], end: [1, 27] },
      { wanted: number, given: string, begin: [1, 29], end: [1, 36] },
      { wanted: string, given: boolean, begin: [1, 38], end: [1, 42] },
      { wanted: string, given: number, begin: [2, 32], end: [2, 33] },
      { wanted: number, given: string, begin: [2, 35], end: [2, 42] },
      { wanted: string, given: boolean, begin: [2, 44], end: [2, 48] },
    ];
    for (const [index, error] of expected.entries()) {
      expect(result.diagnostics[index]?.begin).toEqual({ line: error.begin[0], column: error.begin[1] });
      expect(result.diagnostics[index]?.end).toEqual({ line: error.end[0], column: error.end[1] });
      expect(fixture.mismatchEquals(result, index, error.wanted, error.given)).toBe(true);
      expect(fixture.mismatchEquals(result, index, error.given, error.wanted)).toBe(false);
    }
    expect(fixture.check("MainModule").diagnostics).toEqual(result.diagnostics);
  });

  it("keeps both failed exact definition loads from polluting the same global environment", () => {
    fixture.create("Fixture");
    expect(fixture.observe("definition", parsePollutionDefinition).success).toBe(false);
    expect(() => fixture.global(fixture.context(), "foo")).toThrow("Missing native global");
    expect(fixture.observe("definition", checkPollutionDefinition).success).toBe(false);
    expect(() => fixture.global(fixture.context(), "bar")).toThrow("Missing native global");
    fixture.definition("declare valid: number");
    expect(fixture.printed(fixture.global(fixture.context(), "valid"))).toBe("number");
  });

  it("reads every exact binding, type and property documentation field", () => {
    fixture.create("Fixture"); fixture.definition(documentationDefinition);
    const context = fixture.context();
    expect(fixture.bindingFacts(context, "x").documentation).toBe("@test/global/x");
    expect(fixture.facts(fixture.globalAlias(context, "Foo")).documentation).toBe("@test/globaltype/Foo");
    const bar = fixture.globalAlias(context, "Bar");
    expect(fixture.facts(bar)).toMatchObject({ kind: "extern", documentation: "@test/globaltype/Bar", ownProperties: 1 });
    expect(fixture.propertyFacts(bar, "prop").documentation).toBe("@test/globaltype/Bar.prop");
    expect(fixture.bindingFacts(context, "y").documentation).toBe("@test/global/y");
    const y = fixture.global(context, "y");
    expect(fixture.facts(y)).toMatchObject({ kind: "table", rawTable: true, ownProperties: 1 });
    expect(fixture.propertyFacts(y, "x").documentation).toBe("@test/global/y.x");
    fixture.reset(); expect(() => fixture.bindingFacts(fixture.context(), "x")).toThrow("Missing native global binding");
  });

  it("leaves builtin alias documentation absent and preserves builtin identity", () => {
    fixture.create("Fixture"); fixture.definition(persistentDocumentationDefinition);
    const context = fixture.context(), evil = fixture.globalAlias(context, "Evil");
    expect(fixture.facts(evil).documentation).toBeNull();
    expect(fixture.identical(evil, fixture.builtin(context, "string"))).toBe(true);
    expect(fixture.identical(evil, fixture.builtin(context, "number"))).toBe(false);
  });

  it("distinguishes actual shared and duplicated table nodes despite equal printed shape", () => {
    fixture.create("Fixture");
    // These controls observe identity within each source. Their alias maps and
    // names differ, so they do not isolate topology for a production comparator.
    // No source-derived identity inference or recursive graph transfer.
    for (const [source, shared] of [
      ["type Leaf = {value:number}; type Root = {left:Leaf,right:Leaf}; local root:Root = {}::any",true],
      ["type Root = {left:{value:number},right:{value:number}}; local root:Root = {}::any",false],
    ] as const) {
      fixture.source("MainModule",source);
      const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
      const root = fixture.mainType(result,"root");
      const left = fixture.child(root,"read","left"), right = fixture.child(root,"read","right");
      const followedLeft = fixture.follow(left), followedRight = fixture.follow(right);
      expect(fixture.printed(followedLeft,true)).toBe(fixture.printed(followedRight,true));
      expect(fixture.identical(followedLeft,followedRight)).toBe(shared);
      console.log(JSON.stringify({control:"native table sharing",shared,
        rawIdentical:fixture.identical(left,right),followedIdentical:fixture.identical(followedLeft,followedRight)}));
    }
  });

  it("reads the cyclic table's actual native level, scope and indexer metadata", () => {
    fixture.create("Fixture"); fixture.synthetic("cyclicUnion"); fixture.source("MainModule",cyclicUnionSource);
    const result = fixture.check("MainModule"), union = fixture.alias(result,"MainModule","BadCyclicUnion");
    const table = fixture.child(union,"option","",1), facts = fixture.facts(table);
    expect(facts.tableLevel).toEqual([0,0]);
    expect(facts.tableLevel).not.toEqual([1,0]);
    expect(facts.tableScopeIsGlobal).toBe(true);
    expect(facts.indexerIsReadOnly).toBe(false);
    expect(facts.rawPersistent).toBe(false);
    expect(fixture.facts(union)).toMatchObject({rawPersistent:false,tableLevel:null,tableScopeIsGlobal:null,indexerIsReadOnly:null});
  });

  it("keeps absent table/indexer metadata distinct from native false", () => {
    fixture.create("Fixture"); fixture.source("MainModule","local empty = {}");
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    const empty = fixture.mainType(result,"empty"), facts = fixture.facts(empty);
    expect(facts.kind).toBe("table"); expect(facts.tableLevel).not.toBeNull();
    expect(facts.tableScopeIsGlobal).toBe(false); expect(facts.indexerIsReadOnly).toBeNull();
    expect(fixture.facts(fixture.builtin(result,"number"))).toMatchObject({rawPersistent:true,
      tableLevel:null,tableScopeIsGlobal:null,indexerIsReadOnly:null});
  });

  it("reads raw persistence before following an actual native Bound wrapper", () => {
    fixture.create("Fixture");
    const context = fixture.context(), number = fixture.builtin(context,"number"), bound = fixture.boundControl(number);
    expect(fixture.identical(bound,number)).toBe(false);
    expect(fixture.facts(bound)).toMatchObject({kind:"primitive",rawPersistent:false});
    expect(fixture.facts(number).rawPersistent).toBe(true);
    const followed = fixture.follow(bound);
    expect(fixture.identical(followed,number)).toBe(true); expect(fixture.facts(followed).rawPersistent).toBe(true);
  });

  it("reports all four actual asymmetric extern names and raw persistence", () => {
    fixture.create("Fixture"); fixture.flag("DebugLuauForceOldSolver",false); fixture.synthetic("asymmetricExtern");
    fixture.source("MainModule",asymmetricExternSource);
    const result = fixture.check("MainModule"), script = fixture.global(result,"script");
    const workspace = fixture.child(script,"read","Parent"), instance = fixture.child(script,"parent");
    const part = fixture.child(workspace,"read","Part");
    for (const [handle,name] of [[script,"Script"],[workspace,"Workspace"],[instance,"Instance"],[part,"Part"]] as const)
      expect(fixture.facts(handle)).toMatchObject({kind:"extern",name,definitionModuleName:"Test",rawPersistent:false,
        tableLevel:null,tableScopeIsGlobal:null,indexerIsReadOnly:null});
    expect(fixture.facts(fixture.boundControl(script)).name).toBe("Script");
    expect(fixture.facts(fixture.builtin(result,"string")).rawPersistent).toBe(true);
    expect(fixture.facts(fixture.builtin(result,"number")).rawPersistent).toBe(true);
  });

  it("rejects foreign, stale, reset and disposed handles before observing facts", async () => {
    fixture.create("Fixture"); fixture.source("MainModule","local value = 1");
    const result = fixture.check("MainModule"), number = fixture.builtin(result,"number");
    expect(fixture.facts(number).rawPersistent).toBe(true);
    const other = await loadNativeFixture();
    try {
      other.create("Fixture"); other.source("MainModule","local value = 1");
      const otherResult = other.check("MainModule"), otherNumber = other.builtin(otherResult,"number");
      expect(otherNumber.index).toBe(number.index);
      expect(() => other.facts(number)).toThrow("Foreign native fixture handle");
      expect(() => fixture.facts(otherNumber)).toThrow("Foreign native fixture handle");
      expect(other.facts(otherNumber).rawPersistent).toBe(true);
    } finally { other.dispose(); }
    const current = fixture.check("MainModule");
    expect(() => fixture.facts(number)).toThrow("Stale");
    const currentNumber = fixture.builtin(current,"number"); expect(fixture.facts(currentNumber).rawPersistent).toBe(true);
    fixture.reset(); expect(() => fixture.facts(currentNumber)).toThrow("Stale");
    const fresh = fixture.builtin(fixture.context(),"number"); expect(fixture.facts(fresh).rawPersistent).toBe(true);
    fixture.dispose(); expect(() => fixture.facts(fresh)).toThrow("Disposed native fixture host");
  });
});
