import { describe, expect, test } from "vitest";
import BUILTINS_PRELUDE from "../../compiler/builtins/builtins.sd?raw";
import {
  declaredGlobalNames,
  SparkdownCompiler,
} from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///__builtins__.sd";

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
    expect(names.size).toBeGreaterThan(10);
    expect(names.has("config")).toBe(true);
    expect(names.has("game")).toBe(true);
    expect(names.has("main")).toBe(false);
    expect([...names].filter((name) => name.startsWith("$"))).toEqual([]);
  });
});
