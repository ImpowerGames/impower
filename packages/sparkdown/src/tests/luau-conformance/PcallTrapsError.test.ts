import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Fix: stdlib `error(msg)` was using `story.AddError` which calls
// `ForceEnd` — wiping the call stack and defeating pcall's
// protection. Per `project_pcall_protected_dispatch.md`, stdlib
// entries that should be trappable MUST use `story.Error` (which
// throws a StoryException for the CallLuauFunctionProtected catch
// to handle). Switched `error` to `story.Error(message)`.
//
// Symptom before the fix: `pcall(function() error("oops") end)`
// would corrupt the eval state and the next ControlCommand
// (EvalEnd from the surrounding expression) would assert with
// "Not in expression evaluation mode" / "Expected to be in an
// expression when evaluating a string null".

describe("pcall traps `error()` calls", () => {
  test("pcall returns (false, msg) when callee calls error", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(ok == false, "ok = " .. tostring(ok))\n` +
      `assert(err == "oops" or (type(err) == "string" and err:find("oops")), "err = " .. tostring(err))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("pcall returns 2 values from select's perspective when error raises", () => {
    const r = runConformanceSource(
      `local n = select('#', pcall(function() error("oops") end))\n` +
      `assert(n == 2, "n=" .. tostring(n))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("execution continues after a trapped error", () => {
    const r = runConformanceSource(
      `pcall(function() error("ignored") end)\n` +
      `assert(true, "never reached if pcall corrupted state")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: error() outside pcall still propagates as a runtime error", () => {
    // Bare `error()` should still surface to the caller — pcall is
    // the trap mechanism; without pcall the error bubbles up.
    const r = runConformanceSource(`error("oops")`);
    // Expect a runtime error containing "oops".
    expect(
      r.errorMessages.some(
        (e) => e.startsWith("RUNTIME") && e.includes("oops"),
      ),
    ).toBe(true);
  });

  test("pcall over a successful callee returns (true, ...returns)", () => {
    const r = runConformanceSource(
      `local ok, a, b = pcall(function() return 1, 2 end)\n` +
      `assert(ok == true)\n` +
      `assert(a == 1 and b == 2, "a=" .. tostring(a) .. " b=" .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
