import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";
import { diagnoseDetailed } from "./diagnosticTestHarness";

// A `while` loop whose `do end` sits on one line has no
// `LuauDoBlock_content` node; the loop must still lower its condition.
describe("while loop with an empty one-line body", () => {
  test.each([
    "  while foo do end",
    "  while foo == 1 do end",
    "  while bar(foo) do end",
    "  while foo do end\n  print(1)",
  ])("%j warns about foo", (body) => {
    const warnings = diagnoseDetailed(`function run()\n${body}\nend\n`).filter(
      (d) => d.message === "Cannot find variable named `foo`",
    );
    expect(warnings).toHaveLength(1);
  });

  test("evaluates its condition on every iteration", () => {
    const r = runConformanceSource(
      `local n = 0\nlocal function step()\n  n = n + 1\n  return n < 3\nend\nwhile step() do end\nassert(n == 3, "n is " .. tostring(n))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
