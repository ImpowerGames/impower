import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau } from "./typecheckTestHarness";

// A module-qualified type name (`types.Button`) is one type reference
// wherever a type is read, and does not end the enclosing function.
test.each([
  "local f: { types.Button } = {}",
  "local function f(self: types.Button) end",
  "local f: (self: types.Button) -> nil = nil",
  "local x: types.Button = 1",
  "local x: types.Foo<number>? = nil",
  "local f: { [string]: types.Button } = {}",
  "local f: { a: types.Button, read b: string } = {}",
  "local f: { number } = {}",
  "local f: { a: number, read b: string } = { a = 1, b = \"\" }",
  "local f: { (self: number, lit: boolean) -> nil } = {}",
  "local t = { a = { b = 1 } }\nlocal x = t.a.b",
])("%j parses", (source) => {
  expect(checkLuau(source).syntaxDiagnostics.map((d) => d.message)).toEqual(
    [],
  );
});

test.each([
  [
    "Value {f()}.\nfunction f()\n  local x: types.Button = 1\n  return x\nend\n",
    "Value 1.\n",
  ],
  [
    "Value {f()}.\nfunction f()\n  local function g(self: types.Button)\n    return 3\n  end\n  return g(1)\nend\n",
    "Value 3.\n",
  ],
  [
    "Value {f()}.\nfunction f()\n  local t: { types.Button } = { 5 }\n  return t[1]\nend\n",
    "Value 5.\n",
  ],
])("%j runs", (source, expected) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(expected);
});
