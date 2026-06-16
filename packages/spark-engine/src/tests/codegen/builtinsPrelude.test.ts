// Validates the builtins→prelude serializer: the generated `.sd`, compiled with
// NO builtins config, must reproduce the same `program.context` the JS builtins
// produce via the compiler's populateBuiltins path.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { coreBuiltinDefinitions } from "../../game/core/coreBuiltinDefinitions";
import { serializeBuiltinsToPrelude } from "../../codegen/serializeBuiltinsToPrelude";

const URI = "inmemory:///main.sd";

/** Compile `source` with an explicit builtins config; return program.context. */
function compileContext(
  source: string,
  builtins: Record<string, any>,
): Record<string, any> {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    definitions: { builtins: builtins as any },
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
  const result = compiler.compile({ textDocument: { uri: URI } });
  return (result.program as any).context ?? {};
}

describe("builtins prelude serializer (core types)", () => {
  test("generated prelude reproduces the JS builtins' program.context", () => {
    const defs = coreBuiltinDefinitions() as Record<string, any>;
    const prelude = serializeBuiltinsToPrelude(defs);

    // Target: what the JS builtins produce (empty source + builtins config).
    const target = compileContext("", defs);
    // Actual: the generated prelude compiled with NO builtins config.
    const actual = compileContext(prelude, {});

    for (const type of Object.keys(defs)) {
      for (const name of Object.keys(defs[type])) {
        expect(
          actual[type]?.[name],
          `context.${type}.${name} from prelude`,
        ).toEqual(target[type]?.[name]);
      }
    }
  });

  // NOTE: full builtins equivalence is NOT validated by byte-equality with the
  // JS builtins — the prelude is intentionally MORE correct (the JS constructors
  // mis-stamp `$name="$default"` on every named instance; config gains
  // $type/$name). The real validation is the engine golden-master once the
  // prelude is wired as the implicit include.
});
