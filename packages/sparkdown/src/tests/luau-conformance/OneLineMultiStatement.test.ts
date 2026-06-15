import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua/Luau allows multiple statements on a single source line.
// `function f() local x = 5 return x end` declares a function whose
// body has two statements (the `local` declaration and the `return`).
//
// Sparkdown's grammar already accepts this syntactically — the parse
// tree captures both statements as siblings inside the
// `LuauVariableDefinition_content`. But the lowerer treated all
// non-VA, non-comma siblings as "trailing multi-RHS expression"
// values, silently dropping return / function-def / etc. as garbage
// expression operands.
//
// Fix: `lowerVariableDefinition` recognizes statement-like sibling
// names (LuauReturnStatement, LuauFunctionDefinition, LuauBreakStatement,
// etc.) — collects them into `trailingStatements` and lowers each via
// the main `lower()` dispatcher after the variable assignment. The
// resulting ParsedObjects are appended to the returned weave.
//
// Unlocks the common Luau IIFE-as-test idiom from upstream conformance
// fixtures: `assert((function() local x = 5 return x end)() == 5)`.

describe("one-line multi-statement function bodies", () => {
  test("local + return on one line", () => {
    const r = runConformanceSource(`function f() local x = 5 return x end
assert(f() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multiple locals + return on one line", () => {
    const r = runConformanceSource(`function f() local x = 5 local y = 6 return x + y end
assert(f() == 11)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("nested function definition + return on one line", () => {
    const r = runConformanceSource(`function f() local t = {} function t.g() return 42 end return t.g() end
assert(f() == 42)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE with multi-statement one-line body", () => {
    // The canonical Luau `assert(IIFE() == X)` form — the same shape
    // basic.luau and other upstream fixtures use to wrap test cases.
    const r = runConformanceSource(
      `assert((function() local x = 5 return x end)() == 5)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multi-target local + return on one line", () => {
    const r = runConformanceSource(`function f() local a, b = 1, 2 return a + b end
assert(f() == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: multi-line body still works", () => {
    // Make sure the trailing-statement detection didn't break the
    // common multi-line form.
    const r = runConformanceSource(`function f()
  local x = 5
  return x
end
assert(f() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("two same-line bare reassignments inside IIFE (basic.luau line 43)", () => {
    // Before the `LuauReassignment` end-pattern was widened to
    // terminate on a following `IDENT = ...` lookahead, the grammar
    // packed `a = 1 a = 2` into ONE LuauReassignment node — and the
    // lowerer silently dropped everything after the first
    // AccessPath + AssignmentOperation pair. `return a` then read
    // the still-1 value. Reproduces basic.luau line 43 verbatim.
    const r = runConformanceSource(
      `assert((function() a = 1 a = 2 return a end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("three same-line bare reassignments inside IIFE", () => {
    const r = runConformanceSource(
      `assert((function() a = 1 a = 2 a = 3 return a end)() == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("two same-line bare reassignments at top level", () => {
    // The top-level case already worked (covered separately), but
    // pin it here to lock in the no-regression baseline.
    const r = runConformanceSource(
      `a = 1 a = 2\nassert(a == 2, "got " .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("same-line bare reassignment doesn't swallow following `if`", () => {
    // The pre-existing keyword-boundary end pattern (covered by the
    // comment in the grammar) is still respected — the new
    // `IDENT = ...` lookahead is additive.
    const r = runConformanceSource(
      `b = 1 if b == 1 then b = 99 end\nassert(b == 99, "got " .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare reassign + multi-target swap on same line (basic.luau line 46)", () => {
    // The follow-up to the single-target packing bug: the
    // reassignment-start lookahead in LuauReassignment's end pattern
    // also has to recognise the multi-target form
    // (`IDENT , IDENT (... =)`). Without that extension, `b = 2`
    // would packs with `a, b = b, a`, and the lowerer drops the swap
    // — `return a` reads the stale `local a = 1` instead of the
    // post-swap `2`.
    const r = runConformanceSource(
      `assert((function() local a = 1 b = 2 a, b = b, a return a end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare reassign + multi-target multi-RHS on same line", () => {
    // The non-swap shape: `b = 2 a, b = 10, 20` — the multi-target
    // doesn't read either of its own LHS, but it's still a
    // multi-target. Same grammar bug; same fix.
    const r = runConformanceSource(
      `local a = 1 b = 2 a, b = 10, 20\nassert(a == 10, "got a=" .. tostring(a))\nassert(b == 20, "got b=" .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: multi-RHS for single LHS still parses as one stmt", () => {
    // Sanity-check the no-false-positive case. `a = b, c` is a
    // single-target reassignment whose RHS has a trailing
    // multi-expr (the extra values are discarded in Lua). The
    // grammar must NOT terminate at the comma. The added
    // reassignment-start lookahead requires `IDENT WS* ,
    // IDENT (... =)`, not just `IDENT WS* ,`, so this case is safe.
    const r = runConformanceSource(
      `local b = 7 local c = 11 local a a = b, c\nassert(a == 7, "got a=" .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
