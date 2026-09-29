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

test("formatting leaves a string or boolean type argument's closing bracket tight", () => {
  const source = `local s: Box<"ok"> = nil
local t: Box<'ok'> = nil
local b: Box<true> = nil
local n: Array<number?> = {}
Hello.
`;
  expectFormatsTo(
    source,
    `local s: Box<"ok"> = nil
local t: Box<"ok"> = nil
local b: Box<true> = nil
local n: Array<number?> = {}
Hello.
`,
  );
});

test("formatting keeps the spaces of a comparison between strings or booleans", () => {
  expectFormatsTo(
    `local c = "a" > "b"
local d = "a">"b"
local e = true == false
Hello.
`,
    `local c = "a" > "b"
local d = "a" > "b"
local e = true == false
Hello.
`,
  );
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

test("formatting a single-quoted string before a tight operator gives one space on each side", () => {
  expectFormatsTo(
    `type T = 'a'|'b'
local w: 'a'&'b' = nil
local x = 'a'+'b'
local y = 'a'=="b"
Hello.
`,
    `type T = "a" | "b"
local w: "a" & "b" = nil
local x = "a" + "b"
local y = "a" == "b"
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

// #1108
test("formatting keeps one space before the `=` of a bracketed table key", () => {
  const source = `local t = {["k"] = "v"}
local u = {[k] = v, [1] = 2}
local w = {k = v}
Hello.
`;
  expectFormatsTo(source, source);
  expectFormatsTo(
    `local t = {["k"]= "v"}
local u = {[k]=v}
Hello.
`,
    `local t = {["k"] = "v"}
local u = {[k] = v}
Hello.
`,
  );
});

// #1109
test("formatting keeps the spaces around an if expression's keywords", () => {
  const source = `local y = if c then 1 else 2
local z = if c then 1 elseif d then 2 else 3
local w = if a and b then f(x) else {1, 2}
Hello.
`;
  expectFormatsTo(source, source);
  expectFormatsTo(
    `local v = if c then 1 else 'c'
local x = if  c  then  1  else  2
Hello.
`,
    `local v = if c then 1 else "c"
local x = if c then 1 else 2
Hello.
`,
  );
});

// #1110
test("formatting keeps one space between a keyword and a table or long string", () => {
  const source = `function f()
  return {1}
end

function g()
  return [[s]]
end
for k in {1, 2} do
end
local w = if c then {1} else {2}
local v = if c then [[a]] else (b)
local t = f{1}
local u = a[1]
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting keeps one space between a logical operator or `until` and a table", () => {
  const source = `local t = x or {}
local u = not {}
local v = a and {1}
repeat
  x = 1
until {1}
Hello.
`;
  expectFormatsTo(source, source);
});

test("formatting settles the space after `with` in one pass", () => {
  const source = `define Foo as list with {1, 2} end

define Bar as list with (x) end
Hello.
`;
  expectFormatsTo(source, source);
  expectFormatsTo(
    `define Foo as list with  {1, 2} end
Hello.
`,
    `define Foo as list with {1, 2} end
Hello.
`,
  );
});

// #1113
test("formatting keeps the minus attached after an if expression's keywords", () => {
  const source = `local y = if c then -1 else -2
local z = if c then 1 elseif d then -2 else 3
local w = if c then a - 1 else 2
Hello.
`;
  expectFormatsTo(source, source);
});

// #1114
test("formatting keeps one space on each side of `..=`", () => {
  const source = `local s = "a"
s ..= "b"
Hello.
`;
  expectFormatsTo(source, source);
  expectFormatsTo(
    `local s = "a"
s..="b"
Hello.
`,
    source,
  );
});

// #1115
test("formatting separates a clause keyword glued to a closing bracket", () => {
  expectFormatsTo(
    `local y = if(c)then 1 else(2)
local z = if c then(1)else 2
local w = if c then(1)elseif(d)then{2}else[[x]]
Hello.
`,
    `local y = if (c) then 1 else (2)
local z = if c then (1) else 2
local w = if c then (1) elseif (d) then {2} else [[x]]
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
