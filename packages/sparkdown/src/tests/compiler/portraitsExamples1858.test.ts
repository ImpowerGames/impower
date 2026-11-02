import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { GUIDE_DIR } from "./guideExamples";

const URI = "file:///project/main.sd";
const TOP_LEVEL_ERROR =
  "statement must be inside a scene or branch; the top level holds declarations only";

function errorsIn(code: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        version: 1,
        languageId: "sparkdown",
        text: code,
      },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => (typeof d.message === "string" ? d.message : d.message.value));
}

function sceneExamples(): { line: number; code: string }[] {
  const lines = readFileSync(join(GUIDE_DIR, "Portraits.md"), "utf8").split(/\r?\n/);
  const examples: { line: number; code: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "```") continue;
    let j = i + 1;
    while (j < lines.length && lines[j] !== "```") j++;
    const body = lines.slice(i + 1, j);
    if (body[0] === "scene start") {
      examples.push({ line: i + 2, code: body.join("\n") + "\n" });
    }
    i = j;
  }
  return examples;
}

function unwrapped(code: string): string {
  const body = code.split("\n").slice(1, -2);
  return [...body.map((l) => l.replace(/^  /, "")), "", "scene start", "end", ""].join("\n");
}

const EXAMPLES = sceneExamples();

describe("Portraits.md image-line examples", () => {
  test("nine examples are written inside scene start", () => {
    expect(EXAMPLES.length).toBe(9);
  });

  test.each(EXAMPLES.map((e) => [e.line, e] as const))(
    "the example at line %i compiles with no error",
    (_, example) => {
      expect(errorsIn(example.code)).toEqual([]);
    },
  );

  test.each(EXAMPLES.map((e) => [e.line, e] as const))(
    "the example at line %i reports the top-level error unwrapped",
    (_, example) => {
      expect(errorsIn(unwrapped(example.code))).toContain(TOP_LEVEL_ERROR);
    },
  );
});
