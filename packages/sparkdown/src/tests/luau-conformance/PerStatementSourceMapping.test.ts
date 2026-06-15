import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Per-statement source mapping at the Luau-runtime level.
//
// Before this fix, EVERY runtime ControlCommand inside a `function
// run() ... end` knot ended up with the same debug metadata —
// the function definition's range, not the individual statement's.
// `error("oops")` on user line N reported as line 1 (the formatter
// clamped to >= 1 because the lookup walked up to the function's
// L0 chunk-relative metadata and got a negative user line).
//
// Five coupled changes lit up per-statement granularity:
//
//   1. `appendBlockContent` copies the statement-level Weave
//      wrapper's debug metadata down to its unwrapped children
//      (preserving the per-statement line through re-parenting).
//   2. `wrapInWeave` optionally accepts a range + ctx so callers
//      that bypass `lower()`'s dispatcher (statement-level
//      FunctionCall / CallValueExpression sites in lowerStatements)
//      can stamp the wrapping Weave with the call's source range.
//   3. `SparkdownCompiler.populateLocations` falls back to
//      inherited metadata when an object has no own metadata —
//      ensuring every path has a location entry.
//   4. CheckForNamingCollisions: SymbolType.Temp can shadow
//      parameters (Luau allows `function f(b) local b = 1 end`).
//   5. `Divert.Error` forwards the `isWarning` flag when
//      propagating warnings from child objects (a pre-existing
//      inkjs bug — without this, the Luau-superset
//      "Can't use a divert target like that" warning surfaced as
//      a severity-1 error whenever its propagation chain crossed
//      a Divert ancestor).
//
// Plus a related fix in `lowerExpression.ts` (already covered by
// `ForLoopVarCapture.test.ts`): for-loop variable declarations are
// now recognized by `collectImmediateBodyDeclarations` /
// `scanFreeVariables` so they don't get captured as upvals.

describe("per-statement debug metadata at runtime", () => {
  // Each test verifies the formatter reports the EXACT user-fixture
  // line that `error()` was called from. `pathLocations` stores
  // `metadata.startLineNumber - 1`, and `metadata.startLineNumber` is
  // now correctly 1-based (`buildDebugMetadata` adds 1 to the 0-based
  // `ctx.lineNumber`), so the stored value is the true 0-based line and
  // the harness lookup uses `best + 1 - PREAMBLE_LINE_COUNT`.

  test("error() at user line 1 reports line 1", () => {
    const r = runConformanceSource(`error("oops")`, undefined, "smoke");
    expect(
      r.errorMessages.find((e) => e.includes("smoke:1: oops")),
    ).toBeDefined();
  });

  test("error() at user line 3 reports line 3", () => {
    const r = runConformanceSource(
      `local x = 1\nlocal y = 2\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:3: oops")),
    ).toBeDefined();
  });

  test("error() at user line 5 reports line 5", () => {
    const r = runConformanceSource(
      `local a = 1\nlocal b = 2\nlocal c = 3\nlocal d = 4\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:5: oops")),
    ).toBeDefined();
  });

  test("error() at user line 10 reports line 10", () => {
    const r = runConformanceSource(
      `local a = 1\nlocal b = 2\nlocal c = 3\nlocal d = 4\nlocal e = 5\n` +
      `local f = 6\nlocal g = 7\nlocal h = 8\nlocal i = 9\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:10: oops")),
    ).toBeDefined();
  });

  test("pcall captures the error()'s precise source line", () => {
    // basic.luau line 39 shape — verifies the line number flows
    // through pcall correctly. The error() is on user line 1.
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(err == "basic.luau:1: oops", "got " .. tostring(err))`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Temp shadows parameter (Luau spec)", () => {
  test("function f(b) local b = ... end compiles cleanly", () => {
    const r = runConformanceSource(
      `function f(b) local b = 99 return b end\nassert(f(1) == 99)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("inner local shadows param in nested block", () => {
    const r = runConformanceSource(
      `function f(b)\n  if b == 1 then local b = 100 return b end\n  return b\nend\nassert(f(1) == 100)\nassert(f(2) == 2)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Divert.Error forwards isWarning flag", () => {
  test("DivertTarget warning stays a warning (not severity 1)", () => {
    // The Luau-superset "Can't use a divert target like that" hint
    // fires whenever an anonymous function lowers to a
    // DivertTarget(synth_knot) value used in a non-call context.
    // Before the fix, that warning got re-routed as a severity-1
    // error when the propagation chain crossed a Divert ancestor.
    const r = runConformanceSource(
      `local function noinline(x, ...) local s, r = pcall(function(y) return y end, x) return r end\nassert(noinline(42) == 42)`,
    );
    // The fixture should compile cleanly — divert-target-related
    // warnings should NOT appear in errorMessages (severity 1).
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME"),
      ),
    ).toEqual([]);
  });
});
