import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programSummary } from "../../compiler/utils/programSummary";

const MAIN = "inmemory:///main.sd";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
}

describe("the program's front matter", () => {
  test("holds each field of main's front matter block, by keyword, one entry per line", () => {
    const program = compile(
      ["---", "title:", "  The Long Road", "  Home", "author: Ada Lovelace", "typecheck: strict", "---", "", "Hello."].join("\n") + "\n",
    );
    expect(program.frontMatter).toEqual({
      title: ["The Long Road", "Home"],
      author: ["Ada Lovelace"],
      typecheck: ["strict"],
    });
  });

  test("is absent for a script without a front matter block", () => {
    expect(compile("Hello.\n").frontMatter).toBeUndefined();
  });

  test("is kept by the summary the worker publishes", () => {
    const program = compile(["---", "title: Kept", "---", "", "Hello."].join("\n") + "\n");
    expect(programSummary(program, true).frontMatter).toEqual({ title: ["Kept"] });
  });
});
