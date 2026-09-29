import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///project/main.sd";

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
  return (program.diagnostics?.[URI] ?? []).filter((diagnostic: any) =>
    /must be initialized/.test(
      typeof diagnostic.message === "string"
        ? diagnostic.message
        : diagnostic.message?.value,
    ),
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
});
