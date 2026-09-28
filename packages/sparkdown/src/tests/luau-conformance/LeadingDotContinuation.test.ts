import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau } from "./typecheckTestHarness";

// A line of Luau code that begins with `.name` or `:name` continues the
// expression or type on the line before it, as Luau reads it, and does not
// end the enclosing function at the line break.
const inFunction = (body: string) =>
  `Value {f()}.\nfunction f()\n${body
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")}\nend\n`;

test.each([
  ["member access", "local t = { a = 5 }\nlocal y = t\n  .a\nreturn y", "5"],
  [
    "member access after a comment",
    "local t = { a = 5 }\nlocal y = t -- note\n  .a\nreturn y",
    "5",
  ],
  [
    "member access after a blank and a comment line",
    "local t = { a = 5 }\nlocal y = t\n\n  -- note\n  .a\nreturn y",
    "5",
  ],
  ["stdlib call", 'local y = string\n  .upper("a")\nreturn y', "A"],
  ["stdlib constant", "local y = math\n  .pi > 3\nreturn y", "true"],
  [
    "two continued lines",
    "local t = { a = { b = 7 } }\nlocal y = t\n  .a\n  .b\nreturn y",
    "7",
  ],
  ["method call", 'local s = "a"\nlocal y = s\n  :upper()\nreturn y', "A"],
  [
    "method call then member",
    'local s = "ab"\nlocal y = s\n  :upper()\n  :lower()\n  :len()\nreturn y',
    "2",
  ],
  [
    "member of a call",
    "local function g() return { a = 4 } end\nlocal y = g()\n  .a\nreturn y",
    "4",
  ],
  [
    "indexer after a continued member",
    "local t = { a = { 9 } }\nlocal y = t\n  .a[1]\nreturn y",
    "9",
  ],
  [
    "operand of a binary operation",
    "local t = { a = 5 }\nlocal y = 1 + t\n  .a\nreturn y",
    "6",
  ],
  [
    "binary operation on the continued line",
    "local t = { a = 5 }\nlocal y = t\n  .a * 2\nreturn y",
    "10",
  ],
  [
    "value followed by a further value",
    "local t = { a = 5 }\nlocal x, y = t\n  .a, 1\nreturn x + y",
    "6",
  ],
  [
    "second value",
    "local t = { a = 5 }\nlocal x, y = 1, (t)\n  .a\nreturn x + y",
    "6",
  ],
  ["return value", "local t = { a = 5 }\nreturn t\n  .a", "5"],
  [
    "reassignment",
    "local t = { a = 5 }\nlocal y = 0\ny = t\n  .a\nreturn y",
    "5",
  ],
  [
    "property assignment",
    "local t = { a = 5 }\nlocal u = {}\nu.b = t\n  .a\nreturn u.b",
    "5",
  ],
  [
    "compound assignment",
    "local t = { a = 5 }\nlocal y = 1\ny += t\n  .a\nreturn y",
    "6",
  ],
  [
    "multiple reassignment",
    "local t = { a = 5 }\nlocal x, y = 0, 0\nx, y = 1, t\n  .a\nreturn x + y",
    "6",
  ],
  [
    "explicit statement",
    "local t = { a = 5 }\nlocal y = 0\n& y = t\n  .a\nreturn y",
    "5",
  ],
  [
    "method call statement",
    "local t = { n = 1 }\nfunction t.bump(self) self.n = self.n + 1 end\nt\n  :bump()\nreturn t.n",
    "2",
  ],
  [
    "call argument",
    "local t = { a = 5 }\nreturn tostring(t\n  .a)",
    "5",
  ],
  ["parenthesized value", "local t = { a = 5 }\nreturn (t\n  .a)", "5"],
  [
    "table field",
    "local t = { a = 5 }\nlocal u = { b = t\n  .a }\nreturn u.b",
    "5",
  ],
  [
    "table item",
    "local t = { a = 5 }\nlocal u = { t\n  .a }\nreturn u[1]",
    "5",
  ],
  [
    "qualified type name",
    "local x: types\n  .Button = 1\nreturn x",
    "1",
  ],
])("%s runs", (_name, body, value) => {
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(`Value ${value}.\n`);
});

// A line that does not begin with an access starts a new statement.
test.each([
  [
    "after a blank line",
    "local t = { a = 5 }\nlocal y = t\n\nreturn y.a",
    "5",
  ],
  [
    "after a comment line holding an access",
    "local t = { a = 5 }\nlocal y = t\n-- .a\nreturn y.a",
    "5",
  ],
  [
    "concatenation at the start of a line",
    'local y = "a"\nlocal z = y\n  .. "b"\nreturn z',
    "a",
  ],
])("a line %s keeps its statements apart", (_name, body, value) => {
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(`Value ${value}.\n`);
});

// A continuation line after a line that does not end in a value is an error,
// rather than text or a silently dropped access.
test.each([
  ["after `end`", "if true then\nend\n  .a\nreturn 1"],
  ["at the start of a body", "  .a\nreturn 1"],
  ["after a bare local", "local x\n  .a\nreturn 1"],
])("a continuation line %s is reported", (_name, body) => {
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([
    expect.stringContaining("`.a` continues the line before it"),
  ]);
});

// In a scene, a line that begins with `.` is prose.
test("a line starting with a dot after a statement in a scene is prose", () => {
  const ctx = makeRuntimeStoryFromSource("local y = 1\n.hello there\n");
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(".hello there\n");
});

test("a qualified type name continued on the next line parses", () => {
  expect(
    checkLuau("local x: types\n  .Button = 1").syntaxDiagnostics.map(
      (d) => d.message,
    ),
  ).toEqual([]);
});
