// Compile-check the builtins prelude in isolation. `builtins.sd` is the
// hand-maintained source of truth; the compiler imports it as raw text via
// `builtins.sd?raw` (esbuild + Vite both honor the query), so there is no
// generated wrapper to keep in sync — this test no longer WRITES a source file,
// it only guards that the prelude itself compiles with zero errors.
//
//   npx vitest run src/tests/codegen/generatePrelude.test.ts

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
  });
});
