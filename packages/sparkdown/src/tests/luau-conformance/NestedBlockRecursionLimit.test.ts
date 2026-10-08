// A run file nesting more blocks than Luau's block recursion limit compiles
// to Luau's `CodeTooComplex` diagnostic instead of overflowing the stack in
// the lowering (#1688). The source is
// Luau's `check_block_recursion_limit` (TypeInfer.test.cpp).

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const SNIPPET_URI = "inmemory:///snip.luau";
const source = "do ".repeat(595) + "local a = 1" + " end".repeat(595);

function compile() {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: `run "snip"\n`,
        version: 1,
        languageId: "sparkdown",
      },
      {
        uri: SNIPPET_URI,
        type: "script",
        name: "snip",
        ext: "luau",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } })
    .program;
}

describe("595 nested do blocks (#1688)", () => {
  it("report CodeTooComplex", () => {
    const program = compile();
    const messages = (program.diagnostics?.[SNIPPET_URI] ?? []).map((d) =>
      typeof d.message === "string" ? d.message : d.message.value,
    );
    expect(messages).toEqual([
      "Code is too complex to typecheck! Consider simplifying the code around this area",
    ]);
  });
});
