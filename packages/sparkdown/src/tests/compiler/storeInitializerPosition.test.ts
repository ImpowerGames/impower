import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///project/main.sd";

const MESSAGE =
  "A variable must be initialized to a number, string, boolean, constant, list item, or divert target.";

function initializerDiagnostics(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  return (program.diagnostics?.[URI] ?? []).filter(
    (diagnostic: any) =>
      (typeof diagnostic.message === "string"
        ? diagnostic.message
        : diagnostic.message?.value) === MESSAGE,
  );
}

describe("store initialized from another variable", () => {
  test("reports on the variable reference of a single-target store", () => {
    const found = initializerDiagnostics("store x = 5\nstore a = x\n");
    expect(found).toHaveLength(1);
    expect(found[0]!.range).toEqual({
      start: { line: 1, character: 10 },
      end: { line: 1, character: 11 },
    });
  });

  test.each([
    ["a number", "store a = 2\n"],
    ["a string", 'store a = "text"\n'],
    ["a boolean", "store a = true\n"],
    ["a constant", "const c = 1\nstore a = c\n"],
  ])("does not report a store initialized from %s", (_, source) => {
    expect(initializerDiagnostics(source)).toHaveLength(0);
  });
});
