import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

// Formatting an already formatted script changes nothing, and formatting the
// result of a first pass changes nothing either.
function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

// #880, #1157: a `--` after a value begins a comment, never a minus sign, so
// formatting never splits it into `- -`.
test("formatting leaves a line comment after arithmetic as a comment", () => {
  const source = `function f(a, b)
  local d = 5 - 2 -- x
  local p = a * b -- the product
  return d
end
`;
  expectFormatsTo(source, source);
});

test("formatting keeps a block comment after an operator before its operand", () => {
  expectFormatsTo(
    `function f()
  local e = 7 -   --[[c]]  2
  return e
end
`,
    `function f()
  local e = 7 - --[[c]] 2
  return e
end
`,
  );
});

test("formatting leaves a call whose arguments follow a block comment", () => {
  const source = `function f(g)
  local w = g --[[c]] (2)
  local v = g --[[a
  ]] (3)
  return w
end
`;
  expectFormatsTo(source, source);
});

test("formatting leaves a statement after a same-line block comment after a value", () => {
  const source = `function f()
  local w = 5 --[[c]] print(1)
  w = 5 --[[c]] print(2)
  return w
end
`;
  expectFormatsTo(source, source);
});
