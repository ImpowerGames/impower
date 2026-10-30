import { expect, test } from "vitest";
import { formatSource } from "./formatSource";

function expectFormatsTo(source: string, expected: string) {
  expect(formatSource(source)).toBe(expected);
  expect(formatSource(expected)).toBe(expected);
}

test("formatting an empty document leaves it empty", () => {
  expectFormatsTo("", "");
});

test("formatting keeps the space between a divert target and a comparison", () => {
  const source = `scene main
  if -> one == -> two then
    same
  end
end
`;
  expectFormatsTo(source, source);
});

test("a blank line inserted before a line comes with that line's indent", () => {
  expectFormatsTo(
    `local x = 1
  function f() end
`,
    `local x = 1

function f() end
`,
  );
});

test("a local function inside a scene formats the same on a second pass", () => {
  const once = formatSource(`scene main
  local function j() end
  if true then
    x
  end
end
`);
  expect(formatSource(once)).toBe(once);
});

test("joining an if header onto one line writes an index and a field access tight", () => {
  expectFormatsTo(
    `function f(t)
  if t
    [2] then
  end
  if t
    .ok then
  end
end
`,
    `function f(t)
  if t[2] then
  end
  if t.ok then
  end
end
`,
  );
});

test("joining a header keeps the space after a keyword or an operator, and before a spaced operator", () => {
  expectFormatsTo(
    `function f(s, t, ...)
  if
    (t) then
  end
  while
    (t)
  do
  end
  if not
    (t) then
  end
  if s and
    (t) then
  end
  if
    [[x]] then
  end
  if ...
    .. "x" then
  end
end
`,
    `function f(s, t, ...)
  if (t) then
  end
  while (t) do
  end
  if not (t) then
  end
  if s and (t) then
  end
  if [[x]] then
  end
  if ... .. "x" then
  end
end
`,
  );
});

test("joining a header keeps what its strings and comments hold", () => {
  expectFormatsTo(
    `function f(s)
  if s == "a . b"
  then
  end
  if s == "a ( b )" or s == [[a . b]]
  then
  end
  if s == [[a
  b]]
  then
  end
  if s --[[ a  b ]]
  then
  end
end
`,
    `function f(s)
  if s == "a . b" then
  end
  if s == "a ( b )" or s == [[a . b]] then
  end
  if s == [[a
  b]] then
  end
  if s --[[ a  b ]] then
  end
end
`,
  );
});

test("a header is not joined onto a line comment", () => {
  const source = `function f(s, t)
  if s -- note
  then
  end
end
`;
  expectFormatsTo(source, source);
});

test("the lines of a multi-line string keep their indentation", () => {
  const source = `function f()
  local s = [[a
 b
      c]]
  local e = "a\\
 b"
  return s
end
`;
  expectFormatsTo(source, source);
});

test("a document with nothing but whitespace formats the same on a second pass", () => {
  for (const source of ["   ", "  \n  \n", "\n\n"]) {
    const once = formatSource(source);
    expect(formatSource(once)).toBe(once);
  }
});

test("the vararg keeps its spaces like a name", () => {
  expectFormatsTo(
    `function f(c, ...)
  local d = if ...then 3 else 4
  return d
end
`,
    `function f(c, ...)
  local d = if ... then 3 else 4
  return d
end
`,
  );
});

test("an if expression's then is not joined to the if statement around it", () => {
  expectFormatsTo(
    `function g(c, ...)
  if if c then false else ...then
    return if if c then false else ...then 1 else 2
  end
end
`,
    `function g(c, ...)
  if if c then false else ... then
    return if if c then false else ... then 1 else 2
  end
end
`,
  );
});

test("a then glued on both sides gets a space on both sides in one pass", () => {
  expectFormatsTo(
    `function g(c, ...)
  local s = if c then "a" elseif ...then'b' else "c"
  return s
end
`,
    `function g(c, ...)
  local s = if c then "a" elseif ... then "b" else "c"
  return s
end
`,
  );
});

test("a declaration's value at column 0 after a line-ending comma indents as a continuation", () => {
  expectFormatsTo(
    `function h()
  local a, b = 1,
2
  return b
end
`,
    `function h()
  local a, b = 1,
    2
  return b
end
`,
  );
});

test("an else at column 0 after an if expression's arm lines up with the arm", () => {
  expectFormatsTo(
    `function g(c)
  print(if c then
1
else 2)
end
`,
    `function g(c)
  print(if c then
    1
    else 2)
end
`,
  );
});

test("a single-quoted string left open keeps its quote", () => {
  const source = `function f()
  local s = 'abc
  return s
end
`;
  expectFormatsTo(source, source);
});

test("text a prop's value cannot hold keeps its spaces", () => {
  const source = `layout overflow with
  column {
    button @click=f(f(f(f(f(f(f(1))))))) { text "body" }
  }
end
`;
  expectFormatsTo(source, source);
});

test("a Sparkle block's do is not joined to a for line above it", () => {
  const source = `layout l with
  column {
    for i in bag
  }
  row { match mode do case 1 text end }
end
`;
  expectFormatsTo(source, source);
});
