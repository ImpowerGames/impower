import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runNativePortedCase, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { asymmetricExternSource, cyclicUnionSource, documentationDefinition } from "./fixtureSources";

beforeEach(() => vi.stubEnv("LUAU_TYPECHECK_AREAS","all"));
afterEach(() => vi.unstubAllEnvs());

async function recordFixture(events: string[]): Promise<NativeFixture> {
  const fixture = await loadNativeFixture();
  const create = fixture.create.bind(fixture), flag = fixture.flag.bind(fixture), synthetic = fixture.synthetic.bind(fixture);
  const source = fixture.source.bind(fixture), check = fixture.check.bind(fixture), dispose = fixture.dispose.bind(fixture);
  const observe = fixture.observe.bind(fixture);
  vi.spyOn(fixture,"create").mockImplementation((...args) => { events.push("create:"+args[0]); return create(...args); });
  vi.spyOn(fixture,"flag").mockImplementation((...args) => { events.push("flag:"+args[0]+"="+args[1]); return flag(...args); });
  vi.spyOn(fixture,"synthetic").mockImplementation((...args) => {
    events.push("synthetic:"+args[0]);
    if (args[0] === "asymmetricExtern") expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(false);
    return synthetic(...args);
  });
  vi.spyOn(fixture,"observe").mockImplementation((operation,...args) => {
    if (operation === "definition") events.push("definition");
    return observe(operation,...args);
  });
  vi.spyOn(fixture,"source").mockImplementation((...args) => { events.push("source:"+args[0]); return source(...args); });
  vi.spyOn(fixture,"check").mockImplementation((...args) => { events.push("check:"+args[0]); return check(...args); });
  vi.spyOn(fixture,"dispose").mockImplementation(() => { events.push("dispose"); dispose(); });
  return fixture;
}

const runCase = (file: string, record: PortedCase, events: string[]) =>
  runNativePortedCase(file,record,() => { throw Error("original synthetic case skipped"); },
    () => recordFixture(events));

it("dispatches exact union641 setup once in the original Fixture before its one original check", async () => {
  const events: string[] = [];
  await runCase("TypeInfer.unionTypes.test.cpp",{
    name:"indexing_into_a_cyclic_union_doesnt_crash",fixture:"Fixture",actions:[
      {syntheticSetup:"cyclicUnion"},
      {check:{source:cyclicUnionSource,ignoreMissingAnnotations:true,expect:[{errors:0}]}},
    ],
  },events);
  expect(events).toEqual(["create:Fixture","synthetic:cyclicUnion","source:MainModule","check:MainModule","dispose"]);
});

it("dispatches exact extern803 after its body flag and preserves every original ordered predicate", async () => {
  const events: string[] = [];
  await runCase("TypeInfer.externTypes.test.cpp",{
    name:"read_write_class_properties",fixture:"Fixture",flags:{DebugLuauForceOldSolver:false},actions:[
      {syntheticSetup:"asymmetricExtern"},
      {check:{source:asymmetricExternSource,expect:[
        {errors:1},{error:0,location:[1,40,1,48]},{error:0,code:"TypeMismatch"},
        {diagnosticType:[0,"wantedType"],sameAs:{builtin:"string"}},
        {diagnosticType:[0,"givenType"],sameAs:{builtin:"number"}},
      ]}},
    ],
  },events);
  expect(events).toEqual(["create:Fixture","flag:DebugLuauForceOldSolver=false","synthetic:asymmetricExtern",
    "source:MainModule","check:MainModule","dispose"]);
});

it("keeps the existing real native recipes as positive controls on the same exact sources", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture"); fixture.synthetic("cyclicUnion"); fixture.source("MainModule",cyclicUnionSource);
    const union = fixture.check("MainModule");
    expect(union.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).toEqual([]);
    fixture.create("Fixture"); fixture.flag("DebugLuauForceOldSolver",false);
    fixture.synthetic("asymmetricExtern"); fixture.source("MainModule",asymmetricExternSource);
    const external = fixture.check("MainModule");
    expect(external.diagnostics).toHaveLength(1);
    expect(external.diagnostics[0]).toMatchObject({kind:"TypeMismatch",begin:{line:1,column:40},end:{line:1,column:48}});
    expect(fixture.identical(fixture.errorType(external,0,"wanted"),fixture.builtin(external,"string"))).toBe(true);
    expect(fixture.identical(fixture.errorType(external,0,"given"),fixture.builtin(external,"number"))).toBe(true);
  } finally { fixture.dispose(); }
});

it("rejects unknown, extra-key and native-known third recipes before loading", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  // Only malformed external inputs use a runtime-boundary cast; valid cases above are typed.
  for (const action of [{syntheticSetup:"unknown"},{syntheticSetup:"variadicFunctions"},
    {syntheticSetup:1},{syntheticSetup:"cyclicUnion",extra:true}]) {
    const record = {name:"invalid finite recipe",fixture:"Fixture",actions:[action,
      {check:{source:cyclicUnionSource,expect:[{errors:0}]}}]} as unknown as PortedCase;
    await expect(runNativePortedCase("TypeInfer.unionTypes.test.cpp",record,vi.fn(),load))
      .rejects.toThrow("Invalid native synthetic setup action");
  }
  expect(load).not.toHaveBeenCalled();
});

it("rejects synthetic-only and mixed legacy alternatives before loading", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  const record: PortedCase = {name:"setup without original check",fixture:"Fixture",actions:[{syntheticSetup:"cyclicUnion"}]};
  await expect(runNativePortedCase("TypeInfer.unionTypes.test.cpp",record,vi.fn(),load))
    .rejects.toThrow("require an original check");
  const mixed = {...record,source:cyclicUnionSource,expect:[{errors:0}]} as unknown as PortedCase;
  await expect(runNativePortedCase("TypeInfer.unionTypes.test.cpp",mixed,vi.fn(),load))
    .rejects.toThrow("exclusive with source/checks");
  expect(load).not.toHaveBeenCalled();
});

it("lets the real wrong-preset guard fail and disposes the partially initialized case", async () => {
  const events: string[] = [];
  await expect(runCase("TypeInfer.unionTypes.test.cpp",{name:"wrong original preset",fixture:"BuiltinsFixture",
    actions:[{syntheticSetup:"cyclicUnion"},{check:{source:cyclicUnionSource,expect:[{errors:0}]}}]},events))
    .rejects.toThrow("exact Fixture preset");
  expect(events).toEqual(["create:BuiltinsFixture","synthetic:cyclicUnion","dispose"]);
});

it("does not reset, ignore or reorder a duplicate setup action", async () => {
  const events: string[] = [];
  await expect(runCase("TypeInfer.unionTypes.test.cpp",{name:"duplicate setup",fixture:"Fixture",actions:[
    {syntheticSetup:"cyclicUnion"},{syntheticSetup:"cyclicUnion"},
    {check:{source:cyclicUnionSource,expect:[{errors:0}]}},
  ]},events)).rejects.toThrow("fresh fixture before sources, definitions or checks");
  expect(events).toEqual(["create:Fixture","synthetic:cyclicUnion","synthetic:cyclicUnion","dispose"]);
});

it("does not move late setup ahead of a real original check", async () => {
  const events: string[] = [];
  await expect(runCase("TypeInfer.unionTypes.test.cpp",{name:"late setup",fixture:"Fixture",actions:[
    {check:{source:"local x = 1",expect:[{errors:0}]}},{syntheticSetup:"cyclicUnion"},
  ]},events)).rejects.toThrow("fresh fixture before sources, definitions or checks");
  expect(events).toEqual(["create:Fixture","source:MainModule","check:MainModule","synthetic:cyclicUnion","dispose"]);
});

it("keeps successful definition assertions before a rejected late setup", async () => {
  const events: string[] = [];
  await expect(runCase("TypeInfer.unionTypes.test.cpp",{name:"definition before setup",fixture:"Fixture",actions:[
    {definition:documentationDefinition,mandatory:true,expect:[{success:true}]},
    {syntheticSetup:"cyclicUnion"},{check:{source:cyclicUnionSource,expect:[{errors:0}]}},
  ]},events)).rejects.toThrow("fresh fixture before sources, definitions or checks");
  expect(events).toEqual(["create:Fixture","definition","synthetic:cyclicUnion","dispose"]);
});

it("retains one setup and one actual fixture across deliberate successive checks", async () => {
  const events: string[] = [];
  await runCase("TypeInfer.unionTypes.test.cpp",{name:"same graph two checks control",fixture:"Fixture",actions:[
    {syntheticSetup:"cyclicUnion"},
    {check:{source:cyclicUnionSource,ignoreMissingAnnotations:true,expect:[{errors:0}]}},
    {check:{source:cyclicUnionSource,ignoreMissingAnnotations:true,expect:[{errors:0}]}},
  ]},events);
  expect(events).toEqual(["create:Fixture","synthetic:cyclicUnion","source:MainModule","check:MainModule",
    "source:MainModule","check:MainModule","dispose"]);
});

it("initializes no native graph for an inactive parse-only case", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS","");
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); }), skip = vi.fn();
  await runNativePortedCase("TypeInfer.unionTypes.test.cpp",{name:"inactive graph",fixture:"Fixture",actions:[
    {syntheticSetup:"cyclicUnion"},{check:{source:cyclicUnionSource,expect:[{errors:0}]}},
  ]},skip,load);
  expect(load).not.toHaveBeenCalled(); expect(skip).toHaveBeenCalledTimes(1);
});

it("preserves native late-setup guards after source registration, typed binding and clear", async () => {
  const fixture = await loadNativeFixture();
  try {
    for (const operation of ["source","binding","clear"] as const) {
      fixture.create("Fixture");
      if (operation === "source") fixture.source("MainModule","local value = 1");
      else if (operation === "binding") fixture.bindGlobal("added",fixture.builtin(fixture.context(),"number"));
      else fixture.clearFrontend();
      expect(() => fixture.synthetic("cyclicUnion"),operation).toThrow("fresh fixture before sources, definitions or checks");
    }
  } finally { fixture.dispose(); }
});

it("exposes setup failure without leaking its partially initialized native host", async () => {
  const hosts: NativeFixture[] = [];
  await expect(runNativePortedCase("TypeInfer.unionTypes.test.cpp",{name:"failed graph setup",fixture:"BuiltinsFixture",actions:[
    {syntheticSetup:"cyclicUnion"},{check:{source:cyclicUnionSource,expect:[{errors:0}]}},
  ]},vi.fn(),async () => { const fixture = await loadNativeFixture(); hosts.push(fixture); return fixture; }))
    .rejects.toThrow("exact Fixture preset");
  expect(hosts).toHaveLength(1);
  expect(() => hosts[0]!.heapBytes()).toThrow("Disposed native fixture host");
});
