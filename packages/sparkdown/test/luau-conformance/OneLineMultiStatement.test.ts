import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

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
    const r = runConformanceSource(`function f()
  local x = 5
  return x
end
assert(f() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("two same-line bare reassignments inside IIFE (basic.luau line 43)", () => {
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
    const r = runConformanceSource(
      `a = 1 a = 2\nassert(a == 2, "got " .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("same-line bare reassignment doesn't swallow following `if`", () => {
    const r = runConformanceSource(
      `b = 1 if b == 1 then b = 99 end\nassert(b == 99, "got " .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare reassign + multi-target swap on same line (basic.luau line 46)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 b = 2 a, b = b, a return a end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare reassign + multi-target multi-RHS on same line", () => {
    const r = runConformanceSource(
      `local a = 1 b = 2 a, b = 10, 20\nassert(a == 10, "got a=" .. tostring(a))\nassert(b == 20, "got b=" .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: multi-RHS for single LHS still parses as one stmt", () => {
    const r = runConformanceSource(
      `local b = 7 local c = 11 local a a = b, c\nassert(a == 7, "got a=" .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
