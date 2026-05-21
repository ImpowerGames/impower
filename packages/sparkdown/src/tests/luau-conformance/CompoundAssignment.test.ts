import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("compound assignment", () => {
  test("obj.field += v", () => {
    const r = runConformanceSource(`local obj = { count = 10 }
obj.count += 5
assert(obj.count == 15, "got " .. tostring(obj.count))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("arr[i] += v", () => {
    const r = runConformanceSource(`local arr = { 10, 20, 30 }
arr[2] += 5
assert(arr[2] == 25, "got " .. tostring(arr[2]))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("obj.a.b += v (nested base)", () => {
    const r = runConformanceSource(`local obj = { inner = { count = 10 } }
obj.inner.count += 5
assert(obj.inner.count == 15, "got " .. tostring(obj.inner.count))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multiple compound assignments don't temp-collide", () => {
    // Each access path's source offset is unique, so the auto-generated
    // temp names (`__pa_base_<offset>`, `__pa_key_<offset>`) shouldn't
    // collide across statements in the same function body.
    const r = runConformanceSource(`local a = { x = 1 }
local b = { x = 2 }
a.x += 10
b.x += 20
assert(a.x == 11 and b.x == 22, "got " .. tostring(a.x) .. "," .. tostring(b.x))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
