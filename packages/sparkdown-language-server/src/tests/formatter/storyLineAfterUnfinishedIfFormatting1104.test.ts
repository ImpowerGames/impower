import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { formatSource } from "./formatSource";

// I-1104: a story line after an unfinished `if` expression is indented to
// the scene body when formatted. That indent must not make the line the
// expression's then arm: the line stays story text and the diagnostics
// stay the same.

const URI = "file:///main.sd";

const SOURCE = [
  "store x = 0",
  "local ready = true",
  "scene start",
  "  x = if ready then",
  "Hello there.",
  "end",
  "",
].join("\n");

function diagnostics(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as any);
  const result = compiler.compile({ textDocument: { uri: URI } }).program;
  return (result.diagnostics?.[URI] ?? []).map((d) => ({
    severity: d.severity,
    message: typeof d.message === "string" ? d.message : d.message.value,
  }));
}

describe("formatting a story line after an unfinished if expression", () => {
  test("keeps the story line out of the expression", () => {
    const formatted = formatSource(SOURCE);
    const after = diagnostics(formatted);
    expect(after).toEqual(diagnostics(SOURCE));
    // Read as Luau, the story line's words become names.
    for (const d of after) {
      expect(d.message).not.toMatch(/Hello|there/);
    }
  });
});
