import { afterEach, expect, it, vi } from "vitest";
import { nativeCaseChecker } from "../../luau-conformance/typecheckNativeRunner";
import { runNativePortedCase, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import { checkSyntaxOnly } from "../../luau-conformance/typecheckNativeRunner";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";

afterEach(() => vi.unstubAllEnvs());
const cachedSource = "local x = missing";
const singletonSource = "local s: string = 'hello' local t = s:lower()";
const skip = () => { throw Error("Required fidelity control skipped"); };

it("preserves an unchanged named module's actual Strict cache across an ordinary NoCheck operation", async () => {
  const fixture = await loadNativeFixture();
  try {
    expect(checkSyntaxOnly(cachedSource).syntaxDiagnostics).toEqual([]);
    const check = nativeCaseChecker(fixture);
    const first = check(cachedSource, { module: "A", entrypoint: "module" });
    const vector = first.diagnostics.map(error => ({ code: error.code, line: error.line,
      column: error.column, endLine: error.endLine, endColumn: error.endColumn, message: error.message }));
    expect(vector).toHaveLength(1);
    expect(vector[0]?.code).toBe("UnknownSymbol");
    expect(check("", { mode: "nocheck" }).diagnostics).toEqual([]);
    // This reference establishes that the actual current config would differ
    // on a fresh module; a directive cannot mask the required cached behavior.
    expect(check(cachedSource, { module: "Fresh", entrypoint: "module" }).diagnostics).toEqual([]);
    const cached = check(cachedSource, { module: "A", entrypoint: "module" });
    expect(cached.diagnostics.map(error => ({ code: error.code, line: error.line,
      column: error.column, endLine: error.endLine, endColumn: error.endColumn, message: error.message }))).toEqual(vector);
  } finally { fixture.dispose(); }
  expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host");
});

it("clears actual cached module errors while retaining the same native builtin environment", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    fixture.source("A", cachedSource);
    fixture.source("MainModule", "");
    expect(fixture.checkModule("A").diagnostics.map(error => error.kind)).toEqual(["UnknownSymbol"]);
    const capture = fixture.capture("string", "len");
    expect(fixture.check("MainModule", "nocheck").diagnostics).toEqual([]);
    // Current NoCheck config does not change A's cached Strict errors. If clear
    // were ignored, the final named check would still retain this old error.
    expect(fixture.checkModule("A").diagnostics.map(error => error.kind)).toEqual(["UnknownSymbol"]);
    fixture.clearFrontend();
    const current = fixture.checkModule("A");
    expect(current.diagnostics).toEqual([]);
    expect(fixture.identical(fixture.capturedType(capture, current),
      fixture.child(fixture.global(current, "string"), "read", "len"))).toBe(true);
  } finally { fixture.dispose(); }
  expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host");
});

it("re-registers the real extern graph at definition operations while observations preserve current identity", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("ExternTypeFixture");
    fixture.definition("declare unrelatedFirst: number");
    const initial = fixture.context();
    const constructor = fixture.child(fixture.global(initial, "BaseClass"), "read", "New");
    expect(fixture.facts(constructor).kind).toBe("function");
    const capture = fixture.captureType(constructor);
    const firstClass = fixture.functionPack(constructor, "returns", false).head[0]!;
    expect(fixture.facts(firstClass)).toMatchObject({ kind: "extern", name: "BaseClass" });
    expect(fixture.identical(constructor,
      fixture.child(fixture.global(initial, "BaseClass"), "read", "New"))).toBe(true);

    fixture.definition("declare unrelatedSecond: number");
    const current = fixture.context();
    const retainedConstructor = fixture.capturedType(capture, current);
    const newConstructor = fixture.child(fixture.global(current, "BaseClass"), "read", "New");
    const retainedClass = fixture.functionPack(retainedConstructor, "returns", false).head[0]!;
    const newClass = fixture.functionPack(newConstructor, "returns", false).head[0]!;
    expect(fixture.facts(retainedClass)).toMatchObject({ kind: "extern", name: "BaseClass" });
    expect(fixture.facts(newClass)).toMatchObject({ kind: "extern", name: "BaseClass" });
    expect(fixture.identical(retainedClass, newClass)).toBe(false);
    expect(fixture.identical(newConstructor,
      fixture.child(fixture.global(current, "BaseClass"), "read", "New"))).toBe(true);
  } finally { fixture.dispose(); }
  expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host");
});

it("dispatches the original nested BuiltinsFixture lifetime in the same WASM before the sole original check", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS", "all");
  expect(singletonSource).toHaveLength(45);
  expect(checkSyntaxOnly(singletonSource).syntaxDiagnostics).toEqual([]);
  const positive = await loadNativeFixture();
  try {
    positive.create("BuiltinsFixture"); positive.source("MainModule", singletonSource);
    expect(positive.check("MainModule").diagnostics).toEqual([]);
  } finally { positive.dispose(); }
  const record: PortedCase = { name: "singleton_types", fixture: "BuiltinsFixture", actions: [
    { nestedBuiltinsFixture: true }, { check: { source: singletonSource, expect: [{ errors: 0 }] } },
  ] };
  const events: string[] = [], hosts: NativeFixture[] = [];
  const load = vi.fn(async () => {
    const fixture = await loadNativeFixture(); hosts.push(fixture);
    const observe = fixture.observe.bind(fixture);
    vi.spyOn(fixture, "observe").mockImplementation((operation, ...args) => {
      if (["create", "nested_builtins_fixture", "check"].includes(operation)) events.push(operation);
      if (operation === "assign_source") expect(args.slice(0, 2)).toEqual(["MainModule", singletonSource]);
      return observe(operation, ...args);
    });
    return fixture;
  });
  await runNativePortedCase("TypeInfer.primitives.test.cpp", record, skip, load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(events).toEqual(["create", "nested_builtins_fixture", "check"]);
  for (const host of hosts) expect(() => host.heapBytes()).toThrow("Disposed native fixture host");
});

it("distinguishes raw source assignment from explicit dirtying on the actual named native cache", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    fixture.assignSource("A", "local value = 1");
    let result = fixture.checkModule("A");
    expect(result.diagnostics).toEqual([]);
    const original = fixture.binding(result, "A", "value");
    expect(fixture.printed(original)).toBe("number");
    fixture.assignSource("A", "local value = 'changed'");
    expect(() => fixture.printed(original)).toThrow("Stale native result handle");
    result = fixture.checkModule("A");
    expect(fixture.printed(fixture.binding(result, "A", "value"))).toBe("number");
    fixture.source("A", "local value = 'changed'");
    result = fixture.checkModule("A");
    expect(result.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(result, "A", "value"))).toBe("string");
  } finally { fixture.dispose(); }
});

it("keeps actual extern constructor identity stable through module and type observations", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("ExternTypeFixture");
    fixture.source("MainModule", "local value = BaseClass.New()\nreturn value");
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    const constructor = fixture.child(fixture.global(result, "BaseClass"), "read", "New");
    const nativeClass = fixture.functionPack(constructor, "returns", false).head[0]!;
    expect(fixture.facts(nativeClass)).toMatchObject({ kind: "extern", name: "BaseClass" });
    expect(fixture.moduleFacts(result, "MainModule").checkedInNewSolver).toBe(true);
    fixture.scopes(result, "MainModule");
    fixture.modulePack(result, "MainModule");
    fixture.binding(result, "MainModule", "value");
    fixture.mainType(result, "value");
    fixture.globalBinding(result, "BaseClass");
    fixture.globalAlias(result, "BaseClass");
    expect(fixture.identical(constructor,
      fixture.child(fixture.global(result, "BaseClass"), "read", "New"))).toBe(true);
  } finally { fixture.dispose(); }
});

it("bounds native nested fixture setup by actual preset, timing, once-only lifetime and reset", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("Fixture");
    expect(() => fixture.nestedBuiltinsFixture()).toThrow("original fresh Builtins fixture");
    fixture.create("BuiltinsFixture");
    fixture.nestedBuiltinsFixture();
    expect(() => fixture.nestedBuiltinsFixture()).toThrow("original fresh Builtins fixture");
    fixture.reset(); fixture.nestedBuiltinsFixture();
    fixture.source("MainModule", singletonSource);
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    expect(() => fixture.nestedBuiltinsFixture()).toThrow("original fresh Builtins fixture");
    fixture.reset(); fixture.source("MainModule", singletonSource);
    expect(() => fixture.nestedBuiltinsFixture()).toThrow("original fresh Builtins fixture");
    fixture.dispose();
    expect(() => fixture.nestedBuiltinsFixture()).toThrow("Disposed native fixture host");
  } finally { fixture.dispose(); }
});

it("rejects malformed or reordered shared nested fixture actions before native construction", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS", "all");
  const check = { source: singletonSource, expect: [{ errors: 0 }] };
  const malformed = [
    { name: "wrong preset", fixture: "Fixture", actions: [{ nestedBuiltinsFixture: true }, { check }] },
    { name: "wrong value", fixture: "BuiltinsFixture", actions: [{ nestedBuiltinsFixture: false }, { check }] },
    { name: "extra key", fixture: "BuiltinsFixture", actions: [{ nestedBuiltinsFixture: true, extra: true }, { check }] },
    { name: "late", fixture: "BuiltinsFixture", actions: [{ check }, { nestedBuiltinsFixture: true }] },
    { name: "no check", fixture: "BuiltinsFixture", actions: [{ nestedBuiltinsFixture: true }] },
    { name: "null next", fixture: "BuiltinsFixture", actions: [{ nestedBuiltinsFixture: true }, null] },
    { name: "fixture swap", fixture: "BuiltinsFixture", actions: [{ nestedBuiltinsFixture: true }, { check: { ...check, fixture: "Fixture" } }] },
  ];
  for (const candidate of malformed) {
    const load = vi.fn(async (): Promise<NativeFixture> => { throw Error("Unexpected native initialization"); });
    await expect(runNativePortedCase("TypeInfer.primitives.test.cpp", candidate as unknown as PortedCase, skip, load))
      .rejects.toThrow("Nested Builtins fixture requires");
    expect(load).not.toHaveBeenCalled();
  }
});
