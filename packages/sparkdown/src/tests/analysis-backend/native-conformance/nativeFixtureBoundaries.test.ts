import { afterEach, beforeEach, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { nativeCaseChecker } from "../../luau-conformance/typecheckNativeRunner";
import { runAssertions } from "../../luau-conformance/typecheck/portedCases";
import { interfaceArenaSource as interfaceSource, genericAliasArenaSource as genericAliasSource,
  clonedInterfaceSource as sharedAliasSource, anyPackPrintSource as anyPackSource, documentationDefinition } from "./fixtureSources";

let fixture: NativeFixture;
beforeEach(async () => { fixture = await loadNativeFixture(); });
afterEach(() => { fixture?.dispose(); });

it("adds an actual pre-check builtin binding with exact @test documentation", () => {
  fixture.create("BuiltinsFixture");
  const any = fixture.builtin(fixture.context(), "any");
  fixture.bindGlobal("script", any);
  const context = fixture.context();
  expect(fixture.identical(fixture.global(context,"script"),fixture.builtin(context,"any"))).toBe(true);
  expect(fixture.bindingFacts(context,"script").documentation).toBe("@test/global/script");
});

it("preserves the exact native numeric printing option for the original any-pack check", () => {
  fixture.create("BuiltinsFixture"); fixture.source("MainModule",anyPackSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(fixture.printedOptions(fixture.mainType(result,"tab"),{exhaustive:true,maxTableLength:0})).toBe("{string}");
});

it("tests original interface ownership using raw native arena membership", () => {
  fixture.create("Fixture"); fixture.source("MainModule",interfaceSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const alias = fixture.typeFun(result,"MainModule","A","exported").type;
  expect(fixture.inArena(alias,"interface")).toBe(true);
  expect(fixture.inArena(alias,"global")).toBe(false);
  const exports = fixture.packFirst(fixture.modulePack(result,"MainModule"));
  expect(fixture.facts(exports).rawTable).toBe(true);
  const n = fixture.child(exports,"read","n");
  expect(fixture.inArena(n,"interface")).toBe(true);
});

it("retains original generic alias parameter and indexer identity without cloning a substitute", () => {
  fixture.create("Fixture"); fixture.source("MainModule",genericAliasSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const alias = fixture.typeFun(result,"MainModule","Array","exported");
  expect(alias.parameters).toHaveLength(1);
  expect(fixture.facts(alias.type).rawTable).toBe(true);
  expect(fixture.propertyNames(alias.type)).toEqual([]);
  expect(fixture.inArena(alias.type,"interface")).toBe(true);
  expect(fixture.identical(alias.parameters[0]!.type,fixture.child(alias.type,"indexResult"))).toBe(true);
});

it("preserves the original cloned interface fields and exhaustive printed equivalence", () => {
  fixture.create("Fixture"); fixture.source("MainModule",sharedAliasSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  const record = fixture.typeFun(result,"MainModule","Record","exported").type;
  const exports = fixture.packFirst(fixture.modulePack(result,"MainModule"));
  expect(fixture.facts(exports).rawTable).toBe(true);
  const a = fixture.child(exports,"read","a"), b = fixture.child(exports,"read","b");
  for (const type of [record,a,b]) expect(fixture.inArena(type,"interface")).toBe(true);
  expect(fixture.printed(record,true)).toBe(fixture.printed(a,true));
  expect(fixture.printed(record,true)).toBe(fixture.printed(b,true));
});

it("keeps existing raw builtin identity as an independent positive control", () => {
  fixture.create("Fixture"); const context = fixture.context();
  expect(fixture.identical(fixture.builtin(context,"number"),fixture.builtin(context,"number"))).toBe(true);
  expect(fixture.identical(fixture.builtin(context,"number"),fixture.builtin(context,"string"))).toBe(false);
});

it("distinguishes raw arena ownership from a bound wrapper's followed target", () => {
  fixture.create("Fixture"); fixture.source("MainModule",interfaceSource);
  const result = fixture.check("MainModule");
  const alias = fixture.typeFun(result,"MainModule","A","exported").type;
  const bound = fixture.boundControl(alias);
  expect(fixture.inArena(alias,"interface")).toBe(true);
  expect(fixture.inArena(bound,"interface")).toBe(false);
  expect(fixture.inArena(fixture.follow(bound),"interface")).toBe(true);
  expect(() => fixture.inArena(alias,"interface","Missing")).toThrow("Missing native module");
});

it("rejects foreign, stale and disposed handles for both new native operations", async () => {
  const peer = await loadNativeFixture();
  try {
    fixture.create("Fixture"); peer.create("Fixture");
    const type = fixture.builtin(fixture.context(),"number"), foreign = peer.builtin(peer.context(),"number");
    expect([type.session,type.revision,type.index]).toEqual([foreign.session,foreign.revision,foreign.index]);
    expect(() => fixture.bindGlobal("value",foreign)).toThrow("Foreign native fixture handle");
    expect(() => fixture.inArena(foreign,"global")).toThrow("Foreign native fixture handle");
    fixture.bindGlobal("value",type);
    expect(() => fixture.inArena(type,"global")).toThrow("Stale native result handle");
    const current = fixture.global(fixture.context(),"value");
    fixture.reset();
    expect(() => fixture.bindGlobal("value",current)).toThrow("Stale native result handle");
    expect(() => fixture.inArena(current,"global")).toThrow("Stale native result handle");
    fixture.dispose(); expect(() => fixture.inArena(current,"global")).toThrow("Disposed native fixture host");
  } finally { peer.dispose(); }
});

it("keeps frontend initialization at the actual typed-global operation", () => {
  fixture.create("Fixture");
  fixture.source("MainModule","local value = script");
  fixture.flag("DebugLuauUserDefinedClasses",true);
  const any = fixture.builtin(fixture.context(),"any");
  fixture.bindGlobal("script",any);
  expect(fixture.printed(fixture.globalAlias(fixture.context(),"class"))).toBe("class");
  expect(fixture.check("MainModule").diagnostics).toEqual([]);
  fixture.clearFlags(); fixture.create("Fixture");
  fixture.bindGlobal("script",fixture.builtin(fixture.context(),"any"));
  fixture.flag("DebugLuauUserDefinedClasses",true);
  expect(() => fixture.globalAlias(fixture.context(),"class")).toThrow("Missing native global alias");
});

it("rejects actual query-owned bindings and tears down real builtin-triggered fixture initialization failure", () => {
  fixture.create("Fixture");
  const bound = fixture.boundControl(fixture.builtin(fixture.context(),"number"));
  expect(() => fixture.bindGlobal("temporary",bound)).toThrow("builtin or global arena type");
  expect(() => fixture.global(fixture.context(),"temporary")).toThrow("Missing native global");
  fixture.create("ClassesFixture"); fixture.flag("DebugLuauUserDefinedClasses",false);
  // Pinned Fixture.cpp706-711 initializes the frontend inside getBuiltins.
  // A valid builtin handle cannot precede this failed setup in the same session.
  const context = fixture.context();
  const failure = fixture.observe("builtin",context.session,context.revision,"any");
  expect(failure).toMatchObject({status:"setup-error",success:false,arenaFrozen:true});
  expect(failure.parseErrors).toEqual([]);
  expect(failure["diagnostics"]).toMatchObject([{kind:"UnknownSymbol"},{kind:"UnknownSymbol"}]);
  expect(fixture.observe("context")).toMatchObject({status:"error",message:"Conformance session requires create"});
  fixture.clearFlags(); fixture.create("Fixture"); fixture.bindGlobal("script",fixture.builtin(fixture.context(),"any"));
  expect(fixture.bindingFacts(fixture.context(),"script").documentation).toBe("@test/global/script");
});

it("distinguishes zero unlimited printing from a real finite native table limit", () => {
  fixture.create("Fixture"); fixture.source("MainModule","local t = {one=1,two=2,three=3,four=4,five=5,six=6}");
  const result = fixture.check("MainModule"), type = fixture.mainType(result,"t");
  const unlimited = fixture.printedOptions(type,{exhaustive:true,maxTableLength:0});
  const limited = fixture.printedOptions(type,{exhaustive:true,maxTableLength:8});
  expect(unlimited).not.toContain(" more ..."); expect(limited).toContain(" more ...");
  expect(unlimited).not.toBe(limited);
  for (const maximum of [-1,0.5,NaN,2147483648])
    expect(() => fixture.printedOptions(type,{maxTableLength:maximum})).toThrow("Invalid native maximum table print length");
  expect(fixture.observe("print_options",type.session,type.revision,type.index,129,0,-2).status).toBe("error");
  expect(fixture.printedOptions(type,{exhaustive:true,maxTableLength:0})).toBe(unlimited);
});

it("routes exact typed globals and raw arena assertions through the shared native checker", () => {
  const check = nativeCaseChecker(fixture);
  const typed = check("local observed = script",{globals:{script:"any"}});
  expect(typed.syntaxDiagnostics).toEqual([]); expect(typed.diagnostics).toEqual([]); expect(typed.typeOf("observed")).toBe("any");
  expect(fixture.bindingFacts(fixture.context(),"script").documentation).toBe("@test/global/script");
  const result = check(interfaceSource,{clearModules:true});
  expect(result.syntaxDiagnostics).toEqual([]);
  runAssertions(result,{source:interfaceSource,expect:[{errors:0},{exportedAlias:"A",arena:{kind:"interface",present:true}},
    {exportedAlias:"A",arena:{kind:"global",present:false}}]});
});

it("keeps a real global-arena type intact while adding only binding documentation", () => {
  fixture.create("Fixture"); fixture.definition(documentationDefinition);
  const bar = fixture.globalAlias(fixture.context(),"Bar"), documentation = fixture.facts(bar).documentation;
  expect(fixture.inArena(bar,"global")).toBe(true);
  fixture.bindGlobal("bar",bar);
  const context = fixture.context(), binding = fixture.global(context,"bar");
  expect(fixture.identical(binding,fixture.globalAlias(context,"Bar"))).toBe(true);
  expect(fixture.inArena(binding,"global")).toBe(true);
  expect(fixture.facts(binding).documentation).toBe(documentation);
  expect(fixture.bindingFacts(context,"bar").documentation).toBe("@test/global/bar");
  fixture.source("MainModule","local found = bar"); const result = fixture.check("MainModule");
  expect(result.diagnostics).toEqual([]);
  expect(() => fixture.bindGlobal("late",fixture.builtin(result,"number"))).toThrow("must precede checks");
  fixture.clearFrontend(); fixture.bindGlobal("late",fixture.builtin(fixture.context(),"number"));
  expect(fixture.bindingFacts(fixture.context(),"late").documentation).toBe("@test/global/late");
});
