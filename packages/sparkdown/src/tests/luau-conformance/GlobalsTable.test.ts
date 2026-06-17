import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau's `_G` global environment table, implemented as a runtime
// proxy rather than a real backing table:
//
//   - A bare `_G` reference resolves to an ObjectValue tagged with
//     `GLOBALS_PROXY_TAG` (`__globals_proxy`) — same marker-keyed
//     pattern as the `pairs`/`ipairs` builtin iterators.
//   - The `IndexValue` ControlCommand routes proxy reads to
//     `VariablesState.GetGlobalVariableValue` (global-ONLY lookup —
//     never call-stack temporaries, so a shadowing local is
//     invisible through `_G`). Misses push nil, not the generic
//     empty-string sentinel.
//   - The `StoreIndex` ControlCommand routes proxy writes to
//     `VariablesState.SetGlobal` (patch-aware, so snapshot/rewind
//     semantics match ordinary global assignment).
//   - Dotted reads (`_G.foo`) lower to `VariableReference([_G, foo])`;
//     the runtime's dotted-name fallback strips the `_G.` hop and
//     starts the walk at the global binding.
//
// Unlocks basic.luau lines 48-49.

describe("_G globals table", () => {
  test("dot write, bracket read (basic.luau line 48)", () => {
    const r = runConformanceSource(
      `assert((function() _G.foo = 1 return _G['foo'] end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bracket write, dot read (basic.luau line 49)", () => {
    const r = runConformanceSource(
      `assert((function() _G['bar'] = 1 return _G.bar end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("reading an absent global through _G is nil", () => {
    const r = runConformanceSource(
      `assert(_G['nope'] == nil)\nassert(_G.alsonope == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("_G reads the global even when a local shadows it", () => {
    // GetVariableWithName checks call-stack temps first (locals
    // shadow globals), so the proxy must use the global-only lookup.
    const r = runConformanceSource(
      `g = 7
local function f()
  local g = 99
  return _G.g
end
assert(f() == 7, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("_G write is visible as a plain global read", () => {
    const r = runConformanceSource(
      `_G.score = 42\nassert(score == 42, "got " .. tostring(score))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("plain global write is visible through _G", () => {
    const r = runConformanceSource(
      `lives = 3\nassert(_G.lives == 3)\nassert(_G['lives'] == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("dynamic key through _G", () => {
    // The proxy handles `[expr]` keys at runtime — no static-key
    // rewrite involved.
    const r = runConformanceSource(
      `hp = 11
local key = "hp"
assert(_G[key] == 11)
_G[key] = 12
assert(hp == 12, "got " .. tostring(hp))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(_G) is table", () => {
    const r = runConformanceSource(`assert(type(_G) == "table")`);
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
