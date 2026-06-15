import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau-superset semantics: a function parameter (or local variable)
// may shadow a top-level knot, function, stitch, or path-label name.
// Original ink's `CheckForNamingCollisions` errored on this; Luau
// allows it freely.
//
// The bite this addresses: closure upvalue capture in
// `lowerAnonymousFunction` collects every referenced free variable
// (including top-level user-defined callables) and PREPENDS them to
// the synthetic closure's parameter list. So an IIFE body that
// references `concat` will end up with a synthetic param `concat`,
// even if `function concat(...)` already exists at file scope. Before
// this fix, the path-resolution shadowing check at the bottom of
// `CheckForNamingCollisions` produced `Duplicate identifier
// `concat`. A function named `concat` already exists`. After the
// fix, that check is skipped for `SymbolType.Arg` / `SymbolType.Temp`.
//
// (The runtime side — actually resolving a closure-captured top-level
// callable correctly — is tracked separately; these tests focus on
// the compile-time shadowing diagnostic.)

describe("parameter / local shadowing of top-level knot names", () => {
  test("parameter shadows a top-level function", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `function f(helper) return helper end\n` +
      `assert(f(42) == 42, "got " .. tostring(f(42)))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
  });

  test("local shadows a top-level function", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `function f() local helper = 99 return helper end\n` +
      `assert(f() == 99, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
  });

  test("closure upval-as-parameter named after a top-level function", () => {
    // The basic.luau-line-354 shape: IIFE body references a top-level
    // function — the upval scan captures it, prepends it as a synthetic
    // parameter, and the compile-time shadowing check used to error.
    const r = runConformanceSource(
      `function concat(head) return tostring(head) end\n` +
      `local thunk = (function() return concat(1) end)\n` +
      `assert(true)`,
    );
    expect(
      r.errorMessages.filter(
        (e) =>
          !e.startsWith("RUNTIME") &&
          // Permit runtime "target not found" — separate closure-
          // resolution bug, not the shadowing one this test covers.
          !e.includes("target not found"),
      ),
    ).toEqual([]);
  });

  test("regression: top-level callable not affected if no shadowing", () => {
    // Plain top-level fn with no shadowing — must compile cleanly.
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `assert(helper() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
