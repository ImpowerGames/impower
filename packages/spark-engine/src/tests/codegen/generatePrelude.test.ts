// CODEGEN: regenerates the bundler-friendly `builtins.ts` wrapper from the
// hand-maintained `builtins.sd` prelude (esbuild can't import .sd raw, so the
// compiler imports this string wrapper — same pattern as the grammar JSON).
// Also compile-checks the prelude (no diagnostics). Run explicitly after editing
// builtins.sd; it WRITES a source file.
//
//   npx vitest run src/tests/codegen/generatePrelude.test.ts

import { describe, expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";

const BUILTINS_DIR = resolve(
  __dirname,
  "../../../../sparkdown/src/compiler/builtins",
);
// `builtins.sd` is the human-editable source of truth; `builtins.ts` is the
// generated string wrapper the compiler imports.
const SRC_SD = resolve(BUILTINS_DIR, "builtins.sd");
const OUT_TS = resolve(BUILTINS_DIR, "builtins.ts");

describe("regenerate builtins prelude wrapper", () => {
  test("compile-check builtins.sd + regenerate builtins.ts", () => {
    const sdContent = readFileSync(SRC_SD, "utf8");

    // Compile-check the prelude in isolation (no builtins config / no implicit
    // prelude include — this IS the prelude). It must produce no errors.
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
          text: sdContent,
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

    writeFileSync(
      OUT_TS,
      `// GENERATED from builtins.sd — do not hand-edit. Edit builtins.sd and\n` +
        `// re-run the prelude codegen. (esbuild can't import .sd raw, so the\n` +
        `// compiler imports this string wrapper — same pattern as the grammar JSON.)\n` +
        `export const BUILTINS_PRELUDE = ${JSON.stringify(sdContent)};\n`,
      "utf8",
    );
    console.log("wrote", OUT_TS);
  });
});
