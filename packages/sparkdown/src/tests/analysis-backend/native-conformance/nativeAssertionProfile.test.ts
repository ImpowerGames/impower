import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { loadNativeFixture, validateNativeAssertionProfile } from "./nativeFixture";

it("rejects missing or assertion-disabled profile metadata from the actual generated manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../../native/luau-conformance/generated/manifest.json", import.meta.url), "utf8"));
  expect(() => validateNativeAssertionProfile(manifest)).not.toThrow();
  for (const invalid of [
    { ...manifest, compileProfile: undefined }, { ...manifest, assertionPolicy: undefined },
    { ...manifest, compileFlags: manifest.compileFlags.filter((value: string) => value !== "-DLUAU_ENABLE_ASSERT") },
    { ...manifest, compileProfile: "production" },
  ]) expect(() => validateNativeAssertionProfile(invalid)).toThrow("uniform assertion-enabled profile");
});

it("executes a true Luau assertion and restores the actual handler and scoped flags", async () => {
  const fixture = await loadNativeFixture();
  try {
    expect(fixture.assertionHandlerRestored()).toBe(true);
    fixture.create("Fixture");
    const baseline = fixture.flagValue("DebugLuauForceOldSolver");
    expect(baseline).toBe(false);
    fixture.flag("DebugLuauForceOldSolver", true);
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    fixture.assertionControl(true);
    expect(fixture.assertionHandlerRestored()).toBe(true);
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(baseline);
    fixture.clearFlags();
    fixture.source("MainModule", "local value = 1");
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
  } finally { fixture.dispose(); }
});

it("propagates a real false Luau assertion as a failed operation and tears down its actual session", async () => {
  const fixture = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture");
    const capture = fixture.capture("string", "len");
    fixture.source("MainModule", "local value = 1\nreturn value");
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    const type = fixture.binding(result, "MainModule", "value");
    const pack = fixture.modulePack(result, "MainModule");
    const failed = fixture.observe("assertion_control", 0);
    expect(failed.status).toBe("assertion-failure");
    expect(failed.assertion).toMatchObject({ expression: "false", function: "assertionControl" });
    const actual = failed.assertion as { file: string; line: number };
    expect(actual.file.endsWith("fixture-runtime.cpp")).toBe(true);
    expect(actual.line).toBeGreaterThan(0);
    expect(fixture.assertionHandlerRestored()).toBe(true);
    expect(() => fixture.printed(type)).toThrow("requires create");
    expect(() => fixture.packFacts(pack, true)).toThrow("requires create");
    expect(() => fixture.levels(capture)).toThrow("requires create");
    expect(() => fixture.moduleFacts(result, "MainModule")).toThrow("requires create");
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local value = 'recovered'");
    const current = fixture.check("MainModule");
    expect(current.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(current, "MainModule", "value"))).toBe("string");
    expect(() => fixture.printed(type)).toThrow("Stale native result handle");
    expect(() => fixture.levels(capture)).toThrow("Stale native function capture");
  } finally { fixture.dispose(); }
});

it("restores the case flag scope on actual assertion failure and supports an explicit fresh reset", async () => {
  const fixture = await loadNativeFixture();
  try {
    const outside = fixture.flagValue("DebugLuauForceOldSolver");
    fixture.create("Fixture");
    fixture.flag("DebugLuauForceOldSolver", true);
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    expect(fixture.observe("assertion_control", 0).status).toBe("assertion-failure");
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(outside);
    expect(fixture.assertionHandlerRestored()).toBe(true);
    expect(() => fixture.reset()).toThrow("requires create");
    fixture.clearFlags(); fixture.create("Fixture"); fixture.reset();
    fixture.assertionControl(true);
    expect(fixture.assertionHandlerRestored()).toBe(true);
  } finally { fixture.dispose(); }
});

it("keeps a peer's real handles and session unaffected by another instance's assertion failure", async () => {
  const fixture = await loadNativeFixture(), peer = await loadNativeFixture();
  try {
    fixture.create("BuiltinsFixture"); peer.create("BuiltinsFixture");
    fixture.source("MainModule", "local value = 1"); peer.source("MainModule", "local value = 2");
    const result = fixture.check("MainModule"), peerResult = peer.check("MainModule");
    const type = fixture.binding(result, "MainModule", "value"), peerType = peer.binding(peerResult, "MainModule", "value");
    expect([type.session, type.revision, type.index]).toEqual([peerType.session, peerType.revision, peerType.index]);
    expect(fixture.observe("assertion_control", 0).status).toBe("assertion-failure");
    expect(peer.printed(peerType)).toBe("number");
    expect(() => peer.printed(type)).toThrow("Foreign native fixture handle");
    expect(peer.assertionHandlerRestored()).toBe(true);
    peer.assertionControl(true);
  } finally { fixture.dispose(); peer.dispose(); }
});

it("rejects malformed and missing-session controls without accepting them as assertion failure", async () => {
  const fixture = await loadNativeFixture();
  try {
    expect(fixture.observe("assertion_control", 0)).toMatchObject({ status: "error", message: "Conformance session requires create" });
    fixture.create("Fixture");
    expect(fixture.observe("assertion_control", 2)).toMatchObject({ status: "error", message: "Invalid assertion profile control" });
    expect(fixture.assertionHandlerRestored()).toBe(true);
    fixture.assertionControl(true);
    fixture.dispose();
    expect(() => fixture.assertionControl(false)).toThrow("Disposed native fixture host");
  } finally { fixture.dispose(); }
});

it("fails a real nonfatal doctest CHECK operation and tears down its session with restored flags and handler", async () => {
  const fixture = await loadNativeFixture();
  try {
    const outside = fixture.flagValue("DebugLuauForceOldSolver");
    fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local value = 1");
    const result = fixture.check("MainModule");
    expect(result.diagnostics).toEqual([]);
    const type = fixture.binding(result, "MainModule", "value");
    expect(fixture.observe("doctest_control", 1)).toEqual({ status: "ok" });
    expect(fixture.printed(type)).toBe("number");
    fixture.flag("DebugLuauForceOldSolver", true);
    expect(fixture.scopedFlagValue("DebugLuauForceOldSolver")).toBe(true);
    expect(fixture.observe("doctest_control", 0)).toMatchObject({ status: "fixture-test-failure" });
    expect(() => fixture.printed(type)).toThrow("requires create");
    expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(outside);
    expect(fixture.assertionHandlerRestored()).toBe(true);
    fixture.clearFlags(); fixture.create("BuiltinsFixture");
    fixture.source("MainModule", "local value = 'recovered'");
    const current = fixture.check("MainModule");
    expect(current.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(current, "MainModule", "value"))).toBe("string");
    expect(() => fixture.printed(type)).toThrow("Stale native result handle");
  } finally { fixture.dispose(); }
});

it("discards an actually trapped WASM host while a peer remains usable", async () => {
  const fixture = await loadNativeFixture(), peer = await loadNativeFixture();
  try {
    fixture.create("Fixture"); peer.create("Fixture");
    expect(() => fixture.observe("assertion_debugbreak_control")).toThrow(WebAssembly.RuntimeError);
    expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host");
    expect(() => fixture.create("Fixture")).toThrow("Disposed native fixture host");
    peer.assertionControl(true);
    expect(peer.assertionHandlerRestored()).toBe(true);
    peer.source("MainModule", "local value = 1");
    expect(peer.check("MainModule").diagnostics).toEqual([]);
  } finally { fixture.dispose(); peer.dispose(); }
});
