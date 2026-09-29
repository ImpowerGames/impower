import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

test("formatting leaves a Luau optional type's `?` glued to its type", () => {
  const source = `function f(): number?
  local v: number?
  local u: number? = 1
  type T = number?
  local s: string
  return 5
end
local w: number?
Hello.
`;
  expect(formatSource(source)).toBe(source);
});

test("formatting keeps the `?` glued after a named or parenthesized type", () => {
  const source = `local a: Foo? = nil
local b: (number)? = nil
local c: Foo?
Hello.
`;
  expect(formatSource(source)).toBe(source);
});

test("formatting keeps one space around a binary type operator after the `?`", () => {
  const source = `local a: number? | string = 1
local b: number?  |  string = 1
Hello.
`;
  expect(formatSource(source)).toBe(`local a: number? | string = 1
local b: number? | string = 1
Hello.
`);
});

test("formatting joins a `?` that already has a space before it to its type", () => {
  const source = `function f(): number ?
  local v: number ?
  local u: number ? = 1
  local t: number ?= 1
  type T = number ?
end
local w: Foo ?
Hello.
`;
  expect(formatSource(source)).toBe(`function f(): number?
  local v: number?
  local u: number? = 1
  local t: number? = 1
  type T = number?
end
local w: Foo?
Hello.
`);
});

test("formatting a `?` after a block comment keeps one space before it", () => {
  const source = `local v: number --[[c]] ? = 1
local w: number --[[c]]? = 1
Hello.
`;
  const expected = `local v: number --[[c]] ? = 1
local w: number --[[c]] ? = 1
Hello.
`;
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
});

// `x :: T?` does not parse yet (#877): the cast target is read as a value, so
// the `?` is text after a value. Formatting it must still settle, as it did
// before the suffix rules changed, instead of toggling the space every pass.
test.each([
  ["a parenthesized cast", "local x = (y :: number?) or 1\nHello.\n"],
  ["a table field cast", "local t = { a = y :: number? }\nHello.\n"],
  ["a cast to a qualified name", "local x = (y :: Foo.Bar?) or 1\nHello.\n"],
  ["a cast to a table type", "local x = (y :: {number}?) or 1\nHello.\n"],
])("formatting %s settles after one pass", (_name, source) => {
  const once = formatSource(source);
  expect(formatSource(once)).toBe(once);
});
