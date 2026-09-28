import { expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
} from "../runtime/runtimeTestHarness";
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
  "local f: { read types.Button } = {}",
  "local x = 1 :: types.Button",
  "local x: string.Button = 1",
  "local f: { number.Button } = {}",
  "local x: types .Button = 1",
  "local x: types. Button = 1",
  "local f: { read types . Button } = {}",
  "local function f(): types.Button return 1 end",
  "type Alias = types.Button",
  "export type Exported = types.Button",
  "local x: types.Button & types.Other = 1",
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
  [
    "Value {f()}.\nfunction f()\n  local x: string.Button = 6\n  local y: types .Button = 1\n  return x + y\nend\n",
    "Value 7.\n",
  ],
])("%j runs", (source, expected) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(expected);
});

// Luau reads at most one module prefix, so every segment after the first
// `module.Type` is a syntax error. It is reported on the extra segments, and
// the rest of the line still belongs to the type, so the enclosing function
// is not cut short.
test.each([
  ["local z: types.ui.Button = 3", ".Button"],
  ["local z: a.b.c.D = 3", ".c.D"],
  ["local f: { types.ui.Button } = {}", ".Button"],
  ["type Alias = types.ui.Button", ".Button"],
  ["local x: types.ui .Button = 1", " .Button"],
  ["local x: types.ui.Foo<number>? = nil", ".Foo"],
])("%j reports the extra prefix", (source, extra) => {
  const diagnostics = checkLuau(source).syntaxDiagnostics;
  expect(diagnostics.map((d) => d.message)).toEqual([
    expect.stringContaining("takes at most one module prefix"),
  ]);
  const at = source.indexOf(extra);
  expect(diagnostics[0]).toMatchObject({
    column: at,
    endColumn: at + extra.length,
  });
});

test("a two-dot type name is an error and keeps the function whole", () => {
  const { errorMessages } = collectDiagnostics(
    "Value {f()}.\nfunction f()\n  local z: types.ui.Button = 3\n  return z\nend\n",
  );
  expect(errorMessages).toEqual([
    expect.stringContaining("takes at most one module prefix"),
  ]);
});
