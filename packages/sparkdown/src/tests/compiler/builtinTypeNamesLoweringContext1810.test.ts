import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SparkdownCompiler as SparkdownCompilerType } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";
const WARNING = "'color' is a reserved builtin type";

type CompilerModule = typeof import("../../compiler/classes/SparkdownCompiler");

let mod: CompilerModule;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("../../compiler/classes/SparkdownCompiler");
});

function newCompiler(useBuiltinsPrelude: boolean, text = ""): SparkdownCompilerType {
  const compiler = new mod.SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude,
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

function setText(compiler: SparkdownCompilerType, text: string, version: number): void {
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [{ text }],
  } as never);
}

function warnings(compiler: SparkdownCompilerType): string[] {
  const diagnostics = compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [];
  return diagnostics.map((d) => (typeof d.message === "string" ? d.message : (d.message as { value: string }).value));
}

describe("builtin type names come from the lowering context", () => {
  test("a prelude compiler lowered through updateDocument warns before any compile has run", () => {
    const compiler = newCompiler(true);
    setText(compiler, "store color = 1\n", 2);
    expect(warnings(compiler).some((m) => m.includes(WARNING))).toBe(true);
  });

  test("a compiler without the prelude never warns, even after another compiled the prelude", () => {
    const without = newCompiler(false);
    setText(without, "store color = 1\n", 2);
    expect(warnings(without).some((m) => m.includes(WARNING))).toBe(false);

    const withPrelude = newCompiler(true);
    setText(withPrelude, "store color = 1\n", 2);
    expect(warnings(withPrelude).some((m) => m.includes(WARNING))).toBe(true);

    setText(without, "store color = 2\n", 3);
    expect(warnings(without).some((m) => m.includes(WARNING))).toBe(false);
  });

  test("the prelude compiles at most once across compilers", () => {
    const compileSpy = vi.spyOn(mod.SparkdownCompiler.prototype, "compile");
    const first = newCompiler(true);
    setText(first, "store color = 1\n", 2);
    warnings(first);
    const second = newCompiler(true);
    setText(second, "store color = 1\n", 2);
    warnings(second);
    const preludeCompiles = compileSpy.mock.calls.filter(
      ([params]) => (params as { textDocument: { uri: string } }).textDocument.uri === "file:///__builtins__.sd",
    );
    expect(preludeCompiles.length).toBeLessThanOrEqual(1);
    compileSpy.mockRestore();
  });
});
