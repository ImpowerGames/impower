// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`), the
// DuplicateCondition rule. Snippets and expected messages are quoted
// verbatim and placed inside a function body; the upstream test-case name is
// in the comment above each group. Line numbers are 0-based, as upstream
// checks them. The rule is implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import { lintInFunction, lintMessagesInFunction } from "./diagnosticTestHarness";

// Luau: DuplicateConditions
describe("repeated conditions in if chains and and/or chains", () => {
  const lints = () =>
    lintInFunction(`
if true then
elseif false then
elseif true then -- duplicate
end

if true then
elseif false then
else
    if true then -- duplicate
    end
end

_ = true and true
_ = true or true
_ = (true and false) and true
_ = (true and true) and true
_ = (true and true) or true
_ = (true and false) and (42 and false)

_ = true and true or false -- no warning since this is is a common pattern used as a ternary replacement

_ = if true then 1 elseif true then 2 else 3
`);

  test("messages", () => {
    expect(lints().map((l) => l.message)).toEqual([
      "Condition has already been checked on line 2",
      "Condition has already been checked on column 5",
      "Condition has already been checked on column 5",
      "Condition has already been checked on column 6",
      "Condition has already been checked on column 6",
      "Condition has already been checked on column 6",
      "Condition has already been checked on column 15",
      "Condition has already been checked on column 8",
    ]);
  });

  test("the elseif and the parenthesized chain are reported on their lines", () => {
    const found = lints();
    expect(found[0]!.line + 1).toBe(4);
    expect(found[6]!.line + 1).toBe(19);
  });
});

// Luau: DuplicateConditionsExpr
describe("repeated compound conditions", () => {
  test("the same call with the same table and interpolation", () => {
    expect(
      lintInFunction(`
local correct, opaque = ...

if correct({a = 1, b = 2 * (-2), c = opaque.path['with']("calls", \`string {opaque}\`)}) then
elseif correct({a = 1, b = 2 * (-2), c = opaque.path['with']("calls", \`string {opaque}\`)}) then
elseif correct({a = 1, b = 2 * (-2), c = opaque.path['with']("calls", false)}) then
end
`),
    ).toEqual([
      { line: 4, message: "Condition has already been checked on line 4" },
    ]);
  });
});

// Luau: DuplicateConditionsIfStatAndExpr
//
// The grammar reads an if expression in this position as running on through
// the statement's own `then` and every following `elseif`, so the statement
// has one condition and nothing to compare.
describe.skip("an if expression as an if statement's condition (diverges: the grammar merges it into the statement)", () => {
  test("the same if expression twice in one chain", () => {
    expect(
      lintMessagesInFunction(`
if if 1 then 2 else 3 then
elseif if 1 then 2 else 3 then
elseif if 0 then 5 else 4 then
end
`),
    ).toEqual(["Condition has already been checked on line 2"]);
  });
});

// Sparkdown-specific: chains the rule must leave alone.
describe("distinct conditions are not reported", () => {
  test.each([
    ["different comparisons", "\nlocal a = 1\nif a == 1 then\nelseif a == 2 then\nend\n"],
    ["a and b or c", "\nlocal a, b, c = 1, 2, 3\n_ = a and b or c\n"],
    ["different arguments", "\nlocal f = print\n_ = f(1) or f(2)\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });
});
