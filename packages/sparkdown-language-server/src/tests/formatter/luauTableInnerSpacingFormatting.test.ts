import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

// #1226: a one-line Luau table constructor or table type has one space
// inside each brace, as the brace blocks of #1222 do. Formatting the result
// again changes nothing.
function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

test("formatting spaces the inside of a one-line table and a table nested in it", () => {
  expectFormatsTo(
    `define companion as character with
store player = {hp = 8, items = {"potion", "apple"}}
end
`,
    `define companion as character with
  store player = { hp = 8, items = { "potion", "apple" } }
end
`,
  );
});

test("formatting spaces a one-line table's keys, array items and nested tables", () => {
  expectFormatsTo(
    `local a = {a = 1}
local b = {1, 2}
local c = {[k] = v}
local d = {{1}, {2}}
local e = {   x = 1   }
Hello.
`,
    `local a = { a = 1 }
local b = { 1, 2 }
local c = { [k] = v }
local d = { { 1 }, { 2 } }
local e = { x = 1 }
Hello.
`,
  );
});

test("formatting keeps the space before the brace when it drops a one-line table's trailing comma", () => {
  expectFormatsTo(
    `local a = {1, 2,}
local b = { x = 1, }
local c = {1 ,  }
Hello.
`,
    `local a = { 1, 2 }
local b = { x = 1 }
local c = { 1 }
Hello.
`,
  );
});

test("formatting spaces a one-line table type", () => {
  expectFormatsTo(
    `local p: {x: number} = nil
local q: {x: number, y: string} = nil
local l: {number} = {}
local m: {[string]: number} = {}
type Point = {x: number, y: number}
Hello.
`,
    `local p: { x: number } = nil
local q: { x: number, y: string } = nil
local l: { number } = {}
local m: { [string]: number } = {}
type Point = { x: number, y: number }
Hello.
`,
  );
});

test("formatting leaves an empty table empty and joins an empty table's spaces", () => {
  expectFormatsTo(
    `local a = {}
local b = { }
local c: {} = {   }
Hello.
`,
    `local a = {}
local b = {}
local c: {} = {}
Hello.
`,
  );
});

test("formatting keeps a keyword's space before a table and a call's absence of one", () => {
  expectFormatsTo(
    `function f()
return {1}
end

for _, v in {1, 2} do
print(v)
end

local t = f{1}
Hello.
`,
    `function f()
  return { 1 }
end

for _, v in { 1, 2 } do
  print(v)
end

local t = f{ 1 }
Hello.
`,
  );
});

test("formatting leaves interpolation and binding braces tight", () => {
  const source = `HP: {hp}
local s = \`HP: {hp}\`
local t = "HP: {hp}"

layout hud with
  text "HP: {hp}" #value={volume}
  text #label={{format_hp(hp, max_hp)}}
end
`;
  expectFormatsTo(source, source);
});

test("formatting leaves a multi-line table's lines as they are", () => {
  const source = `local a = {
  x = 1,
  y = {1, 2},
}
Hello.
`;
  expectFormatsTo(
    source,
    `local a = {
  x = 1,
  y = { 1, 2 },
}
Hello.
`,
  );
});
