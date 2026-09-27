// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`), the
// PlaceholderRead rule. Snippets and expected messages are quoted verbatim and
// placed inside a function body; the upstream test-case name is in the
// comment above each group. Line numbers are 0-based, as upstream checks
// them. The rule is implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import {
  diagnoseWithLintsInFunction,
  lintInFunction,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

const PLACEHOLDER_READ =
  "Placeholder value '_' is read here; consider using a named variable";

// Luau: PlaceholderRead
describe("reading the local placeholder `_`", () => {
  test("local _ = 5; return _", () => {
    expect(
      lintMessagesInFunction(`
local _ = 5
return _
`),
    ).toEqual([PLACEHOLDER_READ]);
  });
});

// Luau: PlaceholderReadGlobal
describe("reading the global placeholder `_`", () => {
  test("_ = 5; print(_)", () => {
    expect(
      lintMessagesInFunction(`
_ = 5
print(_)
`),
    ).toEqual([PLACEHOLDER_READ]);
  });
});

// Luau: PlaceholderWrite
describe("writing the placeholder `_` is not reported", () => {
  test("local _ = 5; _ = 6", () => {
    expect(
      diagnoseWithLintsInFunction(`
local _ = 5
_ = 6
`),
    ).toEqual([]);
  });
});

describe("placeholder reads beyond the upstream cases", () => {
  test("a compound write reads the placeholder", () => {
    expect(
      lintInFunction(`
local _ = 5
_ += 1
`),
    ).toEqual([{ line: 2, message: PLACEHOLDER_READ }]);
  });

  test("each read is reported where it is", () => {
    expect(
      lintInFunction(`
for _, v in ipairs({}) do
  print(_, v)
end
`),
    ).toEqual([{ line: 2, message: PLACEHOLDER_READ }]);
  });

  test("a field, a method, a string and a comment named `_` are not reads", () => {
    expect(
      lintMessagesInFunction(`
local t = {}
t._ = 1
print(t._, t:_(), "_")
-- _
`),
    ).toEqual([]);
  });

  test("a table constructor's key `_` is a field name; its value is a read", () => {
    expect(
      lintInFunction(`
print({_ = 1, n = 2; _ = 3})
print({_ = _})
`),
    ).toEqual([{ line: 2, message: PLACEHOLDER_READ }]);
  });

  test("a comment beside a table key leaves it a field name", () => {
    expect(
      lintInFunction(`
print({
  -- the discarded field
  _ = 1,
  _ -- after the key
  = 2,
  --[[ before the key ]] _ = 3,
})
`),
    ).toEqual([]);
  });

  test("a table index `[_]` reads the placeholder", () => {
    expect(
      lintInFunction(`
print({[_] = 1})
`),
    ).toEqual([{ line: 1, message: PLACEHOLDER_READ }]);
  });

  test("a longer name starting with `_` is not the placeholder", () => {
    expect(
      lintMessagesInFunction(`
local _x = 5
print(_x)
`),
    ).toEqual([]);
  });
});
