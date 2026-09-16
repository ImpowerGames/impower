// Ported from Luau's compiler tests that assert a `CompileError`
// (`luau/tests/Compiler.test.cpp`). Snippets and expected messages are quoted
// verbatim; the upstream test-case name is in the comment above each group.
//
// Every group here is N/A: the messages describe Luau's register-based
// bytecode compiler (a `continue` jumping over a local's register, register
// and upvalue limits), and sparkdown lowers to the ink runtime, where a local
// is a named variable and `continue` is a divert. They are recorded so the
// gap is visible rather than silently absent.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: LoopContinueUntil / LoopContinueUntilCapture / LoopContinueRespectsExplicitConstant / LoopContinueIgnoresImplicitConstant
//
// In Luau a `continue` may not jump over a local that the `until` condition
// reads. Sparkdown reads the variable as nil in that case, which is what the
// runtime `local` semantics produce for any not-yet-assigned name.
describe.skip("continue jumping over a local read by `until` (N/A: locals are runtime variables, not registers)", () => {
  test("LoopContinueUntil", () => {
    const msgs = diagnoseInFunction(`repeat
    local r = math.random()
    if r > 0.5 then
        continue
    end
    local rr = r + 0.3
until rr < 0.5`);
    expect(msgs).toContain(
      "Local rr used in the repeat..until condition is undefined because continue statement on line 5 jumps over it",
    );
  });

  test("LoopContinueUntilCapture", () => {
    const msgs = diagnoseInFunction(`repeat
    local r = math.random()
    if r > 0.5 then
        continue
    end
    local rr = r + 0.3
until (function() return rr end)() < 0.5`);
    expect(msgs).toContain(
      "Local rr used in the repeat..until condition is undefined because continue statement on line 5 jumps over it",
    );
  });

  test("LoopContinueRespectsExplicitConstant", () => {
    const msgs = diagnoseInFunction(`repeat
    do continue end

    local c = true
until c`);
    expect(msgs).toContain(
      "Local c used in the repeat..until condition is undefined because continue statement on line 3 jumps over it",
    );
  });

  test("LoopContinueIgnoresImplicitConstant", () => {
    const msgs = diagnoseInFunction(`for i = 1, 2 do
    s()
    repeat
        if i == 2 then
            continue
        end
        local x = i == 1 or a
    until f(x)
end`);
    expect(msgs).toContain(
      "Local x used in the repeat..until condition is undefined because continue statement on line 6 jumps over it",
    );
  });
});

// Luau: LocalRegisterLimit / UpvalueRegisterLimit / RegisterLimit /
// InterpStringRegisterLimit / CompileError (too many locals)
//
// "Out of local registers when trying to allocate bar: exceeded limit 200",
// "Out of upvalue registers when trying to allocate foo100: exceeded limit 200",
// "Out of registers when trying to allocate 152 registers: exceeded limit 255",
// and an interpolated string with 254 `{1}` parts.
describe.skip("register limits (N/A: no register allocation)", () => {
  test("201 locals in one function", () => {
    const body = Array.from({ length: 201 }, (_, i) => `local foo${i}`).join(
      "\n",
    );
    expect(diagnoseInFunction(body).some((m) => m.startsWith("Out of"))).toBe(
      true,
    );
  });

  test("254 interpolations in one string", () => {
    const source = "local a = `" + "{1}".repeat(254) + "`";
    expect(diagnoseInFunction(source)).not.toEqual([]);
  });
});
