import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";

const BUILTINS_DIR = resolve(
  __dirname,
  "../../../../sparkdown/src/compiler/builtins",
);
const SRC_SD = resolve(BUILTINS_DIR, "builtins.sd");

describe("builtins prelude", () => {
  test("builtins.sd compiles with no errors", () => {
    const sdContent = readFileSync(SRC_SD, "utf8");

    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: false,
      definitions: { builtins: {} as any },
      files: [
        {
          uri: "inmemory:///main.sd",
          type: "script",
          name: "main",
          ext: "sd",
          text: `${sdContent}\nscene start\nend\n`,
          version: 1,
          languageId: "sparkdown",
        } as any,
      ],
    });
    const result = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });
    const diags =
      (result.program as any).diagnostics?.["inmemory:///main.sd"] ?? [];
    const errors = diags.filter((d: any) => d?.severity === 1);
    if (errors.length) {
      console.log("ERRORS:", JSON.stringify(errors.slice(0, 8), null, 2));
    }
    expect(errors.length, "compile errors in builtins.sd").toBe(0);
  });
});
