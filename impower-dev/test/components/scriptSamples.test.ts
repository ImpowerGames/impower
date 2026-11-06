import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { createSparkdownParser } from "@impower/sparkdown/src/compiler/utils/createSparkdownParser";

const { SCRIPT_SAMPLES } =
  await import("../../src/modules/spark-editor/components/settings/scriptSamples");

const MAIN_URI = "file://sample/main.sd";
const lineOf = (text: string, offset: number) =>
  text.slice(0, offset).split("\n").length;

describe("the Script editor samples", () => {
  it.each(SCRIPT_SAMPLES.map((sample) => [sample.value, sample.text] as const))(
    "%s parses with no invalid or illegal node",
    (_value, text) => {
      const tree = createSparkdownParser(MAIN_URI).parse(text);
      const invalid: string[] = [];
      tree.iterate({
        enter: (node) => {
          if (/Invalid|Illegal/.test(node.name)) {
            invalid.push(`${node.name} on line ${lineOf(text, node.from)}`);
          }
        },
      });
      expect(invalid).toEqual([]);
    },
  );

  it.each(SCRIPT_SAMPLES.map((sample) => [sample.value, sample.text] as const))(
    "%s compiles with no error diagnostics",
    (_value, text) => {
      const compiler = new SparkdownCompiler();
      compiler.configure({
        files: [
          {
            uri: MAIN_URI,
            type: "script",
            name: "main",
            ext: "sd",
            text,
            version: 1,
            languageId: "sparkdown",
          },
        ],
      });
      const program = compiler.compile({ textDocument: { uri: MAIN_URI } })
        .program as {
        diagnostics?: Record<
          string,
          { severity?: number; message: unknown; range?: { start: { line: number } } }[]
        >;
      };
      const errors = Object.values(program.diagnostics ?? {})
        .flat()
        .filter((diagnostic) => diagnostic.severity === 1)
        .map(
          (diagnostic) =>
            `${(diagnostic.range?.start.line ?? -1) + 1}: ${JSON.stringify(diagnostic.message)}`,
        );
      expect(errors).toEqual([]);
    },
  );
});
