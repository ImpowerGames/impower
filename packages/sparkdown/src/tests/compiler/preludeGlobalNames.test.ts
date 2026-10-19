import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import {
  declaredGlobalNames,
  SparkdownCompiler,
} from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///__builtins__.sd";

/** The builtins prelude compiled as the compiler compiles it once for every
 *  program. */
const compilePrelude = () => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: {} as any },
    files: [
      {
        uri: URI,
        type: "script",
        name: "__builtins__",
        ext: "sd",
        text: BUILTINS_PRELUDE,
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
};

describe("the builtins prelude's global names", () => {
  test("are the globals its declaration chunks declare, without the scoped names", () => {
    const chunked = compilePrelude();
    expect(chunked.chunks).toBeDefined();
    const names = declaredGlobalNames(chunked.chunks!);
    // Not vacuous: the type roots are there, and neither a scoped name nor a
    // name the prelude's context holds that is no runtime global (#437).
    expect(names.size).toBeGreaterThan(10);
    expect(names.has("config")).toBe(true);
    expect(names.has("game")).toBe(true);
    expect(names.has("main")).toBe(false);
    expect([...names].filter((name) => name.startsWith("$"))).toEqual([]);
  });
});
