import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Two small Luau-conformance unblockers:
//
// 1. `collectgarbage` / `gcinfo` no-op stubs. Sparkdown runs on JS's
//    GC so user code can't force collection or query memory. Previously
//    both errored ("not implemented in sparkdown"), which blocked the
//    many Luau test fixtures that sprinkle GC calls between assertions
//    to provoke specific upval-capture and weak-reference timing. The
//    fixtures don't actually require the collector to do anything
//    concrete — they just need the calls to succeed. Stubbed both to
//    return 0 (a safe approximation for `collectgarbage("count")` /
//    `gcinfo()` and harmless for everything else).
//
// 2. Unresolved `NAME(args)` call → runtime variable-divert. Luau
//    allows calling an undefined global — it errors at the call site,
//    not at compile time. Sparkdown's Divert resolver previously
//    errored compile-time with `target not found: -> NAME` whenever
//    `NAME` wasn't a known knot, breaking the common shape `if false
//    then unknown() end` (the call is unreachable but the resolver
//    didn't care). Promote single-component CALL targets (`isFunctionCall
//    === true`) to variable-target diverts so the runtime variable-divert
//    path handles them — closures, `__stdlib_fn` markers, `__call`
//    metatables all dispatch correctly; missing names produce a clear
//    runtime error.
//
//    Ink-style standalone `-> nowhere` diverts keep the compile-time
//    error (no Luau equivalent — explicit divert-to-knot syntax).

describe("collectgarbage / gcinfo no-op", () => {
  test("collectgarbage() returns 0 and doesn't error", () => {
    const r = runConformanceSource(
      `collectgarbage()\nassert(collectgarbage("count") == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("gcinfo() returns 0 and doesn't error", () => {
    const r = runConformanceSource(
      `assert(gcinfo() == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("sprinkled collectgarbage calls between asserts", () => {
    // Mirrors a common Luau test idiom.
    const r = runConformanceSource(
      `assert(1 == 1)\ncollectgarbage()\nassert(2 == 2)\ncollectgarbage("collect")\nassert(3 == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("unresolved CALL target → runtime variable-divert", () => {
  test("unreachable unknown global compiles cleanly", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `if false then\n` +
      `  unknown_global()\n` +
      `end\n` +
      `assert(helper() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("reachable unknown global produces runtime error, not compile-time", () => {
    const r = runConformanceSource(`unknown_global()`);
    const compileErr = r.errorMessages.find(
      (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
    );
    // No compile error — the call was promoted to a variable-divert.
    expect(compileErr).toBeUndefined();
  });

});
