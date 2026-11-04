import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

describe("program.version from the compiler", () => {
  it("is unset until a workspace publishes the program", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: "Hello.\n",
          version: 7,
          languageId: "sparkdown",
        },
      ],
    } as never);
    const result = compiler.compile({ textDocument: { uri: URI } });
    expect(result.program.scripts[URI]).toBe(7);
    expect(result.program.version).toBeUndefined();
  });
});
