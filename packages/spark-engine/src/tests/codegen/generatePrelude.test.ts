// CODEGEN: generates the builtins prelude from DEFAULT_BUILTIN_DEFINITIONS and
// writes it as a bundler-friendly TS module the compiler can import. Also
// compile-checks the generated source (no diagnostics, all defines reach
// context). Run explicitly; it WRITES a source file.
//
//   npx vitest run src/tests/codegen/generatePrelude.test.ts

import { describe, expect, test } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { DEFAULT_BUILTIN_DEFINITIONS } from "../../game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { serializeBuiltinsToPrelude } from "../../codegen/serializeBuiltinsToPrelude";

const OUT = resolve(
  __dirname,
  "../../../../sparkdown/src/compiler/builtins/builtins.sd",
);

describe("generate builtins prelude", () => {
  test("serialize + compile-check + write", () => {
    const defs = DEFAULT_BUILTIN_DEFINITIONS as Record<string, any>;
    const prelude = serializeBuiltinsToPrelude(defs);

    // Compile-check the generated prelude with NO builtins config.
    const compiler = new SparkdownCompiler();
    compiler.configure({
      definitions: { builtins: {} as any },
      files: [
        {
          uri: "inmemory:///main.sd",
          type: "script",
          name: "main",
          ext: "sd",
          text: prelude,
          version: 1,
          languageId: "sparkdown",
        } as any,
      ],
    });
    const result = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });
    const diags = (result.program as any).diagnostics?.["inmemory:///main.sd"] ?? [];
    const errors = diags.filter((d: any) => d?.severity === 1);
    const ctx = (result.program as any).context ?? {};

    // Count expected vs produced (type/name pairs).
    let expected = 0;
    let produced = 0;
    const missing: string[] = [];
    for (const type of Object.keys(defs)) {
      for (const name of Object.keys(defs[type])) {
        expected += 1;
        if (ctx[type]?.[name] !== undefined) produced += 1;
        else missing.push(`${type}.${name}`);
      }
    }
    console.log("MISSING:", missing.join(", "));
    console.log(
      `prelude: ${prelude.length} chars; defines expected=${expected} produced=${produced}; compile errors=${errors.length}`,
    );
    if (errors.length) {
      console.log("ERRORS:", JSON.stringify(errors.slice(0, 8), null, 2));
    }

    expect(errors.length, "compile errors in generated prelude").toBe(0);

    // Write the editable .sd prelude (raw sparkdown — readable + hand-editable).
    mkdirSync(dirname(OUT), { recursive: true });
    const header =
      `// The implicitly-imported builtins prelude: a \`define\` for every builtin\n` +
      `// type/instance. Compiled into every program so builtins populate both\n` +
      `// program.context (LSP) and the runtime __def tables (engine).\n` +
      `//\n` +
      `// Originally generated from DEFAULT_BUILTIN_DEFINITIONS; hand-maintainable.\n\n`;
    writeFileSync(OUT, header + prelude, "utf8");
    console.log("wrote", OUT);
  });
});
