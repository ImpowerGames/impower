import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

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
