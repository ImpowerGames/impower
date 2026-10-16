import { expect, it } from "vitest";
import { currentNativeCase, withNativeCase } from "../../luau-conformance/typecheckNativeCase";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";

it("preinitializes only the current independent checks and retains each native result until case exit", async () => {
  const retained: NativeFixture[] = [];
  const report = await withNativeCase(5, scope => {
    expect(currentNativeCase()).toBe(scope);
    const results = Array.from({ length: 5 }, (_, index) => {
      const fixture = scope.acquire(); retained.push(fixture);
      fixture.create("Fixture"); fixture.source("MainModule", index % 2 ? "return 'different'" : "return 1");
      const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
      return { fixture, result, pack: fixture.modulePack(result, "MainModule") };
    });
    expect(() => scope.acquire()).toThrow("not preinitialized");
    results.forEach(({ fixture, pack }, index) => {
      expect(fixture.printedPack(pack)).toBe(index % 2 ? "string" : "number");
      expect(() => fixture.packFacts(results[(index + 1) % 5]!.pack, true)).toThrow("Foreign native fixture handle");
    });
    return results.length;
  });
  expect(report.value).toBe(5); expect(report.memory.instances).toBe(5);
  expect(report.memory.perInstancePeakBytes).toHaveLength(5);
  expect(report.memory.peakLinearBytes).toBeGreaterThanOrEqual(report.memory.initializedLinearBytes);
  retained.forEach(fixture => expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host"));
  expect(() => currentNativeCase()).toThrow("must be initialized asynchronously");
});

it("uses one case-owned instance for sequential SAME-fixture checks and disposes it on assertion failure", async () => {
  let retained: NativeFixture | undefined;
  await expect(withNativeCase(1, scope => {
    const fixture = scope.acquire(); retained = fixture;
    fixture.create("Fixture"); fixture.source("MainModule", "return 1");
    const first = fixture.check("MainModule"); const old = fixture.modulePack(first, "MainModule");
    expect(fixture.printedPack(old)).toBe("number");
    fixture.source("MainModule", "return 'next'");
    const second = fixture.check("MainModule"); expect(fixture.printedPack(fixture.modulePack(second, "MainModule"))).toBe("string");
    expect(() => fixture.printedPack(old)).toThrow("Stale native result handle");
    throw Error("deliberate case assertion failure");
  })).rejects.toThrow("deliberate case assertion failure");
  expect(() => retained!.heapBytes()).toThrow("Disposed native fixture host");
  const next = await withNativeCase(0, () => "parser-only");
  expect(next).toEqual({ value: "parser-only", memory: { instances: 0, initializedLinearBytes: 0, peakLinearBytes: 0, perInstancePeakBytes: [] } });
});

it("disposes already initialized real instances when a later load fails, and refuses overlapping cases", async () => {
  const loaded: NativeFixture[] = [];
  await expect(withNativeCase(3, () => { throw Error("callback must not run"); }, async () => {
    if (loaded.length === 2) throw Error("deliberate third initialization failure");
    const fixture = await loadNativeFixture(); loaded.push(fixture); return fixture;
  })).rejects.toThrow("deliberate third initialization failure");
  loaded.forEach(fixture => expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host"));
  await withNativeCase(0, async () => {
    await expect(withNativeCase(1, () => undefined)).rejects.toThrow("cannot overlap");
  });
});
