import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau auto-global semantics: a bare `Y = expr` (no `local`) creates
// a global. Later `Y(args)` should dispatch on the closure value held
// by Y — same value-call path that user-defined method calls use,
// reached here via the variable-target divert.
//
// Previously failed at compile time with "target not found: `-> Y`"
// because `VariableAssignment.ResolveReferences` set the runtime
// assignment's `isGlobal = true` for the auto-global case but did NOT
// register Y in `story.variableDeclarations`. Without that
// registration, `Divert.ResolveTargetContent` couldn't recognize Y
// as a variable target. Worse, `ResolveTargetContent` runs early
// (during `Divert.GenerateRuntimeObject`, before the resolve pass)
// so even adding the registration during `ResolveReferences` wasn't
// enough on its own — the Divert also needs to retry resolution in
// its own `ResolveReferences`.
//
// Fixed by:
//   1. Registering auto-globals in `story.variableDeclarations`
//      from `VariableAssignment.ResolveReferences`.
//   2. Re-running `Divert.ResolveTargetContent` from
//      `Divert.ResolveReferences` when target+variable name both
//      remained unresolved after early resolution.

describe("Luau auto-global bare-call dispatch", () => {
  test("Y = function...; Y(F) — closure stored in auto-global", () => {
    const r = runConformanceSource(`Y = function(le) return le end
F = 42
fat = Y(F)
assert(fat == 42, "got " .. tostring(fat))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local Y baseline — already worked", () => {
    // Regression guard: the local form must keep working. The
    // auto-global registration shouldn't accidentally swallow local
    // declarations.
    const r = runConformanceSource(`local Y = function(le) return le end
local F = 7
local fat = Y(F)
assert(fat == 7, "got " .. tostring(fat))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("re-assignment to auto-global doesn't duplicate-register", () => {
    // A second `Y = ...` after the first should take the
    // already-resolved branch — no "Duplicate identifier" diagnostic.
    const r = runConformanceSource(`Y = function() return 1 end
Y = function() return 2 end
assert(Y() == 2, "got " .. tostring(Y()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("auto-global with non-function value — referenceable", () => {
    // Regression guard: bare assignment of a plain number should still
    // create a readable auto-global. (Existing Luau auto-global path
    // already handled this — included so the registration doesn't
    // narrow it to only callable values.)
    const r = runConformanceSource(`x = 42
assert(x == 42, "got " .. tostring(x))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
