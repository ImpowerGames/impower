import { afterEach, expect, it, vi } from "vitest";
import { runNativePortedCase } from "../../luau-conformance/typecheck/portedCases";
import { loadNativeFixture } from "./nativeFixture";
import { explicitNewSource, parsePollutionDefinition as parserFailDefinition, checkPollutionDefinition as checkerFailDefinition,
  importedClassDependencySource as classDependency, externModuleDefinition, documentationDefinition, recursiveDefinitionSource,
  persistentDocumentationDefinition, duplicatePropertyDefinition, graphCountSource } from "./fixtureSources";
import { assertDefinitionType } from "../../luau-conformance/typecheckNativeActions";

const file = "TypeInfer.primitives.test.cpp";
afterEach(() => vi.unstubAllEnvs());

it("dispatches original ordered failed definitions without a fabricated final source check", async () => {
  const load = vi.fn(async () => {
    const fixture = await loadNativeFixture();
    vi.spyOn(fixture,"check").mockImplementation(() => { throw Error("fabricated check"); });
    return fixture;
  });
  await runNativePortedCase(file, {name:"original definition-only sequence",fixture:"Fixture",actions:[
    {definition:parserFailDefinition,expect:[{success:false},{binding:{name:"foo",present:false}}]},
    {definition:checkerFailDefinition,expect:[{success:false},{binding:{name:"bar",present:false}}]},
  ]}, () => { throw Error("active action case skipped"); },load);
  expect(load).toHaveBeenCalledTimes(1);
});

it("performs the original lazy extern case-body New transition under the raw old flag", async () => {
  await runNativePortedCase(file, {name:"original body override",fixture:"ExternTypeFixture",
    flags:{DebugLuauForceOldSolver:true},source:explicitNewSource,solverOverride:"New",expect:[{errors:"some"}],
  }, () => { throw Error("active override skipped"); },async () => {
    const fixture = await loadNativeFixture(), check = fixture.check.bind(fixture);
    vi.spyOn(fixture,"check").mockImplementation((...args) => {
      const result = check(...args);
      expect(result.effectiveFlags).toContainEqual({name:"DebugLuauForceOldSolver",value:true});
      expect(fixture.moduleFacts(result,"MainModule")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
      return result;
    });
    return fixture;
  });
});

it("validates an exact named class dependency before any native fixture setup", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS","all");
  const load = vi.fn(loadNativeFixture), skip = vi.fn();
  await runNativePortedCase("TypeInfer.classes.test.cpp", {name:"isinstance_refines_imported_class",fixture:"unsupported semantic fixture",
    flags:{NotARegisteredFlag:true},source:"return 1",module:"game/B",moduleSources:{"game/A":classDependency},
    moduleDivergences:{"game/A":{divergence:"No `class` declarations"}},expect:[{errors:99}],
  },skip,load);
  expect(load).not.toHaveBeenCalled(); expect(skip).toHaveBeenCalledTimes(1);
});

it("asserts real extern module labels separately from definition source labels and nullable non-extern fields", async () => {
  await runNativePortedCase(file,{name:"original definitions537",fixture:"Fixture",actions:[
    {definition:externModuleDefinition,mandatory:true,expect:[{success:true},{sourceModuleName:"@test",sourceHumanReadableName:"@test"},
      {alias:{name:"Foo",present:true,type:{rawKind:"extern",definitionModuleName:"@test"}}}]},
    {definition:persistentDocumentationDefinition,mandatory:true,expect:[
      {alias:{name:"Evil",present:true,type:{sameAsBuiltin:"string",documentation:null,definitionModuleName:null}}}]},
  ]},() => { throw Error("active definitions skipped"); });
});

it("dispatches original binding/type/property/function metadata at its definition operation point", async () => {
  await runNativePortedCase(file,{name:"original definition documentation",fixture:"Fixture",actions:[
    {definition:documentationDefinition,mandatory:true,expect:[
      {binding:{name:"x",present:true,documentation:"@test/global/x"}},
      {alias:{name:"Foo",present:true,type:{documentation:"@test/globaltype/Foo"}}},
      {alias:{name:"Bar",present:true,type:{documentation:"@test/globaltype/Bar"}}},
      {alias:{name:"Bar",present:true,type:{rawKind:"extern",properties:{prop:{count:1,documentation:"@test/globaltype/Bar.prop"},missing:{count:0}}}}},
      {binding:{name:"y",present:true,documentation:"@test/global/y"}},
      {binding:{name:"y",present:true,type:{rawKind:"table",properties:{x:{count:1,documentation:"@test/global/y.x"}}}}},
    ]},
    {definition:recursiveDefinitionSource,mandatory:true,expect:[
      {alias:{name:"MyClass",present:true,type:{documentation:"@test/globaltype/MyClass"}}},
      {alias:{name:"MyClass",present:true,type:{rawKind:"extern",
      properties:{myMethod:{count:1,documentation:"@test/globaltype/MyClass.myMethod",readable:true,read:{rawKind:"function",definition:{module:"@test",location:[2,12,2,35],originalName:[2,21,2,29],varargPresent:false}}}}}}}]},
  ]},vi.fn());
});

it("reports recursive function vararg failure before a competing original-name failure", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture"); fixture.definition(recursiveDefinitionSource);
    const method = fixture.child(fixture.globalAlias(fixture.context(),"MyClass"),"read","myMethod");
    assertDefinitionType(fixture,method,{rawKind:"function",definition:{module:"@test",location:[2,12,2,35],varargPresent:false,originalName:[2,21,2,29]}});
    expect(() => assertDefinitionType(fixture,method,{rawKind:"function",definition:{module:"@test",location:[2,12,2,35],varargPresent:true,originalName:[99,0,99,1]}}))
      .toThrow("expected false to be true");
  } finally { fixture.dispose(); }
});

it("reports original alias documentation failure before a competing structural predicate", async () => {
  await expect(runNativePortedCase(file,{name:"documentation assertion order",actions:[
    {definition:documentationDefinition,mandatory:true,expect:[
      {alias:{name:"Bar",present:true,type:{documentation:"wrong original documentation"}}},
      {alias:{name:"Bar",present:true,type:{rawKind:"table"}}},
    ]},
  ]},vi.fn())).rejects.toThrow("wrong original documentation");
});

it("reports original diagnostic kind failure before a competing message predicate", async () => {
  await expect(runNativePortedCase(file,{name:"diagnostic assertion order",actions:[
    {definition:duplicatePropertyDefinition,expect:[
      {definitionError:0,kind:"UnknownSymbol"},
      {definitionError:0,message:"wrong original message"},
    ]},
  ]},vi.fn())).rejects.toThrow("UnknownSymbol");
});

it("retains ordered direct-definition native errors without inventing CheckResult indices", async () => {
  await runNativePortedCase(file,{name:"original direct errors",actions:[
    {definition:parserFailDefinition,expect:[{success:false},{parseErrors:2},{modulePresent:false},{binding:{name:"foo",present:false}}]},
    {definition:checkerFailDefinition,expect:[{success:false},{parseErrors:0},{definitionErrors:1},{modulePresent:true},
      {definitionError:0,kind:"TypeMismatch",location:[1,28,1,31]},{binding:{name:"bar",present:false}}]},
    {definition:duplicatePropertyDefinition,expect:[{success:false},{definitionErrors:2},
      {definitionError:0,kind:"GenericError"},
      {definitionError:0,message:"Cannot overload read type of non-function extern type member 'X'"},
      {definitionError:1,kind:"GenericError"},
      {definitionError:1,message:"Cannot overload write type of non-function extern type member 'X'"}]},
  ]},vi.fn());
});

it("checks immediate assertions before subsequent loads and preserves one actual fixture through mixed actions", async () => {
  let fixture: Awaited<ReturnType<typeof loadNativeFixture>> | undefined;
  await runNativePortedCase(file,{name:"operation points",actions:[
    {definition:"declare earlier: string",mandatory:true,expect:[{binding:{name:"earlier",present:true,type:{sameAsBuiltin:"string"}}},{binding:{name:"later",present:false}}]},
    {definition:"declare later: number",mandatory:true,expect:[{binding:{name:"later",present:true,type:{sameAsBuiltin:"number"}}}]},
    {check:{source:"local first = earlier; local second = later",expect:[{errors:0},{type:"first",equals:"string"},{type:"second",equals:"number"}]}},
  ]},vi.fn(),async () => fixture = await loadNativeFixture());
  expect(() => fixture!.heapBytes()).toThrow("Disposed native fixture host");
});

it("fails mandatory unsuccessful loads and wrong immediate assertions with final disposal", async () => {
  const fixtures: Awaited<ReturnType<typeof loadNativeFixture>>[] = [];
  const load = async () => { const fixture = await loadNativeFixture(); fixtures.push(fixture); return fixture; };
  await expect(runNativePortedCase(file,{name:"mandatory fail",actions:[{definition:parserFailDefinition,mandatory:true,expect:[{success:false}]}]},vi.fn(),load))
    .rejects.toThrow("mandatory native definition setup");
  await expect(runNativePortedCase(file,{name:"wrong immediate presence",actions:[
    {definition:"declare earlier: string",mandatory:true,expect:[{binding:{name:"later",present:true}}]},
    {definition:"declare later: number",mandatory:true,expect:[{success:true}]},
  ]},vi.fn(),load)).rejects.toThrow("Native global selection failed");
  fixtures.forEach(fixture => expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host"));
});

it("rejects raw structural assertions on genuine Bound wrappers even when the followed type matches", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture"); fixture.definition(externModuleDefinition);
    const raw = fixture.globalAlias(fixture.context(),"Foo"), wrapper = fixture.boundControl(raw);
    expect(fixture.facts(wrapper).kind).toBe("extern");
    expect(() => assertDefinitionType(fixture,wrapper,{rawKind:"extern"})).toThrow();
    assertDefinitionType(fixture,raw,{rawKind:"extern",definitionModuleName:"@test"});
    const context = fixture.context(); fixture.definition("declare changed: number");
    expect(fixture.observe("binding_facts",context.session,context.revision,"missing").message).toBe("Stale native result handle");
  } finally { fixture.dispose(); }
});

it("admits only the attested body New override and clears its allowance on reset and replacement", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("ExternTypeFixture"); fixture.flag("DebugLuauForceOldSolver",true);
    fixture.source("MainModule",explicitNewSource);
    expect(() => fixture.check("MainModule")).toThrow("requires selected new solver");
    expect(fixture.observe("select_new_solver","Old").message).toBe("Unsupported case-body solver override");
    fixture.selectNewSolver("New");
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    const checked = fixture.check("MainModule"); expect(checked.diagnostics.length).toBeGreaterThan(0);
    expect(fixture.moduleFacts(checked,"MainModule")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(false);
    fixture.reset(); fixture.source("MainModule",explicitNewSource);
    expect(() => fixture.check("MainModule")).toThrow("requires selected new solver");
    fixture.create("ExternTypeFixture"); fixture.source("MainModule",explicitNewSource);
    expect(() => fixture.check("MainModule")).toThrow("requires selected new solver");
    fixture.clearFlags(); fixture.create("Fixture"); expect(() => fixture.selectNewSolver("New")).toThrow("original fresh ExternTypeFixture");
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(false);
  } finally { fixture.dispose(); }
});

it("maps the original18-call logical arena bound and rejects unavailable/discarded graph facts", async () => {
  await runNativePortedCase(file,{name:"original metatable graph bound",source:graphCountSource,
    expect:[{moduleGraph:{module:"MainModule",maximumInternalTypes:80}}]},vi.fn());
  await expect(runNativePortedCase(file,{name:"discarded graph",retainFullTypeGraphs:false,source:"return 1",
    expect:[{moduleGraph:{module:"MainModule",maximumInternalTypes:80}}]},vi.fn())).rejects.toThrow("graph retention disabled");
});

it("restores clean applicable class graphs to unsupported fixture errors after real native initialization", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS","all");
  let fixture: Awaited<ReturnType<typeof loadNativeFixture>> | undefined;
  await expect(runNativePortedCase("TypeInfer.classes.test.cpp",{name:"isinstance_refines_imported_class",fixture:"unsupported semantic fixture",
    source:"return 1",module:"game/B",moduleSources:{"game/A":"return 1"},expect:[{errors:0}]},vi.fn(),async () => fixture = await loadNativeFixture()))
    .rejects.toThrow("the exact native fixture unsupported semantic fixture");
  expect(() => fixture!.heapBytes()).toThrow("Disposed native fixture host");
});
