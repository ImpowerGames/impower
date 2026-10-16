import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadNativeFixture, NativeFixture } from "./nativeFixture";
import { nilTypeFunctionSource, nonStrictDefinitions } from "./fixtureSources";

describe("official native fixture observations", () => {
  let fixture: NativeFixture;
  beforeEach(async () => { fixture = await loadNativeFixture(); });
  afterEach(() => { fixture?.dispose(); });

  it("rejects colliding tokens from an independent WASM instance across every handle family", async () => {
    const peer = await loadNativeFixture();
    try {
      fixture.create("BuiltinsFixture"); peer.create("BuiltinsFixture");
      const capture = fixture.capture("math", "frexp"), peerCapture = peer.capture("math", "frexp");
      fixture.source("MainModule", "local value = 1\nreturn value");
      peer.source("MainModule", "local value = 'different'\nreturn value");
      const result = fixture.check("MainModule"), peerResult = peer.check("MainModule");
      const type = fixture.binding(result, "MainModule", "value"), peerType = peer.binding(peerResult, "MainModule", "value");
      const pack = fixture.modulePack(result, "MainModule"), peerPack = peer.modulePack(peerResult, "MainModule");
      expect([result.session, result.revision]).toEqual([peerResult.session, peerResult.revision]);
      expect([type.session, type.revision, type.index]).toEqual([peerType.session, peerType.revision, peerType.index]);
      expect([pack.session, pack.revision, pack.index]).toEqual([peerPack.session, peerPack.revision, peerPack.index]);
      expect([capture.session, capture.environment, capture.index]).toEqual([peerCapture.session, peerCapture.environment, peerCapture.index]);
      expect(result.instance).not.toBe(peerResult.instance);
      expect(fixture.printed(type)).toBe("number"); expect(peer.printed(peerType)).toBe("string");
      const retained = peer.packFacts(peerPack, true).head[0]!;
      expect(peer.printed(retained)).toBe("string"); expect(peer.printed(peer.packFirst(peerPack))).toBe("string");
      expect(peer.levels(peerCapture).before).toEqual(peer.levels(peerCapture).after);
      const foreign = [() => peer.binding(result, "MainModule", "value"), () => peer.printed(type),
        () => peer.packFacts(pack, true), () => peer.levels(capture), () => peer.identical(peerType, type),
        () => peer.identicalPack(peerPack, pack), () => peer.subtypeOf(peerType, type), () => fixture.printed(retained),
        () => fixture.modulePack(peer.context(), "MainModule"), () => peer.capturedType(capture, peerResult),
        () => peer.capturedType(peerCapture, result), () => peer.captureType(type)];
      for (const operation of foreign) expect(operation).toThrow("Foreign native fixture handle");
      peer.reset(); expect(() => peer.printed(peerType)).toThrow("Stale native result handle");
      expect(() => peer.printed(type)).toThrow("Foreign native fixture handle");
      peer.dispose(); expect(() => peer.printed(peerType)).toThrow("Disposed native fixture host");
      expect(fixture.printed(type)).toBe("number");
    } finally { peer.dispose(); }
  });

  it("preserves distinct ordinary and builtins setups with a wrong-setup control", () => {
    fixture.create("Fixture");
    fixture.source("MainModule", "local x = math.abs(1)");
    expect(fixture.check("MainModule").diagnostics.some(error => error.message.includes("math"))).toBe(true);
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local x = math.abs(1)");
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(result, "MainModule", "x"))).toBe("number");
  });

  it("compares real identity separately from printed text and structural error data", () => {
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local x: number = 1\nlocal y: number = 'wrong'");
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toHaveLength(1);
    const x = fixture.binding(result, "MainModule", "x");
    const number = fixture.builtin(result, "number");
    const string = fixture.builtin(result, "string");
    expect(fixture.printed(x)).toBe("number");
    expect(fixture.identical(x, number)).toBe(true);
    expect(fixture.identical(x, string)).toBe(false);
    expect(fixture.mismatchEquals(result, 0, number, string)).toBe(true);
    expect(fixture.mismatchEquals(result, 0, string, number)).toBe(false);
  });

  it("rejects stale handles after source edits, reset and session replacement", () => {
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local x: number = 1");
    let result = fixture.check("MainModule");
    const old = fixture.binding(result, "MainModule", "x");
    fixture.source("MainModule", "local x: string = 'next'");
    expect(() => fixture.printed(old)).toThrow("Stale native result handle");
    result = fixture.check("MainModule");
    const next = fixture.binding(result, "MainModule", "x");
    expect(fixture.printed(next)).toBe("string");
    fixture.reset();
    expect(() => fixture.printed(next)).toThrow("Stale native result handle");
    fixture.source("MainModule", "local x = 2");
    result = fixture.check("MainModule");
    const reset = fixture.binding(result, "MainModule", "x");
    fixture.create("BuiltinsFixture");
    expect(() => fixture.printed(reset)).toThrow("Stale native result handle");
  });

  it("retains definition load order and same frontend mode transitions", () => {
    fixture.create("BuiltinsFixture");
    fixture.definition("export type A = { value: number }");
    fixture.definition("declare function getA(): A");
    fixture.source("MainModule", "local x: A = getA()");
    expect(fixture.check("MainModule", "nonstrict").diagnostics).toEqual([]);
    expect(fixture.check("MainModule", "strict").diagnostics).toEqual([]);
    fixture.create("BuiltinsFixture");
    expect(() => fixture.definition("declare function getA(): A")).toThrow("Native definition load failed");
  });

  it("captures the same native math.frexp function before and after checking", () => {
    fixture.create("BuiltinsFixture");
    const capture = fixture.capture("math", "frexp");
    fixture.source("MainModule", "local value, exponent = math.frexp(4)");
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
    const levels = fixture.levels(capture);
    expect(levels.after).toEqual(levels.before);
    fixture.reset();
    expect(() => fixture.levels(capture)).toThrow("Stale native function capture");
  });

  it("retains the exact global FunctionType and raw TypeId across definitions and frontend.clear", () => {
    fixture.create("BuiltinsFixture");
    const capture = fixture.capture("string", "len"), other = fixture.capture("math", "frexp");
    const initial = fixture.levels(capture), oldContext = fixture.context();
    const before = fixture.capturedType(capture, oldContext);
    expect(fixture.identical(before, fixture.child(fixture.global(oldContext, "string"), "read", "len"))).toBe(true);
    fixture.definition("declare unrelated: number");
    expect(() => fixture.printed(before)).toThrow("Stale native result handle");
    const afterDefinition = fixture.context(), retained = fixture.capturedType(capture, afterDefinition);
    expect(fixture.identical(retained, fixture.child(fixture.global(afterDefinition, "string"), "read", "len"))).toBe(true);
    expect(fixture.identical(retained, fixture.capturedType(other, afterDefinition))).toBe(false);
    expect(fixture.levels(capture).after).toEqual(initial.before);
    fixture.source("MainModule", "local a = string.len\nlocal function transient() return 1 end");
    const first = fixture.check("MainModule"); expect(first.diagnostics).toEqual([]);
    const transient = fixture.mainType(first, "transient");
    expect(fixture.facts(transient).kind).toBe("function");
    expect(() => fixture.captureType(transient)).toThrow("Native function capture requires fixture global or builtin arena ownership");
    const byType = fixture.captureType(fixture.capturedType(capture, first));
    expect(fixture.identical(fixture.capturedType(byType, first), fixture.capturedType(capture, first))).toBe(true);
    expect(fixture.identical(fixture.mainType(first, "a"), fixture.capturedType(capture, first))).toBe(true);
    fixture.clearFrontend();
    expect(fixture.levels(capture).after).toEqual(initial.before);
    const afterClear = fixture.context();
    expect(fixture.identical(fixture.capturedType(capture, afterClear), fixture.child(fixture.global(afterClear, "string"), "read", "len"))).toBe(true);
    fixture.source("MainModule", "return string.len");
    const second = fixture.check("MainModule"); expect(second.diagnostics).toEqual([]);
    expect(fixture.identical(fixture.packFirst(fixture.modulePack(second, "MainModule")), fixture.capturedType(capture, second))).toBe(true);
    fixture.reset(); expect(() => fixture.capturedType(capture, fixture.context())).toThrow("Stale native function capture");
    const current = fixture.capture("math", "frexp"); fixture.dispose();
    expect(() => fixture.levels(current)).toThrow("Disposed native fixture host");
  });

  it("rejects unknown and mistyped native flags and detects malformed definitions", () => {
    fixture.flag("NotARegisteredFlag", true, "initialization");
    expect(() => fixture.create("Fixture")).toThrow("Unknown or mistyped flag");
    fixture.clearFlags();
    fixture.flag("LuauNonStrictTypeCheckerRecursionLimit", true, "initialization");
    expect(() => fixture.create("Fixture")).toThrow("Unknown or mistyped flag");
    fixture.clearFlags();
    fixture.create("Fixture");
    const failed = fixture.observe("definition", "declare function broken(");
    expect(failed.status).toBe("ok");
    expect(failed.success).toBe(false);
    expect(failed.parseErrors).not.toEqual([]);
  });

  it("applies real case flags and restores their effective native values", () => {
    fixture.create("BuiltinsFixture");
    const baseline = fixture.flagValue("LuauConstraintGeneratorRecursionLimit");
    fixture.flag("LuauConstraintGeneratorRecursionLimit", 750);
    fixture.flag("DebugLuauAlwaysShowConstraintSolvingIncomplete", false);
    fixture.source("MainModule", "local x: number = 1");
    const result = fixture.check("MainModule");
    expect(result.effectiveFlags).toEqual([
      { name: "LuauConstraintGeneratorRecursionLimit", value: 750 },
      { name: "DebugLuauAlwaysShowConstraintSolvingIncomplete", value: false },
    ]);
    expect(fixture.flagValue("LuauConstraintGeneratorRecursionLimit")).toBe(baseline);
    expect(fixture.flagValue("DebugLuauAlwaysShowConstraintSolvingIncomplete")).toBe(true);
    fixture.clearFlags();
    fixture.flag("LuauConstraintGeneratorRecursionLimit", true);
    expect(() => fixture.check("MainModule")).toThrow("Unknown or mistyped flag");
    expect(fixture.flagValue("LuauConstraintGeneratorRecursionLimit")).toBe(baseline);
  });

  it("executes the exact upstream type function in the real VM with a wrong-return control", () => {
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", nilTypeFunctionSource);
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
    fixture.source("MainModule", nilTypeFunctionSource.replace("): nil return idx", "): number return idx"));
    expect(fixture.check("MainModule").diagnostics).not.toEqual([]);
  });

  it("loads exact non-strict definitions for repeated checks and rejects wrong setup", () => {
    expect(new TextEncoder().encode(nonStrictDefinitions)).toHaveLength(1061);
    fixture.create("NonStrictTypeCheckerFixture");
    fixture.source("MainModule", 'onlyNums(1, "wrong")');
    const first = fixture.checkNonStrict("MainModule", nonStrictDefinitions);
    expect(first.diagnostics).toHaveLength(1);
    expect(first.diagnostics[0]?.kind).toBe("CheckedFunctionCallError");
    expect(first.diagnostics[0]?.checkedFunctionName).toBe("onlyNums");
    expect(fixture.checkNonStrict("MainModule", nonStrictDefinitions).diagnostics).toEqual(first.diagnostics);
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", 'onlyNums(1, "wrong")');
    expect(() => fixture.checkNonStrict("MainModule", nonStrictDefinitions)).toThrow("Wrong fixture");
    expect(fixture.check("MainModule", "nonstrict").diagnostics[0]?.kind).not.toBe("CheckedFunctionCallError");
  });
});
