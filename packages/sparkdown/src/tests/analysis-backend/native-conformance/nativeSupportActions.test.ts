import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runNativePortedCase, sourceChecksOf, type PortedCase, type Assertion } from "../../luau-conformance/typecheck/portedCases";
import { checkSyntaxOnly, nativeCaseChecker } from "../../luau-conformance/typecheckNativeRunner";
import { NativeCaseCaptures } from "../../luau-conformance/typecheckNativeActions";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { nonStrictDefinitions, nonTestableSource, stringFormatMismatchSource } from "./fixtureSources";

beforeEach(() => vi.stubEnv("LUAU_TYPECHECK_AREAS", "all"));
afterEach(() => vi.unstubAllEnvs());

// Exact pinned TypeInfer.builtins.test.cpp1406 source, no trailing newline.
const retainedFunctionSource = "local a = math.frexp";
// Exact pinned TypeInfer.modules.test.cpp210 sources after C++ phase-one CRLF -> LF.
const emptyModuleSource = `
    `;
const requireEmptyModuleSource = `
        local Hooty = require(script.Parent.A)
    `;
const sha = (source: string) => createHash("sha256").update(source, "utf8").digest("hex");
const skip = () => { throw Error("required original support case skipped"); };

it("dispatches the original retained frexp capture before the exact check and compares both saved levels afterward", async () => {
  const events: string[] = [];
  const load = vi.fn(async () => {
    const fixture = await loadNativeFixture();
    const create = fixture.create.bind(fixture), capture = fixture.capture.bind(fixture), levels = fixture.levels.bind(fixture);
    const source = fixture.source.bind(fixture), check = fixture.check.bind(fixture), dispose = fixture.dispose.bind(fixture);
    vi.spyOn(fixture, "create").mockImplementation((...args) => { events.push("create:" + args[0]); return create(...args); });
    vi.spyOn(fixture, "capture").mockImplementation((...args) => { events.push("capture:" + args.join(".")); return capture(...args); });
    vi.spyOn(fixture, "source").mockImplementation((...args) => {
      events.push("source:" + args[0]); expect(args[1]).toBe(retainedFunctionSource); return source(...args);
    });
    vi.spyOn(fixture, "check").mockImplementation((...args) => { events.push("check:" + args[0]); return check(...args); });
    vi.spyOn(fixture, "levels").mockImplementation((...args) => { events.push("levels"); return levels(...args); });
    vi.spyOn(fixture, "dispose").mockImplementation(() => { events.push("dispose"); return dispose(); });
    return fixture;
  });
  await runNativePortedCase("TypeInfer.builtins.test.cpp", {
    name: "no_persistent_typelevel_change", fixture: "BuiltinsFixture", actions: [
      { captureGlobalFunction: { as: "frexp", global: "math", property: "frexp" } },
      { check: { source: retainedFunctionSource, expect: [{ errors: 0 }] } },
      { expectCapturedLevels: { capture: "frexp", levelUnchanged: true, subLevelUnchanged: true } },
    ],
  }, skip, load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(events).toEqual(["create:BuiltinsFixture", "capture:math.frexp", "source:MainModule", "check:MainModule", "levels", "dispose"]);
});

it("dispatches the sole original checkNonStrict ICE assertion through the actual exception discriminant", async () => {
  const events: string[] = [];
  const load = vi.fn(async () => {
    const fixture = await loadNativeFixture(), create = fixture.create.bind(fixture), source = fixture.source.bind(fixture);
    const observe = fixture.observe.bind(fixture), dispose = fixture.dispose.bind(fixture);
    vi.spyOn(fixture, "create").mockImplementation((...args) => { events.push("create:" + args[0]); return create(...args); });
    vi.spyOn(fixture, "source").mockImplementation((...args) => {
      events.push("source:" + args[0]); expect(args[1]).toBe(nonTestableSource); return source(...args);
    });
    vi.spyOn(fixture, "observe").mockImplementation((operation, ...args) => {
      if (operation === "check_nonstrict") {
        events.push(operation); expect(args).toEqual(["MainModule", nonStrictDefinitions]);
      }
      return observe(operation, ...args);
    });
    vi.spyOn(fixture, "dispose").mockImplementation(() => { events.push("dispose"); return dispose(); });
    return fixture;
  });
  await runNativePortedCase("NonStrictTypeChecker.test.cpp", {
    name: "non_testable_type_throws_ice", fixture: "NonStrictTypeCheckerFixture", actions: [
      { checkThrows: { source: nonTestableSource, exception: "InternalCompilerError" } },
    ],
  }, skip, load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(events).toEqual(["create:NonStrictTypeCheckerFixture", "source:MainModule", "check_nonstrict", "dispose"]);
});

it("rejects a deliberately reversed structural TypeMismatchData assertion after a real exact-source check", async () => {
  const hosts: NativeFixture[] = [];
  let checks = 0;
  try {
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp", {
      name: "string_format_report_all_type_errors_at_correct_positions", fixture: "BuiltinsFixture",
      source: stringFormatMismatchSource, expect: [
        { errors: 6 }, { error: 0, location: [1, 26, 1, 27] },
        // Original pair is string/number. This added negative must fail via
        // the existing native structural comparator, not be silently ignored.
        { error: 0, typeMismatchData: { wanted: "number", given: "string" } },
      ],
    }, skip, async () => {
      const fixture = await loadNativeFixture(); hosts.push(fixture);
      const check = fixture.check.bind(fixture);
      vi.spyOn(fixture, "check").mockImplementation((...args) => {
        checks++;
        const result = check(...args);
        expect(result.diagnostics).toHaveLength(6);
        expect(fixture.mismatchEquals(result, 0, fixture.builtin(result, "number"), fixture.builtin(result, "string"))).toBe(false);
        return result;
      });
      return fixture;
    })).rejects.toThrow("native TypeMismatchData structural equality");
  } finally {
    expect(checks).toBe(1);
    expect(hosts).toHaveLength(1);
    expect(() => hosts[0]!.heapBytes()).toThrow("Disposed native fixture host");
  }
});

it("observes original module-local errors after the exact A-then-B checks without inventing an aggregate index", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    fixture.source("game/Workspace/A", emptyModuleSource);
    fixture.source("game/Workspace/B", requireEmptyModuleSource);
    fixture.check("game/Workspace/A");
    const result = fixture.check("game/Workspace/B");
    // Real setup controls precede the missing-observation assertion. No shared
    // parser waiver: this is the exact original raw-native operation sequence.
    expect(fixture.moduleFacts(result, "game/Workspace/A").name).toBe("game/Workspace/A");
    expect(fixture.moduleFacts(result, "game/Workspace/B").name).toBe("game/Workspace/B");
    expect(fixture.printed(fixture.binding(result, "game/Workspace/B", "Hooty"))).toBe("*error-type*");
    expect(typeof fixture.moduleDiagnostics, "required actual Module.errors scalar observation").toBe("function");
    const a = fixture.moduleDiagnostics(result, "game/Workspace/A");
    expect(a.module).toBe("game/Workspace/A"); expect(a.diagnostics).toHaveLength(0);
    const b = fixture.moduleDiagnostics(result, "game/Workspace/B");
    expect(b.module).toBe("game/Workspace/B"); expect(b.diagnostics).toHaveLength(1);
    expect(b.diagnostics[0]!.moduleIndex).toBe(0);
    expect(b.diagnostics[0]!.kind).toBe("IllegalRequire");
    expect(Object.hasOwn(b.diagnostics[0]!, "nativeIndex")).toBe(false);
  } finally { fixture.dispose(); }
});

it("dispatches all six original structural data predicates after their separate original locations", async () => {
  const expectOriginal: Assertion[] = [{errors:6}];
  const pairs = [
    { location: [1,26,1,27], wanted: "string", given: "number" },
    { location: [1,29,1,36], wanted: "number", given: "string" },
    { location: [1,38,1,42], wanted: "string", given: "boolean" },
    { location: [2,32,2,33], wanted: "string", given: "number" },
    { location: [2,35,2,42], wanted: "number", given: "string" },
    { location: [2,44,2,48], wanted: "string", given: "boolean" },
  ] as const;
  for (const [index,pair] of pairs.entries()) {
    expectOriginal.push({error:index,location:[...pair.location]});
    expectOriginal.push({error:index,typeMismatchData:{wanted:pair.wanted,given:pair.given}});
  }
  const compared: number[] = [];
  await runNativePortedCase("TypeInfer.builtins.test.cpp",{
    name:"string_format_report_all_type_errors_at_correct_positions",fixture:"BuiltinsFixture",
    source:stringFormatMismatchSource,expect:expectOriginal,
  },skip,async () => {
    const fixture = await loadNativeFixture(), compare = fixture.mismatchEquals.bind(fixture);
    vi.spyOn(fixture,"mismatchEquals").mockImplementation((...args) => { compared.push(args[1]); return compare(...args); });
    return fixture;
  });
  expect(compared).toEqual([0,1,2,3,4,5]);
});

it("rejects a structural predicate on a real wrong diagnostic kind without matching printed fields", async () => {
  await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",{
    name:"wrong-kind structural control",fixture:"BuiltinsFixture",source:"local value = missing",expect:[
      {errors:1},{error:0,code:"UnknownSymbol"},{error:0,typeMismatchData:{wanted:"string",given:"number"}},
    ],
  },skip)).rejects.toThrow("native TypeMismatchData structural equality");
});

it("keeps structural diagnostic callbacks bound to the actual result and revision", async () => {
  const fixture = await loadNativeFixture();
  try {
    const check = nativeCaseChecker(fixture);
    const old = check(stringFormatMismatchSource,{fixture:"BuiltinsFixture"});
    const current = check(stringFormatMismatchSource,{fixture:"BuiltinsFixture"});
    expect(() => old.mismatchDataEquals!(old.diagnostics[0]!,{wanted:"string",given:"number"})).toThrow("Stale native");
    expect(() => current.mismatchDataEquals!(old.diagnostics[0]!,{wanted:"string",given:"number"})).toThrow("Foreign native diagnostic selection");
    expect(current.mismatchDataEquals!(current.diagnostics[0]!,{wanted:"string",given:"number"})).toBe(true);
  } finally { fixture.dispose(); }
});

it("rejects malformed, duplicate and unavailable capture labels before loading a native fixture", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  const check = {check:{source:retainedFunctionSource,expect:[{errors:0}]}};
  const invalid = [
    [{captureGlobalFunction:{as:"",global:"math",property:"frexp"}},check],
    [{captureGlobalFunction:{as:"frexp",global:"math",property:"frexp",extra:true}},check],
    [{expectCapturedLevels:{capture:"absent",levelUnchanged:true,subLevelUnchanged:true}},check],
    [{captureGlobalFunction:{as:"frexp",global:"math",property:"frexp"}},
      {captureGlobalFunction:{as:"frexp",global:"math",property:"frexp"}},check],
    [{captureGlobalFunction:{as:"frexp",global:"math",property:"frexp"}},check,
      {expectCapturedLevels:{capture:"frexp",levelUnchanged:false,subLevelUnchanged:true}}],
    [...Array.from({length:17},(_,index) => ({captureGlobalFunction:{as:"capture"+index,global:"math",property:"frexp"}})),check],
  ];
  for (const actions of invalid) {
    // Only malformed external inputs use a boundary cast.
    const record = {name:"invalid captured contract",fixture:"BuiltinsFixture",actions} as unknown as PortedCase;
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",record,skip,load)).rejects.toThrow();
  }
  expect(load).not.toHaveBeenCalled();
});

it("exposes failed actual capture setup before any original source check and disposes the case", async () => {
  const hosts: NativeFixture[] = [], sources: string[] = [];
  await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",{
    name:"missing capture property",fixture:"BuiltinsFixture",actions:[
      {captureGlobalFunction:{as:"missing",global:"math",property:"notAProperty"}},
      {check:{source:retainedFunctionSource,expect:[{errors:0}]}},
    ],
  },skip,async () => {
    const fixture = await loadNativeFixture(); hosts.push(fixture);
    const source = fixture.source.bind(fixture);
    vi.spyOn(fixture,"source").mockImplementation((...args) => { sources.push(args[0]); return source(...args); });
    return fixture;
  })).rejects.toThrow("Missing readable native property");
  expect(sources).toEqual([]); expect(hosts).toHaveLength(1);
  expect(() => hosts[0]!.heapBytes()).toThrow("Disposed native fixture host");
});

it("preserves real global captures through clear and rejects reset, foreign and disposed capture handles", async () => {
  const fixture = await loadNativeFixture();
  let peer: NativeFixture | undefined;
  try {
    peer = await loadNativeFixture();
    fixture.create("BuiltinsFixture"); peer.create("BuiltinsFixture");
    const captures = new NativeCaseCaptures(fixture);
    captures.capture({as:"frexp",global:"math",property:"frexp"});
    const own = fixture.capture("math","frexp"), foreign = peer.capture("math","frexp");
    expect(() => fixture.levels(foreign)).toThrow("Foreign native fixture handle");
    fixture.clearFrontend();
    captures.assert({capture:"frexp",levelUnchanged:true,subLevelUnchanged:true});
    fixture.reset();
    expect(() => captures.assert({capture:"frexp",levelUnchanged:true,subLevelUnchanged:true})).toThrow("Stale native function capture");
    fixture.dispose();
    expect(() => fixture.levels(own)).toThrow("Disposed native fixture host");
  } finally { fixture.dispose(); peer?.dispose(); }
});

it("does not treat an actual successful or wrong-fixture check as the expected ICE", async () => {
  for (const fixture of ["NonStrictTypeCheckerFixture","Fixture"] as const) {
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",{
      name:"actual non-ICE status",fixture,actions:[
        {checkThrows:{source:fixture === "Fixture" ? nonTestableSource : "local value = 1",exception:"InternalCompilerError"}},
      ],
    },skip)).rejects.toThrow("native expected InternalCompilerError");
  }
});

it("requires eligible expected-ICE source before native load and includes it as a logical manifest source", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  const record: PortedCase = {name:"invalid expected-ICE source",fixture:"NonStrictTypeCheckerFixture",actions:[
    {checkThrows:{source:"local =",exception:"InternalCompilerError"}},
  ]};
  expect(sourceChecksOf(record)).toEqual([{kind:"checkThrows",check:{source:"local =",exception:"InternalCompilerError"}}]);
  await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",record,skip,load)).rejects.toThrow("expected-ICE source");
  expect(load).not.toHaveBeenCalled();
});

it("rejects unsupported exception classes and post-ICE actions before loading", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  for (const actions of [
    [{checkThrows:{source:nonTestableSource,exception:"Error"}}],
    [{checkThrows:{source:nonTestableSource,exception:"InternalCompilerError",expect:[]}}],
    [{checkThrows:{source:nonTestableSource,exception:"InternalCompilerError"}},
      {check:{source:retainedFunctionSource,expect:[{errors:0}]}}],
  ]) {
    const record = {name:"invalid terminating action",fixture:"NonStrictTypeCheckerFixture",actions} as unknown as PortedCase;
    await expect(runNativePortedCase("NonStrictTypeChecker.test.cpp",record,skip,load)).rejects.toThrow();
  }
  expect(load).not.toHaveBeenCalled();
});

it("keeps inactive exception cases parse-only without initializing a native fixture", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS","");
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); }), skipped = vi.fn();
  await runNativePortedCase("NonStrictTypeChecker.test.cpp",{
    name:"non_testable_type_throws_ice",fixture:"NonStrictTypeCheckerFixture",actions:[
      {checkThrows:{source:nonTestableSource,exception:"InternalCompilerError"}},
    ],
  },skipped,load);
  expect(load).not.toHaveBeenCalled(); expect(skipped).toHaveBeenCalledTimes(1);
});

it("validates native module observation against missing, stale, foreign, reset and disposed contexts", async () => {
  const fixture = await loadNativeFixture();
  let peer: NativeFixture | undefined;
  try {
    peer = await loadNativeFixture();
    fixture.create("BuiltinsFixture"); peer.create("BuiltinsFixture");
    fixture.source("MainModule","local value = missing"); peer.source("MainModule","local value = missing");
    const result = fixture.check("MainModule"), foreign = peer.check("MainModule");
    expect(() => fixture.moduleDiagnostics(foreign,"MainModule")).toThrow("Foreign native fixture handle");
    expect(() => fixture.moduleDiagnostics(result,"absent")).toThrow("Missing native module");
    const before = fixture.moduleDiagnostics(result,"MainModule");
    expect(before.diagnostics).toHaveLength(1); expect(before.diagnostics[0]!.kind).toBe("UnknownSymbol");
    fixture.check("MainModule");
    expect(() => fixture.moduleDiagnostics(result,"MainModule")).toThrow("Stale native");
    fixture.reset(); fixture.source("OtherModule","local value = 1");
    const afterReset = fixture.check("OtherModule");
    expect(() => fixture.moduleDiagnostics(afterReset,"MainModule")).toThrow("Missing native module");
    // Previously returned scalars remain honest historical snapshots, not live handles.
    expect(before.diagnostics).toHaveLength(1);
    fixture.dispose();
    expect(() => fixture.moduleDiagnostics(afterReset,"OtherModule")).toThrow("Disposed native fixture host");
  } finally { fixture.dispose(); peer?.dispose(); }
});

it("dispatches module-local assertions and rejects a missing local index without an aggregate lookup", async () => {
  const original: Assertion[] = [{errors:1},{moduleDiagnostics:{module:"MainModule",errors:1}},
    {moduleDiagnostics:{module:"MainModule",moduleIndex:0,kind:"UnknownSymbol"}}];
  await runNativePortedCase("TypeInfer.builtins.test.cpp",{
    name:"module observation dispatch control",fixture:"BuiltinsFixture",source:"local value = missing",expect:original,
  },skip);
  await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",{
    name:"missing local index",fixture:"BuiltinsFixture",source:"local value = missing",expect:[
      ...original,{moduleDiagnostics:{module:"MainModule",moduleIndex:1,kind:"UnknownSymbol"}},
    ],
  },skip)).rejects.toThrow("actual native module diagnostic index");
});

it("rejects mixed/index-domain/mistyped support assertions before native setup", async () => {
  const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });
  for (const assertion of [
    {moduleDiagnostics:{module:"MainModule",nativeIndex:0,kind:"UnknownSymbol"}},
    {moduleDiagnostics:{module:"MainModule",errors:1,moduleIndex:0,kind:"UnknownSymbol"}},
    {moduleDiagnostics:{module:"MainModule",moduleIndex:-1,kind:"UnknownSymbol"}},
    {moduleDiagnostics:{module:"MainModule",errors:257}},
    {error:0,typeMismatchData:{wanted:"any",given:"number"}},
    {error:0,typeMismatchData:{wanted:"string",given:"number",reason:""}},
    {error:0,typeMismatchData:{wanted:"string",given:"number"},fields:{}},
  ]) {
    const record = {name:"invalid observation assertion",fixture:"BuiltinsFixture",source:"local value = missing",expect:[assertion]} as unknown as PortedCase;
    await expect(runNativePortedCase("TypeInfer.builtins.test.cpp",record,skip,load)).rejects.toThrow();
  }
  expect(load).not.toHaveBeenCalled();
});

it("rejects oversized actual module vectors rather than truncating or returning an empty list", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule",Array.from({length:257},(_,index) => `local value${index} = missing${index}`).join("\n"));
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(257);
    expect(() => fixture.moduleDiagnostics(result,"MainModule")).toThrow("Native module diagnostic limit256");
    fixture.source("MainModule","local value = missing");
    expect(fixture.moduleDiagnostics(fixture.check("MainModule"),"MainModule").diagnostics).toHaveLength(1);
  } finally { fixture.dispose(); }
});

it("keeps cached dependency module indices separate from the fresh aggregate result", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    fixture.source("game/Workspace/A","local value = unknown\nreturn value");
    fixture.source("game/Workspace/B","local dependency = require(script.Parent.A)\nlocal value = unknown\nreturn value");
    fixture.check("game/Workspace/A");
    const result = fixture.check("game/Workspace/B");
    const a = fixture.moduleDiagnostics(result,"game/Workspace/A"), b = fixture.moduleDiagnostics(result,"game/Workspace/B");
    expect(a.diagnostics).toHaveLength(1); expect(b.diagnostics).toHaveLength(1);
    expect(a.diagnostics[0]!.moduleIndex).toBe(0); expect(b.diagnostics[0]!.moduleIndex).toBe(0);
    expect(a.diagnostics[0]!.kind).toBe("UnknownSymbol"); expect(b.diagnostics[0]!.kind).toBe("UnknownSymbol");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.module).toBe("game/Workspace/B");
    expect(Object.hasOwn(a.diagnostics[0]!,"nativeIndex")).toBe(false);
    expect(Object.hasOwn(b.diagnostics[0]!,"nativeIndex")).toBe(false);
  } finally { fixture.dispose(); }
});

it("rejects actual scalar module output over1MiB without destroying its recoverable fixture", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    const longName = "missing" + "x".repeat(8000);
    fixture.source("MainModule",Array.from({length:200},(_,index) => `local value${index} = ${longName}${index}`).join("\n"));
    // The existing aggregate serializer cannot emit this actual large vector;
    // RequestError retains the checked context, which the new scalar operation
    // must independently bound. No diagnostic data is fabricated in JavaScript.
    expect(() => fixture.check("MainModule")).toThrow("Native observation output limit");
    const actual = fixture.context();
    expect(fixture.moduleFacts(actual,"MainModule").name).toBe("MainModule");
    expect(() => fixture.moduleDiagnostics(actual,"MainModule")).toThrow("Native observation output limit");
    fixture.source("MainModule","local value = missing");
    expect(fixture.moduleDiagnostics(fixture.check("MainModule"),"MainModule").diagnostics).toHaveLength(1);
  } finally { fixture.dispose(); }
});

it("retains the original actual native global FunctionType across the exact20-byte source as a setup control", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    const capture = fixture.capture("math", "frexp");
    const before = fixture.levels(capture).before;
    fixture.source("MainModule", retainedFunctionSource);
    expect(fixture.check("MainModule").diagnostics).toHaveLength(0);
    const levels = fixture.levels(capture);
    expect(levels.before).toEqual(before);
    expect(levels.after[0]).toBe(before[0]);
    expect(levels.after[1]).toBe(before[1]);
  } finally { fixture.dispose(); }
});

it("observes the original actual InternalCompilerError rather than a JS wrapper or setup failure", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("NonStrictTypeCheckerFixture"); fixture.source("MainModule", nonTestableSource);
    expect(fixture.observe("check_nonstrict", "MainModule", nonStrictDefinitions).status).toBe("internal-compiler-error");
    expect(() => fixture.check("MainModule")).toThrow("requires create");
  } finally { fixture.dispose(); }
});

it("preserves all original six location-then-structural-data assertions in exact native order", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", stringFormatMismatchSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toHaveLength(6);
    const builtins = { string: fixture.builtin(result, "string"), number: fixture.builtin(result, "number"), boolean: fixture.builtin(result, "boolean") };
    const original = [
      { location: [1, 26, 1, 27], wanted: builtins.string, given: builtins.number },
      { location: [1, 29, 1, 36], wanted: builtins.number, given: builtins.string },
      { location: [1, 38, 1, 42], wanted: builtins.string, given: builtins.boolean },
      { location: [2, 32, 2, 33], wanted: builtins.string, given: builtins.number },
      { location: [2, 35, 2, 42], wanted: builtins.number, given: builtins.string },
      { location: [2, 44, 2, 48], wanted: builtins.string, given: builtins.boolean },
    ];
    for (const [index, error] of original.entries()) {
      const actual = result.diagnostics[index]!;
      expect([actual.begin.line, actual.begin.column, actual.end.line, actual.end.column]).toEqual(error.location);
      expect(fixture.mismatchEquals(result, index, error.wanted, error.given)).toBe(true);
    }
    expect(fixture.mismatchEquals(result, 0, builtins.number, builtins.string)).toBe(false);
  } finally { fixture.dispose(); }
});

it("pins literal bytes and eligible1381 sources while retaining the separate879 entry-require syntax boundary", () => {
  for (const [source, hash] of [
    [retainedFunctionSource, "56efde15d5d21e53641e9f12d7a125b419746cbca93a0fa2557b50cbb4c1a45c"],
    [nonTestableSource, "421affb9e8b6e122e658bf33e297d04cbb658a26de862d81d2aa534d6df098df"],
    [stringFormatMismatchSource, "e4aa9b2debb88c67c9d17e2b1c486bdc0013ccb2d47bb29b120f7218f130fd84"],
    [emptyModuleSource, "4dc501d66cd78903b81b1a53459d0432939728c537bbe9ffab55ab81521cb352"],
    [requireEmptyModuleSource, "c3441299cf49c03b2fb694ec94fb5d8cf4c9879cf8808341807797d92ee0e3ec"],
  ] as const) expect(sha(source)).toBe(hash);
  for (const source of [retainedFunctionSource, nonTestableSource, stringFormatMismatchSource])
    expect(checkSyntaxOnly(source).syntaxDiagnostics).toEqual([]);
  expect(checkSyntaxOnly(requireEmptyModuleSource, { module: "game/Workspace/B", moduleSources: { "game/Workspace/A": emptyModuleSource } })
    .syntaxDiagnostics.length, "#879 shared entry parsing is a separate unresolved dependency").toBeGreaterThan(0);
});
