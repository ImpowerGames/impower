import { expect, test } from "vitest";
import { tokenChange } from "./tokenChanges";

// The corpus check's notion of a lost token (I-874).

// The body lines in a function, where they are Luau.
const fn = (body: string) => `function f(s, t)\n${body}\nend\n`;

test("whitespace changes between tokens are no token change", () => {
  expect(tokenChange(fn("  local  x =1\n\n\n"), fn("  local x = 1"))).toBeUndefined();
  expect(tokenChange(fn("  f( s,t )"), fn("  f(s, t)"))).toBeUndefined();
  expect(tokenChange("A-->B\n", "A- -> B\n")).toBeUndefined();
  expect(tokenChange("HERO: Don't  go [[  show x  ]]\n", "HERO: Don't go [[show x]]\n")).toBeUndefined();
});

test("whitespace in an interpolation's code is no token change", () => {
  expect(tokenChange(fn("  return `a {s .. t } b`"), fn("  return `a {s .. t} b`"))).toBeUndefined();
});

test("the formatter's own rewrites are no token change", () => {
  expect(tokenChange(fn("  local s = 'it\\'s'"), fn('  local s = "it\'s"'))).toBeUndefined();
  expect(tokenChange(fn("  local t = {\n    1\n  }"), fn("  local t = {\n    1,\n  }"))).toBeUndefined();
  expect(tokenChange(fn("  local t = { 1, }"), fn("  local t = { 1 }"))).toBeUndefined();
  expect(
    tokenChange(
      fn("  if s then\n  else\n    if t then\n    end\n  end"),
      fn("  if s then\n  elseif t then\n  end"),
    ),
  ).toBeUndefined();
  expect(tokenChange(fn("  local x = 1   -- note   "), fn("  local x = 1 -- note"))).toBeUndefined();
});

test("re-indenting a comment's later lines is no token change", () => {
  expect(tokenChange(fn("  local x = 1 --[[a\nb]]"), fn("  local x = 1 --[[a\n  b]]"))).toBeUndefined();
});

test("text joined onto a line comment is a token change", () => {
  expect(tokenChange(fn("  if s -- note\n  then\n  end"), fn("  if s -- note then\n  end"))).toMatch(
    /changed/,
  );
});

test("two words written together are a token change", () => {
  expect(
    tokenChange(
      "scene main\n  if -> one == -> two then\n  end\nend\n",
      "scene main\n  if -> one == -> twothen\n  end\nend\n",
    ),
  ).toMatch(/joined/);
  expect(tokenChange(fn("  local v = s print(3)"), fn("  local v = sprint(3)"))).toMatch(/joined/);
});

test("two characters that read as one longer token are a token change", () => {
  expect(tokenChange(fn("  local x = - -s"), fn("  local x = --s"))).toMatch(/joined|changed/);
  expect(tokenChange(fn("  local x = s .. t"), fn("  local x = s..t"))).toBeUndefined();
  expect(tokenChange(fn("  local x = s . .t"), fn("  local x = s..t"))).toMatch(/joined/);
});

test("a token written apart is a token change", () => {
  expect(tokenChange(fn("  local x = 12"), fn("  local x = 1 2"))).toMatch(/split/);
  expect(tokenChange(fn("  if ready then\n  end"), fn("  if rea dy then\n  end"))).toMatch(/split/);
  expect(tokenChange(fn("  return s == t"), fn("  return s = = t"))).toMatch(/split/);
  expect(tokenChange(fn("  return s .. t"), fn("  return s . . t"))).toMatch(/split/);
  expect(tokenChange(fn("  return 1.5"), fn("  return 1 .5"))).toMatch(/split/);
  expect(tokenChange(fn("  return 1 .5"), fn("  return 1.5"))).toMatch(/joined/);
});

test("joining a Luau header or compacting an empty body is no token change", () => {
  expect(tokenChange(fn("  if t\n    [2] then\n  end"), fn("  if t[2] then\n  end"))).toBeUndefined();
  expect(tokenChange("function f()\n\nend\n", "function f() end\n")).toBeUndefined();
});

test("two story lines written as one are a token change", () => {
  expect(
    tokenChange("scene main\n  Hello\n  world\n  done\nend\n", "scene main\n  Hello world\n  done\nend\n"),
  ).toMatch(/line joined/);
});

test("a comment in an interpolation leaves the rest of the string compared exactly", () => {
  expect(
    tokenChange(fn("  return `a {s --[[ note ]]} b  c`"), fn("  return `a {s --[[ note ]]} b c`")),
  ).toMatch(/changed/);
});

test("a string or a comment changed inside is a token change", () => {
  expect(tokenChange(fn('  if s == "a . b" then\n  end'), fn('  if s == "a.b" then\n  end'))).toMatch(
    /changed/,
  );
  expect(tokenChange(fn("  local x = [[a\n  b]]"), fn("  local x = [[a\n    b]]"))).toMatch(/changed/);
  expect(tokenChange(fn("  local x = 1 --[[ a  b ]]"), fn("  local x = 1 --[[a b]]"))).toMatch(/changed/);
  expect(tokenChange(fn('  local s = "a,}"'), fn('  local s = "a}"'))).toMatch(/changed/);
});

test("lost, added, moved or changed text is a token change", () => {
  expect(tokenChange(fn("  print(1)"), fn("  print(1"))).toMatch(/changed/);
  expect(tokenChange(fn("  local s = 'abc"), fn('  local s = "abc"'))).toMatch(/changed/);
  expect(tokenChange(fn("  local x = 1"), fn("  local x = 2"))).toMatch(/changed/);
  expect(
    tokenChange(fn("  if s then\n  end\n  print(1)"), fn("  if s then\n    print(1)\n  end")),
  ).toMatch(/changed/);
});

test("an end the formatter drops without folding an else-if is a token change", () => {
  expect(tokenChange(fn("  if s then\n  end"), fn("  if s then\n"))).toMatch(/changed/);
});

test("folding an else that holds more than its if is a token change", () => {
  expect(
    tokenChange(
      fn("  if s then\n  else\n    if t then\n      s = 1\n    end\n    s = 2\n  end"),
      fn("  if s then\n  elseif t then\n      s = 1\n    s = 2\n  end"),
    ),
  ).toMatch(/joined|changed/);
});

test("a comma before a brace in story text is not a table's trailing comma", () => {
  expect(tokenChange("Hello,}\n", "Hello}\n")).toMatch(/changed/);
});

test("a regex literal is compared exactly", () => {
  expect(tokenChange(fn("  return @/a  b/"), fn("  return @/a b/"))).toMatch(/changed/);
});

test("a run path is compared exactly, and is not unescaped as a Luau string is", () => {
  expect(tokenChange("run 'a\\'b'\n", "run \"a'b\"\n")).toMatch(/changed/);
  expect(tokenChange("run a  b\n", "run a b\n")).toMatch(/changed/);
});

test("a comma added to an empty table is a token change", () => {
  expect(tokenChange(fn("  return {}"), fn("  return {,}"))).toMatch(/changed/);
});
