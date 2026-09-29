import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

// Formatting an already formatted script changes nothing, and formatting the
// result of a first pass changes nothing either.
function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

// #1095
test("formatting leaves a Luau generic type's angle brackets tight", () => {
  const source = `local a: Array<number> = {}
local m: Map<string, number> = {}
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting joins a generic type's brackets that have spaces before them", () => {
  expectFormatsTo(
    `local a: Array <number > = {}
local n: Array<Array<number> > = {}
Hello.
`,
    `local a: Array<number> = {}
local n: Array<Array<number>> = {}
Hello.
`,
  );
});

test("formatting leaves nested and table generic types tight", () => {
  const source = `local n: Array<Array<number>> = {}
local t: Map<string, {number}> = {}
local f: Array<(number) -> string> = {}
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting keeps the spaces of a comparison between names", () => {
  const source = `local c = a < b
local d = a > b
local e = a <= b
Hello.
`;
  expectFormatsTo(source, source);
});

// #1096
test("formatting keeps the space before `|` in a parenthesized Luau union", () => {
  const source = `local b: (number | string) = nil
local c: number | string = nil
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting keeps one space around union and intersection operators", () => {
  const source = `local c: number|string = nil
local d: A  &  B = nil

function f(a: number | string, b: (A|B)?)
  type T = number | string
end
Hello.
`;
  expectFormatsTo(
    source,
    `local c: number | string = nil
local d: A & B = nil

function f(a: number | string, b: (A | B)?)
  type T = number | string
end
Hello.
`,
  );
});

// #1097
test("formatting a single-quoted string before an operator keeps the space", () => {
  const source = `local s = 'x' .. 'y'
Hello.
`;
  expectFormatsTo(
    source,
    `local s = "x" .. "y"
Hello.
`,
  );
});

// #1098
test("formatting normalizes every single-quoted string in a union type", () => {
  const source = `local x: 'x' | 'y' = nil
Hello.
`;
  expectFormatsTo(
    source,
    `local x: "x" | "y" = nil
Hello.
`,
  );
});

test("formatting a single-quoted string joins its whitespace edits in one pass", () => {
  expectFormatsTo(
    `local s = 'x'..'y'
local t =  'x'
local u: 'x' ? = nil
Hello.
`,
    `local s = "x" .. "y"
local t = "x"
local u: "x"? = nil
Hello.
`,
  );
});

test("formatting keeps a single-quoted string that holds a double quote", () => {
  const source = `local s = 'say "hi"' .. 'y'
Hello.
`;
  expectFormatsTo(
    source,
    `local s = 'say "hi"' .. "y"
Hello.
`,
  );
});

// #1099
test("formatting keeps the space before the `::` cast operator", () => {
  const source = `local x = y :: number
local z = (y :: number)
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting puts one space on each side of a tight or wide `::`", () => {
  expectFormatsTo(
    `local x = y::number
local z = y  ::  number
Hello.
`,
    `local x = y :: number
local z = y :: number
Hello.
`,
  );
});
