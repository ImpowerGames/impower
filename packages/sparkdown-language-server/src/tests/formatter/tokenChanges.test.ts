import { expect, test } from "vitest";
import { tokenChange } from "./tokenChanges";

// The corpus check's notion of a lost token (I-874).

test("whitespace changes are no token change", () => {
  expect(tokenChange("local  x =1\n\n\n", "local x = 1\n")).toBeUndefined();
  expect(tokenChange("f( a,b )", "f(a, b)")).toBeUndefined();
});

test("the formatter's own rewrites are no token change", () => {
  expect(tokenChange("local s = 'it\\'s'", 'local s = "it\'s"')).toBeUndefined();
  expect(tokenChange("local t = {\n  1\n}", "local t = {\n  1,\n}")).toBeUndefined();
  expect(tokenChange("local t = { 1, }", "local t = { 1 }")).toBeUndefined();
  expect(
    tokenChange(
      "if a then\nelse\n  if b then\n  end\nend",
      "if a then\nelseif b then\nend",
    ),
  ).toBeUndefined();
});

test("two words written together are a token change", () => {
  expect(tokenChange("if -> one == -> two then", "if -> one == -> twothen")).toMatch(
    /joined/,
  );
  expect(tokenChange("case 1 text", "case 1text")).toMatch(/joined/);
});

test("two characters that read as one longer token are a token change", () => {
  expect(tokenChange("x = - -y", "x = --y")).toMatch(/joined/);
  expect(tokenChange("a = b .. c", "a = b..c")).toBeUndefined();
  expect(tokenChange("a = b . .c", "a = b..c")).toMatch(/joined/);
});

test("lost, added or changed text is a token change", () => {
  expect(tokenChange("print(1)", "print(1")).toMatch(/text changed/);
  expect(tokenChange("local s = 'abc", 'local s = "abc"')).toMatch(/text changed/);
  expect(tokenChange("x = 1", "x = 2")).toMatch(/text changed/);
});

test("an end the formatter drops without folding an else-if is a token change", () => {
  expect(tokenChange("if a then\nend", "if a then\n")).toMatch(/end keyword/);
});
