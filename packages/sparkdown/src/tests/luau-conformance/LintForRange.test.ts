// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`), the
// ForRange rule. Snippets and expected messages are quoted verbatim and
// placed inside a function body; the upstream test-case name is in the
// comment above each group. Line numbers are 0-based, as upstream checks
// them. The rule is implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import { lintInFunction } from "./diagnosticTestHarness";

const BACKWARDS =
  "For loop should iterate backwards; did you forget to specify -1 as step?";

// Luau: ForRangeTable
describe("counting down from a table's length without a step", () => {
  test("for i=#t,1 warns; with -1 it does not", () => {
    expect(
      lintInFunction(`
local t = {}

for i=#t,1 do
end

for i=#t,1,-1 do
end
`),
    ).toEqual([{ line: 3, message: BACKWARDS }]);
  });
});

// Luau: ForRangeBackwards
describe("a constant range that runs backwards without a step", () => {
  test("for i=8,1 warns; with -1 it does not", () => {
    expect(
      lintInFunction(`
for i=8,1 do
end

for i=8,1,-1 do
end
`),
    ).toEqual([{ line: 1, message: BACKWARDS }]);
  });
});

// Luau: ForRangeImprecise
describe("a fractional range that stops short of its end", () => {
  test("for i=1.3,7.5 warns; with a step it does not", () => {
    expect(
      lintInFunction(`
for i=1.3,7.5 do
end

for i=1.3,7.5,1 do
end
`),
    ).toEqual([
      {
        line: 1,
        message:
          "For loop ends at 7.3 instead of 7.5; did you forget to specify step?",
      },
    ]);
  });
});

// Luau: ForRangeZero
describe("a range over a table that starts or ends at 0", () => {
  test("for i=0,#t and for i=#t,0 warn; (0) silences", () => {
    expect(
      lintInFunction(`
for i=0,#t do
end

for i=(0),#t do -- to silence
end

for i=#t,0 do
end
`),
    ).toEqual([
      { line: 1, message: "For loop starts at 0, but arrays start at 1" },
      {
        line: 7,
        message: `${BACKWARDS} Also consider changing 0 to 1 since arrays start at 1`,
      },
    ]);
  });
});

// Sparkdown-specific: the length of a field is still a bare length.
describe("a range that starts at 0 over a field's length", () => {
  test("for i = 0, #self.items", () => {
    expect(
      lintInFunction("\nlocal self = { items = {} }\nfor i = 0, #self.items do\nend\n"),
    ).toEqual([{ line: 2, message: "For loop starts at 0, but arrays start at 1" }]);
  });
});

// Sparkdown-specific: ranges the rule must leave alone.
describe("ordinary ranges are not reported", () => {
  test.each([
    ["an increasing constant range", "\nfor i = 1, 10 do\nend\n"],
    ["a range over a table", "\nlocal t = {}\nfor i = 1, #t do\nend\n"],
    ["negative bounds, which are not literals", "\nfor i = -1, -5 do\nend\n"],
    ["a generic for", "\nfor k, v in pairs({}) do\nend\n"],
    ["an expression bound", "\nlocal n = 3\nfor i = n, 1 do\nend\n"],
    // Luau's rule looks for a bare `#t`; arithmetic on it is a different
    // bound, and counting from 0 to `#t - 1` is correct.
    ["0 to #t - 1", "\nlocal t = {}\nfor i = 0, #t - 1 do\nend\n"],
    ["0 to #t // 2", "\nlocal t = {}\nfor i = 0, #t // 2 do\nend\n"],
    ["#t - 1 down to 1", "\nlocal t = {}\nfor i = #t - 1, 1 do\nend\n"],
    ["#t + 1 down to 0", "\nlocal t = {}\nfor i = #t + 1, 0 do\nend\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });
});
