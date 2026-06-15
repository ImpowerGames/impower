import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `a:method(args).y` (method call followed by property/indexer access)
// requires the grammar's `LuauChainedPropertyAccess` rule. Without it,
// the trailing `.y` fell through to narrative `ImplicitAction`, which
// knocked the parser out of the enclosing function/block context and
// caused subsequent constructs to register as top-level Knot siblings
// instead of nested inside the harness wrap.
//
// These tests guard the GRAMMAR-LEVEL parse — runtime correctness of
// the chained dispatch is tested separately. The probes here use
// minimal-side-effect bodies so that even if the runtime semantics
// drift, the *compile* still succeeds with no chunk-boundary desync.

describe("method-call chain followed by property access", () => {
  // Pre-fix: the trailing `.y` after `a:m(x)` desynced the enclosing
  // wrap and subsequent top-level constructs ended up as Knot siblings
  // of `run` rather than nested. These tests guard the GRAMMAR-LEVEL
  // parse — runtime correctness of the chained dispatch through
  // user-defined table methods is a separate concern (currently the
  // method-call dispatch can't route through table-value methods).
  // We assert no "target not found" compile errors for siblings that
  // SHOULD have been nested.
  const compileNoDesync = (src: string) => {
    const r = runConformanceSource(src);
    // Filter out runtime errors and the expected method-dispatch
    // "target not found: -> <user method>" errors. What we WATCH for:
    // any "target not found" referencing a name OUTSIDE the chain
    // would indicate the wrap desynced.
    return r.errorMessages.filter(
      (e) =>
        !e.startsWith("RUNTIME") &&
        !e.includes("target not found: `-> add`") &&
        !e.includes("target not found: `-> map`"),
    );
  };

  test("a:m(x).y in do block — subsequent fn declaration stays nested", () => {
    // The marker check is just to make sure compile succeeds without
    // the desync-induced "Story already contains flow named marker".
    const compileErrs = compileNoDesync(`do
  local a = { x = 10, add = function(self, n) return self end }
  local r = a:add(10).x
end
function marker() return 1 end
marker()`);
    expect(compileErrs).toEqual([]);
  });

  test("a:m()[i] indexer-after-method — no desync of trailing code", () => {
    const compileErrs = compileNoDesync(`local a = { add = function(self) return { 1, 2, 3 } end }
local r = a:add()[2]
function marker() return 1 end
marker()`);
    expect(compileErrs).toEqual([]);
  });

  test("bracket-key table literal still parses", () => {
    // Regression guard: the chained-property rule must not steal `[`
    // at the start of a bracket-key table entry.
    const r = runConformanceSource(`local t = { ["name"] = "Anon", ["score"] = 42 }
assert(rawget(t, "name") == "Anon")
assert(rawget(t, "score") == 42)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Lua single-arg call sugar (`f[[...]]`, `f\"...\"`, `f{...}`)", () => {
  // Lua/Luau syntactic sugar: `f"str"`, `f[[long]]`, and `f{tbl}` are
  // function calls with a single string/table argument — equivalent
  // to `f("str")` etc. Pre-fix, the grammar matched the function-call
  // begin via `LUAU_FUNCTION_CALL_START` (which includes `[[`/`"`/`'`/`{`)
  // but `LuauFunctionCallParameters` only handled `(...)` form. The body
  // got stuck and the enclosing scope's `end`-matcher desynced.
  test("loadstring with long-string arg followed by next line", () => {
    const r = runConformanceSource(`local f = loadstring[[ return 1 ]]
local x = 2
assert(x == 2)`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("`f{...}` table-literal arg compiles without desync", () => {
    // Compile-time only — runtime lowering of the single-table-arg
    // sugar isn't fully wired yet, so we don't assert runtime values.
    const r = runConformanceSource(`local function f(t) return t end
local r = f{10, 20, 30}
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("`f\"...\"` single-string arg compiles without desync", () => {
    const r = runConformanceSource(`local function f(s) return s end
local r = f"hello"
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });
});

describe("block-form `if ... end` doesn't desync the parse", () => {
  // Before the LuauTernaryExpression discriminator + LuauReassignment
  // end-keyword fixes, an inline block-form `if cond then ... end`
  // would get parsed as a ternary (or swallowed into a preceding
  // reassignment), eat the trailing `end`, and cascade the parse out
  // of the enclosing function-body context. The downstream lowerer
  // then saw statements at top level instead of nested, producing
  // spurious "Cannot find variable" / "target not found" errors.
  //
  // These tests guard the COMPILE-time fix: the wrap is still nested
  // (no chunk-boundary desync) regardless of inline-if content.

  test("inline block-form `if ... else ... end` compiles cleanly", () => {
    // Pre-fix: the `else a = 2` had `=` which broke ternary matching
    // (good) but the `end` was still consumed by the outer parser
    // because LuauReassignment didn't stop on keyword boundaries.
    // Now both fixes together keep the parse contained.
    const r = runConformanceSource(`local function f()
  local a = 0
  if a then a = 1 else a = 2 end
  return a
end
local marker = 1`);
    // Only check compile cleanliness, not runtime correctness — `if 0`
    // truthiness semantics are a separate question we're not testing.
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("inline block-form `if ... end` (no else) compiles cleanly", () => {
    const r = runConformanceSource(`local function f()
  if true then return 1 end
  return 0
end
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });
});
