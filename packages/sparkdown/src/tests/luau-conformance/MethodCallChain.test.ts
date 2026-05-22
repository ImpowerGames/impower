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
