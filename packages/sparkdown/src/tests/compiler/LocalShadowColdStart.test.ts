/// <reference path="../../sd-raw.d.ts" />
import "../../inkjs/engine/Container";
import { expect, test, vi } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";

// This file gets a fresh worker, with no module-level compiler configuration.
// Observe real validation and bound recursion without replacing prelude data:
// the broken intermediate implementation fails at depth two, before an OOM.
function guardedCompile(text: string, useBuiltinsPrelude: boolean, uri = "inmemory:///main.sd") {
  const original = SparkdownCompiler.prototype.validateLints;
  let depth = 0;
  let reentrantAttempts = 0;
  let preludeValidations = 0;
  const guard = vi.spyOn(SparkdownCompiler.prototype, "validateLints").mockImplementation(function (this: SparkdownCompiler, program: SparkProgram) {
    depth++;
    if (program.uri === "file:///__builtins__.sd") preludeValidations++;
    try {
      if (depth > 1) {
        reentrantAttempts++;
        throw new Error("LocalShadow recursively initialized the builtin prelude");
      }
      return original.call(this, program);
    }
    finally { depth--; }
  });
  try {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude,
      ...(useBuiltinsPrelude ? {} : { definitions: { builtins: {} } }),
      files: [{ uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    });
    const program = compiler.compile({ textDocument: { uri } }).program;
    return { program, preludeValidations };
  } finally {
    guard.mockRestore();
    // Compiler error recovery must not turn a caught guard exception into a
    // passing test merely because it returned a partially compiled program.
    expect(reentrantAttempts).toBe(0);
    expect(depth).toBe(0);
  }
}

const shadows = (program: SparkProgram) => Object.values(program.diagnostics ?? {}).flat().filter(d => d.code === "LocalShadow");

test("the isolated real builtin prelude validates without recursively initializing itself", () => {
  const { program, preludeValidations } = guardedCompile(BUILTINS_PRELUDE, false, "file:///__builtins__.sd");
  expect(preludeValidations).toBe(1);
  expect(program.compiled).toBeDefined();
  expect(shadows(program)).toEqual([]);
});

test("unseeded compilation with no shadow candidates finishes without seeding builtins", () => {
  const { program, preludeValidations } = guardedCompile("Ready.\n", false);
  expect(preludeValidations).toBe(0);
  expect(program.scripts["inmemory:///main.sd"]).toBeDefined();
  expect(shadows(program)).toEqual([]);
});

test("unseeded compilation checks authored globals without exempting prelude-only names", () => {
  const { program, preludeValidations } = guardedCompile("& print(color)\nfunction f()\n local color = 2\n return color\nend\n", false);
  expect(preludeValidations).toBe(0);
  expect(shadows(program).map(d => d.message)).toEqual([
    { kind: "markdown", value: "Variable 'color' shadows a global variable used at line 1" },
  ]);
});

test("cold configured builtins finish and exempt actual builtin globals while checking authored names", () => {
  const { program, preludeValidations } = guardedCompile("& print(color, state)\nfunction f()\n local color = 2\n local state = 2\n return color, state\nend\n", true);
  expect(preludeValidations).toBe(1);
  expect(shadows(program).map(d => d.message)).toEqual([
    { kind: "markdown", value: "Variable 'state' shadows a global variable used at line 1" },
  ]);
});
