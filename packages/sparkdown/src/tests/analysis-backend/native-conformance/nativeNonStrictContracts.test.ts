import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runNativePortedCase, runAssertions, type Assertion, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import { checkSyntaxOnly } from "../../luau-conformance/typecheckNativeRunner";
import { nativeCaseChecker } from "../../luau-conformance/typecheckNativeRunner";
import { NativeCheckedType } from "../../luau-conformance/typecheckNativeQueries";
import { validateNativeCheckEntrypoint, validateSupportAssertions } from "../../luau-conformance/typecheckNativeActions";
import { loadNativeFixture, type NativeCheck, type NativeFixture, type NativeMode } from "./nativeFixture";
import { nonStrictDefinitions, nonStrictModuleA, nonStrictModuleB, negationFirstSource, negationSecondSource } from "./fixtureSources";

beforeEach(() => vi.stubEnv("LUAU_TYPECHECK_AREAS", "all"));
afterEach(() => vi.unstubAllEnvs());
const skip = () => { throw Error("required NonStrict contract case skipped"); };
const sha = (source: string) => createHash("sha256").update(source, "utf8").digest("hex");
const signature = (result: NativeCheck) => result.diagnostics.map(error => ({
  nativeIndex: error.nativeIndex, kind: error.kind, begin: error.begin, end: error.end,
}));

// Exact pinned literals after C++ phase-one CRLF -> LF, without trimming.
// NonStrictTypeChecker.test.cpp186 simple_non_strict_failure.
const simpleFailureSource = `
abs("hi")
`;
// TypeInfer.builtins.test.cpp201 builtin_tables_sealed.
const bit32Source = `
        local b = bit32
    `;
// NonStrictTypeChecker.test.cpp672 nonstrict_method_calls.
const methodSource = `
        local test = "test"
        test:lower()
    `;
// NonStrictTypeChecker.test.cpp691 unknown_globals_in_non_strict_1.
// Deliberately no directive: a directive would hide the configuration timing.
const unknownGlobalsSource = `
        foo = 5
        local wrong1 = foob

        local x = 12
        local wrong2 = x + foblm
    `;

it("dispatches the original first-begin variant before its scalar field after real native setup", async () => {
  let checks = 0;
  const hosts: NativeFixture[] = [];
  const assertions: Assertion[] = [
    { errors: 1 },
    { errorAtBegin: [1, 4], code: "CheckedFunctionCallError" },
    { errorAtBegin: [1, 4], fields: { checkedFunctionName: "abs" } },
  ];
  try {
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp", {
      name: "simple_non_strict_failure", fixture: "NonStrictTypeCheckerFixture",
      source: simpleFailureSource, expect: assertions,
    }, skip, async () => {
      const fixture = await loadNativeFixture(); hosts.push(fixture);
      const check = fixture.checkNonStrict.bind(fixture);
      vi.spyOn(fixture, "checkNonStrict").mockImplementation((...args) => {
        checks++;
        expect(args).toEqual(["MainModule", nonStrictDefinitions]);
        const actual = check(...args);
        expect(actual.diagnostics).toHaveLength(1);
        const index = fixture.firstErrorAt(actual, 1, 4);
        expect(index).toBe(0);
        expect(fixture.errorFacts(actual, index)).toMatchObject({
          kind: "CheckedFunctionCallError", fields: { checkedFunctionName: "abs" },
        });
        return actual;
      });
      return fixture;
    })).resolves.toBeUndefined();
  } finally {
    console.log(JSON.stringify({ control: "shared first-begin baseline", checks, hosts: hosts.length }));
    for (const host of hosts) expect(() => host.heapBytes()).toThrow("Disposed native fixture host");
  }
});

it("rejects a wrong shared table-state expectation on the original actual raw Sealed bit32", async () => {
  let rawStateObserved = false;
  const hosts: NativeFixture[] = [];
  const assertions: Assertion[] = [{ type: "b", tableState: "Generic" }];
  try {
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp", {
      // Added negative uses the original literal. Original state is Sealed;
      // it has no upstream zero-errors assertion, so none is added here.
      name: "builtin_tables_sealed wrong-state control", fixture: "BuiltinsFixture",
      source: bit32Source, expect: assertions,
    }, skip, async () => {
      const fixture = await loadNativeFixture(); hosts.push(fixture);
      const check = fixture.check.bind(fixture);
      vi.spyOn(fixture, "check").mockImplementation((...args) => {
        const actual = check(...args), table = fixture.mainType(actual, "b");
        expect(fixture.facts(table).rawTable).toBe(true);
        expect(fixture.tableState(table)).toBe(0); // Actual TableState::Sealed.
        rawStateObserved = true;
        return actual;
      });
      return fixture;
    })).rejects.toThrow();
  } finally {
    console.log(JSON.stringify({ control: "shared state baseline", rawStateObserved, hosts: hosts.length }));
    for (const host of hosts) expect(() => host.heapBytes()).toThrow("Disposed native fixture host");
  }
});

it("dispatches the exact in-place NonStrict builtin action before the original sole check", async () => {
  const events: string[] = [];
  const load = vi.fn(async () => {
    const fixture = await loadNativeFixture();
    const observe = fixture.observe.bind(fixture), dispose = fixture.dispose.bind(fixture);
    vi.spyOn(fixture, "observe").mockImplementation((operation, ...args) => {
      if (operation === "create" || operation === "nonstrict_builtin_globals") events.push(operation);
      if (operation === "source") {
        events.push(operation); expect(args[0]).toBe("MainModule"); expect(args[1]).toBe(methodSource);
      }
      if (operation === "check_nonstrict") {
        events.push(operation); expect(args).toEqual(["MainModule", nonStrictDefinitions]);
      }
      return observe(operation, ...args);
    });
    vi.spyOn(fixture, "dispose").mockImplementation(() => { events.push("dispose"); return dispose(); });
    return fixture;
  });
  const record: PortedCase = {
    name: "nonstrict_method_calls", fixture: "NonStrictTypeCheckerFixture", actions: [
      { nonstrictBuiltinGlobals: true },
      { check: { source: methodSource, expect: [{ errors: 0 }] } },
    ],
  };
  try {
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp", record, skip, load)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["create", "nonstrict_builtin_globals", "source", "check_nonstrict", "dispose"]);
  } finally {
    console.log(JSON.stringify({ control: "in-place registration baseline", loads: load.mock.calls.length, events }));
  }
});

it("preserves a prior explicit Nonstrict configuration for a subsequent directive-less named check", async () => {
  const observed: { module: string; requestedMode: NativeMode | "current"; errors: ReturnType<typeof signature> }[] = [];
  const hosts: NativeFixture[] = [];
  // These three checks are an added configuration control, not extra checks
  // inserted into either original named require case. First strict empty check
  // initializes the frontend, separating this gap from lazy initialization.
  const record: PortedCase = {
    name: "named check retains current configuration control", fixture: "Fixture", checks: [
      { source: "", mode: "strict", expect: [{ errors: 0 }] },
      { source: unknownGlobalsSource, mode: "nonstrict", expect: [{ errors: 2 }] },
      { source: unknownGlobalsSource, module: "Control/B", entrypoint: "module", expect: [{ errors: 2 }] },
    ],
  };
  try {
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp", record, skip, async () => {
      const fixture = await loadNativeFixture(); hosts.push(fixture);
      const check = fixture.check.bind(fixture);
      vi.spyOn(fixture, "check").mockImplementation((module, mode = "strict") => {
        const actual = check(module, mode);
        observed.push({ module, requestedMode: mode, errors: signature(actual) });
        return actual;
      });
      const named = fixture.checkModule.bind(fixture);
      vi.spyOn(fixture,"checkModule").mockImplementation(module => {
        const actual = named(module);
        observed.push({module,requestedMode:"current",errors:signature(actual)});
        return actual;
      });
      return fixture;
    })).resolves.toBeUndefined();
    expect(observed.map(value => [value.module,value.requestedMode])).toEqual([
      ["MainModule","strict"],["MainModule","nonstrict"],["Control/B","current"],
    ]);
    expect(observed[2]!.errors).toEqual(observed[1]!.errors);
  } finally {
    console.log(JSON.stringify({ control: "named current configuration baseline", observed }));
    for (const host of hosts) expect(() => host.heapBytes()).toThrow("Disposed native fixture host");
  }
});

async function ordinaryReference(initialized: boolean, mode: NativeMode): Promise<NativeCheck> {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture");
    if (initialized) fixture.builtin(fixture.context(), "number");
    fixture.source("MainModule", unknownGlobalsSource);
    return fixture.check("MainModule", mode); // Returned scalar snapshot, no escaped live handle query.
  } finally { fixture.dispose(); }
}

it("preserves the original count2 ordinary Nonstrict check on both lazy and initialized Fixture paths", async () => {
  const initialized = await ordinaryReference(true, "nonstrict");
  expect(initialized.diagnostics, "initialized original Nonstrict setup control").toHaveLength(2);
  const lazy = await ordinaryReference(false, "nonstrict");
  console.log(JSON.stringify({ control: "ordinary mode initialization timing", initialized: signature(initialized), lazy: signature(lazy) }));
  // Genuine d747 RED78578: lazy initialization returned3 instead of original2.
  expect(lazy.diagnostics, "original count2 after lazy frontend initialization").toHaveLength(2);
});

it("observes original native first-position fields and same-fixture sequence without fabricating ties", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", negationFirstSource);
    expect(fixture.checkNonStrict("MainModule", nonStrictDefinitions).diagnostics).toEqual([]);
    fixture.source("MainModule", negationSecondSource);
    const result = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(result.diagnostics).toHaveLength(2);
    for (const line of [2, 3]) {
      const index = fixture.firstErrorAt(result, line, 10);
      expect(fixture.errorFacts(result, index)).toMatchObject({
        kind: "CheckedFunctionCallError", begin: { line, column: 10 }, fields: { checkedFunctionName: "contrived" },
      });
    }
    expect(() => fixture.firstErrorAt(result, 2, 9)).toThrow("No native diagnostic");
    console.log(JSON.stringify({ control: "actual first-position vector", errors: signature(result),
      equalBeginPairs: result.diagnostics.flatMap((left, i) => result.diagnostics.slice(i + 1).filter(right =>
        left.begin.line === right.begin.line && left.begin.column === right.begin.column).map(right => [left.nativeIndex, right.nativeIndex])) }));
    fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(() => fixture.firstErrorAt(result, 2, 10)).toThrow("Stale native");
    // No tie assertion or filtered-vector claim follows from this two-line source.
  } finally { fixture.dispose(); }
});

it("distinguishes the original raw TableId from a real Bound wrapper despite equal followed state", async () => {
  const fixture = await loadNativeFixture();
  let peer: NativeFixture | undefined;
  try {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", bit32Source);
    const result = fixture.check("MainModule"), table = fixture.mainType(result, "b"), bound = fixture.boundControl(table);
    expect(fixture.facts(table).rawTable).toBe(true); expect(fixture.tableState(table)).toBe(0);
    expect(fixture.facts(bound)).toMatchObject({ rawTable: false, kind: "table" });
    expect(fixture.tableState(bound)).toBe(0);
    expect(fixture.identical(table, bound)).toBe(false);
    expect(fixture.identical(table, fixture.follow(bound))).toBe(true);
    peer = await loadNativeFixture(); peer.create("BuiltinsFixture");
    peer.source("MainModule", bit32Source); const foreign = peer.mainType(peer.check("MainModule"), "b");
    expect(() => fixture.tableState(foreign)).toThrow("Foreign native fixture handle");
    fixture.reset(); expect(() => fixture.facts(table)).toThrow("Stale native");
  } finally { fixture.dispose(); peer?.dispose(); }
});

it("establishes real NonStrict definitions and original method-source ingestion without claiming registration", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", simpleFailureSource);
    const first = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(first.diagnostics).toHaveLength(1);
    expect(fixture.errorFacts(first, fixture.firstErrorAt(first, 1, 4)).kind).toBe("CheckedFunctionCallError");
    fixture.source("MainModule", methodSource);
    const method = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(fixture.printed(fixture.mainType(method, "test"))).toBe("string");
    console.log(JSON.stringify({ control: "method source without missing in-place operation", errors: signature(method) }));
    // Whatever this actual result is, it is not the original registration recipe
    // and does not replace that missing setup with an invented zero-error proof.
  } finally { fixture.dispose(); }
});

it("pins exact source bytes and real mode references while retaining raw Module and shared879 boundaries", async () => {
  for (const [source, bytes, hash] of [
    [simpleFailureSource, 11, "183dee9ecddf3106f8dc9e8b54023b6b61f013186aee726ddb393278977995f6"],
    [bit32Source, 29, "55bb065632f1e02c50ac1159e9f602b03cf8017b1fa3d54784ef321b65d4a81a"],
    [methodSource, 54, "1210df7801dd7ec30317852ceef2e278d9b1cfbae1e5a8aa023a3d4d44e0018a"],
    [unknownGlobalsSource, 104, "535ee8f32837607eb10e53a4c85b88bdef76a4f4736a3bd878ed7864fe0991bf"],
  ] as const) {
    expect(Buffer.byteLength(source, "utf8")).toBe(bytes); expect(sha(source)).toBe(hash);
    expect(checkSyntaxOnly(source).syntaxDiagnostics).toEqual([]);
  }
  const strict = await ordinaryReference(true, "strict"), nonstrict = await ordinaryReference(true, "nonstrict");
  console.log(JSON.stringify({ control: "independent actual mode signatures", strict: signature(strict), nonstrict: signature(nonstrict) }));
  expect(nonstrict.diagnostics).toHaveLength(2);
  expect(signature(strict), "candidate must actually distinguish modes before proving config preservation").not.toEqual(signature(nonstrict));

  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture");
    fixture.source("Modules/A", nonStrictModuleA, "module"); fixture.source("Modules/B", nonStrictModuleB);
    const result = fixture.checkNonStrict("Modules/B", nonStrictDefinitions);
    expect(result.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.child(fixture.binding(result, "Modules/A", "e"), "read", "x"))).toBe("number");
    // This existing raw ordinary check is a setup control, not a named check proof.
  } finally { fixture.dispose(); }
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur for shared879"); });
  const record: PortedCase = { name: "non_strict_shouldnt_warn_on_require_module", fixture: "NonStrictTypeCheckerFixture",
    module: "Modules/B", source: nonStrictModuleB, moduleSources: { "Modules/A": nonStrictModuleA }, expect: [{ errors: 0 }] };
  await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp", record, skip, load))
    .rejects.toThrow("Sparkdown did not read the snippet as Luau");
  expect(load).not.toHaveBeenCalled();
});

it("rejects malformed first-begin descriptors before constructing a fixture", async () => {
  const load = vi.fn(loadNativeFixture);
  for (const assertion of [
    {errorAtBegin:[1,4],error:0,code:"CheckedFunctionCallError"},
    {errorAtBegin:[1],code:"CheckedFunctionCallError"},
    {errorAtBegin:[-1,4],code:"CheckedFunctionCallError"},
    {errorAtBegin:[1.5,4],code:"CheckedFunctionCallError"},
    {errorAtBegin:[Number.MAX_SAFE_INTEGER,4],code:"CheckedFunctionCallError"},
    {errorAtBegin:[1,4]}, {errorAtBegin:[1,4],code:undefined},
    {errorAtBegin:[1,4],fields:null}, {errorAtBegin:[1,4],code:"CheckedFunctionCallError",extra:true},
  ]) {
    expect(() => validateSupportAssertions([assertion])).toThrow("first-begin");
    const record = {name:"malformed first-begin",fixture:"NonStrictTypeCheckerFixture",source:simpleFailureSource,expect:[assertion]} as unknown as PortedCase;
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",record,skip,load)).rejects.toThrow("first-begin");
  }
  expect(load).not.toHaveBeenCalled();
});

it("uses actual first-begin selection and rejects wrong kind, missing position and stale results", async () => {
  const fixture = await loadNativeFixture();
  try {
    const check = nativeCaseChecker(fixture);
    const result = check(simpleFailureSource,{fixture:"NonStrictTypeCheckerFixture"});
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnosticAtBegin!([1,4])).toBe(result.diagnostics[0]);
    expect(result.diagnosticAtBegin!([1,4]).data).toMatchObject({checkedFunctionName:"abs"});
    expect(() => runAssertions(result,{source:simpleFailureSource,expect:[{errorAtBegin:[1,4],code:"UnknownSymbol"}]})).toThrow();
    expect(() => result.diagnosticAtBegin!([1,3])).toThrow("No native diagnostic");
    check(simpleFailureSource,{fixture:"NonStrictTypeCheckerFixture"});
    expect(() => result.diagnosticAtBegin!([1,4])).toThrow("Stale native");
    expect(() => result.diagnosticAtBegin!([1,4],[])).toThrow("Stale native");
    fixture.reset();
    expect(() => result.diagnosticAtBegin!([1,4])).toThrow("Stale native");
  } finally { fixture.dispose(); }
});

it("preserves real diagnostic indices through subsets and rejects reordered, duplicate, foreign or mutated wrappers", async () => {
  const fixture = await loadNativeFixture();
  try {
    const check = nativeCaseChecker(fixture);
    expect(check(negationFirstSource,{fixture:"NonStrictTypeCheckerFixture"}).diagnostics).toEqual([]);
    const result = check(negationSecondSource,{fixture:"NonStrictTypeCheckerFixture"});
    expect(result.diagnostics).toHaveLength(2);
    const first = result.diagnostics[0]!, second = result.diagnostics[1]!;
    const subset = [second];
    expect(second.nativeIndex).toBe(1);
    expect(result.diagnosticAtBegin!([second.line,second.column],subset)).toBe(second);
    expect(second.data).toMatchObject({checkedFunctionName:"contrived"});
    expect(() => result.diagnosticAtBegin!([first.line,first.column],subset)).toThrow("No native diagnostic");
    expect(() => result.diagnosticAtBegin!([first.line,first.column],[second,first])).toThrow("reordered");
    expect(() => result.diagnosticAtBegin!([first.line,first.column],[first,first])).toThrow("duplicate");
    expect(() => result.diagnosticAtBegin!([first.line,first.column],[{...first}])).toThrow("Foreign");
    const nativeIndex = second.nativeIndex, line = second.line, message = second.message;
    try {
      second.nativeIndex = 0;
      expect(() => result.diagnosticAtBegin!([second.line,second.column],subset)).toThrow("mutated");
      second.nativeIndex = nativeIndex; second.line++;
      expect(() => result.diagnosticAtBegin!([second.line,second.column],subset)).toThrow("Mutated");
      second.line = line; second.message += " altered";
      expect(() => result.diagnosticAtBegin!([second.line,second.column],subset)).toThrow("Mutated");
    } finally { second.nativeIndex = nativeIndex; second.line = line; second.message = message; }
    expect(result.diagnosticAtBegin!([second.line,second.column],subset)).toBe(second);
  } finally { fixture.dispose(); }
});

it("requires the actual raw table before state and never queries followed state for a Bound, primitive or pack", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule",bit32Source);
    const result = fixture.check("MainModule"), table = fixture.mainType(result,"b"), bound = fixture.boundControl(table);
    const state = vi.spyOn(fixture,"tableState");
    expect(new NativeCheckedType(fixture,table).tableState).toBe("Sealed");
    expect(state).toHaveBeenCalledTimes(1); state.mockClear();
    for (const selected of [bound,fixture.builtin(result,"number"),fixture.modulePack(result,"MainModule")])
      expect(() => new NativeCheckedType(fixture,selected).tableState).toThrow();
    expect(state).not.toHaveBeenCalled();
    fixture.reset();
    expect(() => new NativeCheckedType(fixture,table).tableState).toThrow("Stale native");
  } finally { fixture.dispose(); }
});

it("rejects malformed state and named entrypoint metadata before native loading", async () => {
  const load = vi.fn(loadNativeFixture);
  for (const assertion of [{type:"b",tableState:"Unknown"},{tableState:"Sealed"},{type:"b",global:"b",tableState:"Sealed"},
    {type:"b",tableState:null},{type:"b",tableState:"Sealed",extra:true}]) {
    expect(() => validateSupportAssertions([assertion])).toThrow("table-state");
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",{
      name:"malformed state",fixture:"BuiltinsFixture",source:bit32Source,expect:[assertion],
    } as unknown as PortedCase,skip,load)).rejects.toThrow("table-state");
  }
  for (const options of [{entrypoint:"unknown",module:"A"},{entrypoint:"module"},{entrypoint:"module",module:""},
    {entrypoint:"module",module:"A",mode:"strict"}]) {
    expect(() => validateNativeCheckEntrypoint(options)).toThrow("named check");
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",{
      name:"malformed named entrypoint",fixture:"BuiltinsFixture",source:"",expect:[{errors:0}],...options,
    } as unknown as PortedCase,skip,load)).rejects.toThrow("named check");
  }
  expect(load).not.toHaveBeenCalled();
});

it("rejects malformed, wrong-preset, duplicate or late shared registration actions before native loading", async () => {
  const load = vi.fn(loadNativeFixture);
  const check = {check:{source:methodSource,expect:[{errors:0}]}};
  for (const actions of [
    [{nonstrictBuiltinGlobals:false},check], [{nonstrictBuiltinGlobals:true,extra:true},check],
    [check,{nonstrictBuiltinGlobals:true}], [{nonstrictBuiltinGlobals:true},{nonstrictBuiltinGlobals:true},check],
    [{definition:"",expect:[{success:true}]},{nonstrictBuiltinGlobals:true},check],
    [{nonstrictBuiltinGlobals:true}], [{nonstrictBuiltinGlobals:"unknown"},check],
  ]) await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",{
    name:"invalid registration protocol",fixture:"NonStrictTypeCheckerFixture",actions,
  } as unknown as PortedCase,skip,load)).rejects.toThrow("NonStrict builtin action");
  await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",{
    name:"wrong preset registration",fixture:"Fixture",actions:[{nonstrictBuiltinGlobals:true},check],
  } as unknown as PortedCase,skip,load)).rejects.toThrow("exact fresh NonStrict");
  expect(load).not.toHaveBeenCalled();
});

it("performs real once-only registration on the same arenas and resets eligibility without preserving old handles", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture");
    const scope = fixture.scopedFlagValue("DebugLuauForceOldSolver");
    fixture.nonStrictBuiltinGlobals();
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(scope);
    const context = fixture.context(), string = fixture.global(context,"string");
    expect(fixture.bindingFacts(context,"string").documentation).toBe("@luau/global/string");
    const captured = fixture.capture("string","len");
    expect(() => fixture.nonStrictBuiltinGlobals()).toThrow("fresh fixture");
    fixture.source("MainModule",methodSource);
    const checked = fixture.checkNonStrict("MainModule",nonStrictDefinitions);
    expect(checked.diagnostics).toEqual([]);
    expect(fixture.moduleFacts(checked,"MainModule")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
    // Retain and rebind the same actual FunctionType across the standard definition load.
    expect(fixture.levels(captured).after).toEqual(fixture.levels(captured).before);
    fixture.clearFrontend();
    expect(() => fixture.nonStrictBuiltinGlobals()).toThrow("fresh fixture");
    fixture.reset();
    expect(() => fixture.facts(string)).toThrow("Stale native");
    expect(() => fixture.levels(captured)).toThrow("Stale native");
    fixture.nonStrictBuiltinGlobals();
    fixture.source("MainModule",methodSource);
    expect(fixture.checkNonStrict("MainModule",nonStrictDefinitions).diagnostics).toEqual([]);
  } finally { fixture.dispose(); }
});

it("rejects native registration after source or definitions and on a wrong preset without replacing the session", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture"); const original = fixture.context();
    expect(() => fixture.nonStrictBuiltinGlobals()).toThrow("exact NonStrict fixture");
    expect(fixture.context()).toEqual(original);
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule",methodSource);
    expect(() => fixture.nonStrictBuiltinGlobals()).toThrow("fresh fixture");
    expect(fixture.checkNonStrict("MainModule",nonStrictDefinitions).diagnostics).toEqual([]);
    fixture.reset(); fixture.definition(nonStrictDefinitions);
    expect(() => fixture.nonStrictBuiltinGlobals()).toThrow("fresh fixture");
  } finally { fixture.dispose(); }
});

it("matches lazy and initialized Strict, Nonstrict and NoCheck references and preserves named transitions and directives", async () => {
  for (const mode of ["strict","nonstrict","nocheck"] as const)
    expect(signature(await ordinaryReference(false,mode))).toEqual(signature(await ordinaryReference(true,mode)));
  const references = new Map<NativeMode,ReturnType<typeof signature>>();
  for (const mode of ["strict","nonstrict","nocheck"] as const) references.set(mode,signature(await ordinaryReference(true,mode)));
  expect(references.get("strict")).not.toEqual(references.get("nonstrict"));
  expect(references.get("nocheck")).toEqual([]);
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture");
    expect(() => fixture.checkModule("Missing")).toThrow("Missing root module");
    for (const mode of ["nonstrict","nocheck","strict","nonstrict"] as const) {
      fixture.source("MainModule",unknownGlobalsSource);
      expect(signature(fixture.check("MainModule",mode))).toEqual(references.get(mode));
      fixture.source("Control/B",unknownGlobalsSource);
      expect(signature(fixture.checkModule("Control/B"))).toEqual(references.get(mode));
    }
    fixture.source("Directed","--!strict\n"+unknownGlobalsSource);
    const directed = fixture.checkModule("Directed");
    expect(directed.diagnostics).toHaveLength(3);
    expect(fixture.moduleFacts(directed,"Directed")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
    fixture.reset(); fixture.source("Control/B",unknownGlobalsSource);
    expect(signature(fixture.checkModule("Control/B"))).toEqual(references.get("strict"));
  } finally { fixture.dispose(); }
});

// Module labels differ between independently checked named sources; compare
// their complete scalar diagnostic payload, preserving raw vector order.
const definedSignature = (result: NativeCheck) => result.diagnostics.map(({nativeIndex,kind,code,message,begin,end}) => ({
  nativeIndex,kind,code,message,begin,end,
}));
async function definedNonStrictReference(mode: NativeMode): Promise<ReturnType<typeof definedSignature>> {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture");
    fixture.definition(nonStrictDefinitions);
    fixture.source("Reference",unknownGlobalsSource);
    return definedSignature(fixture.check("Reference",mode)); // No live handle escapes disposal.
  } finally { fixture.dispose(); }
}

it("retains Strict for fresh NonStrict named checks and loads the exact definitions at every real named operation", async () => {
  const strictReference = await definedNonStrictReference("strict");
  const nonstrictReference = await definedNonStrictReference("nonstrict");
  expect(strictReference).not.toEqual(nonstrictReference);
  console.log(JSON.stringify({control:"equivalent NonStrict definition environments",strict:strictReference,nonstrict:nonstrictReference}));
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.flag("DebugLuauForceOldSolver",true);
    fixture.source("First",unknownGlobalsSource);
    const strictNamed = fixture.checkNonStrictModule("First",nonStrictDefinitions);
    expect(definedSignature(strictNamed)).toEqual(strictReference);
    expect(fixture.moduleFacts(strictNamed,"First")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
    expect(strictNamed.effectiveFlags).toContainEqual({name:"DebugLuauForceOldSolver",value:false});
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    // Establish actual current NoCheck without a source directive, then restore
    // the requested body flag before the named helper scopes its New operation.
    fixture.clearFlags();
    fixture.flag("DebugLuauForceOldSolver",false);
    fixture.source("NoCheckSeed",unknownGlobalsSource);
    expect(fixture.check("NoCheckSeed","nocheck").diagnostics).toEqual([]);
    fixture.clearFlags();
    fixture.flag("DebugLuauForceOldSolver",true);
    fixture.source("NoCheckNamed",unknownGlobalsSource);
    const nocheckNamed = fixture.checkNonStrictModule("NoCheckNamed",nonStrictDefinitions);
    expect(nocheckNamed.diagnostics).toEqual([]);
    expect(fixture.moduleFacts(nocheckNamed,"NoCheckNamed")).toMatchObject({checkedInNewSolver:true,effectiveNewSolver:true});
    expect(nocheckNamed.effectiveFlags).toContainEqual({name:"DebugLuauForceOldSolver",value:false});
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    fixture.source("MainModule",unknownGlobalsSource);
    expect(fixture.checkNonStrict("MainModule",nonStrictDefinitions).diagnostics).toHaveLength(2);
    fixture.source("Second",unknownGlobalsSource);
    const nonstrictNamed = fixture.checkNonStrictModule("Second",nonStrictDefinitions);
    expect(definedSignature(nonstrictNamed)).toEqual(nonstrictReference);
    // A genuine malformed standard-definition input on a later call proves it
    // cannot reuse the prior successful load or silently route through ordinary check.
    fixture.source("Third",simpleFailureSource);
    expect(() => fixture.checkNonStrictModule("Third","declare function (")).toThrow("Native definition load failed");
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
  } finally { fixture.dispose(); }
});

it("runs shared NonStrict named dispatch rather than ordinary mode assignment on a same-fixture sequence", async () => {
  const strictReference = await definedNonStrictReference("strict");
  const nonstrictReference = await definedNonStrictReference("nonstrict");
  expect(strictReference).not.toEqual(nonstrictReference);
  const firstAssertions: Assertion[] = [
    {errors:strictReference.length},
    ...strictReference.map<Assertion>(error => ({
      error:error.nativeIndex,code:error.kind,
      location:[error.begin.line,error.begin.column,error.end.line,error.end.column],
    })),
  ];
  const events: string[] = [];
  const observed: ReturnType<typeof definedSignature>[] = [];
  const load = async () => {
    const fixture = await loadNativeFixture(), observe = fixture.observe.bind(fixture);
    const checkModule = fixture.checkNonStrictModule.bind(fixture), check = fixture.checkNonStrict.bind(fixture);
    vi.spyOn(fixture,"checkNonStrictModule").mockImplementation((module,definitions) => {
      const result = checkModule(module,definitions); observed.push(definedSignature(result)); return result;
    });
    vi.spyOn(fixture,"checkNonStrict").mockImplementation((module,definitions) => {
      const result = check(module,definitions); observed.push(definedSignature(result)); return result;
    });
    vi.spyOn(fixture,"observe").mockImplementation((operation,...args) => {
      if (operation === "check_nonstrict_module" || operation === "check_nonstrict") {
        expect(args[1]).toBe(nonStrictDefinitions); events.push(operation);
      }
      return observe(operation,...args);
    });
    return fixture;
  };
  await runNativePortedCase("NonStrictTypeChecker.test.cpp",{
    name:"shared named NonStrict control",fixture:"NonStrictTypeCheckerFixture",checks:[
      {source:unknownGlobalsSource,module:"First",entrypoint:"module",expect:firstAssertions},
      {source:unknownGlobalsSource,module:"MainModule",expect:[{errors:2}]},
      {source:unknownGlobalsSource,module:"Second",entrypoint:"module",expect:[{errors:2}]},
    ],
  },skip,load);
  expect(events).toEqual(["check_nonstrict_module","check_nonstrict","check_nonstrict_module"]);
  expect(observed).toEqual([strictReference,nonstrictReference,nonstrictReference]);
});

it("applies body flags at the real registration initialization and restores them across reset and disposal", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture");
    expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
    fixture.flag("DebugLuauUserDefinedClasses",true);
    fixture.nonStrictBuiltinGlobals();
    expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
    expect(fixture.printed(fixture.globalAlias(fixture.context(),"class"))).toBe("class");
    fixture.clearFlags();
    expect(fixture.printed(fixture.globalAlias(fixture.context(),"class"))).toBe("class");
    fixture.reset();
    expect(() => fixture.globalAlias(fixture.context(),"class")).toThrow("Missing native global alias");
    expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
    fixture.nonStrictBuiltinGlobals();
  } finally { fixture.dispose(); }
  expect(() => fixture.context()).toThrow("Disposed native fixture host");
});
