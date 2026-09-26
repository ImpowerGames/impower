// A colon method call keeps its receiver in a compiler-generated temp and
// reads the method from that temp. The author never wrote the temp, so the
// call compiles with no diagnostic naming it, wherever the call sits.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

const MAIN_URI = "file://proj/main.sd";

type Project = Record<string, string>;

const uriOf = (name: string) => `file://proj/${name}.sd`;

const file = (uri: string, text: string): File => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function compileOnce(main: string, others: Project = {}) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: Object.entries({ main, ...others }).map(([name, text]) => file(uriOf(name), text)),
    });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function diagnostics(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list.map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

const counter = "store a = { n = 1, add = function(self, k) self.n = self.n + k return self end }";

describe("colon call receiver temp", () => {
  it("a colon call at top level raises no diagnostic", () => {
    const program = compileOnce([counter, "store r = 0", "& r = a:add(3)", ""].join("\n"));
    expect(diagnostics(program)).toEqual([]);
  });

  it("a chained colon call raises no diagnostic", () => {
    const program = compileOnce([counter, "store r = 0", "& r = a:add(10):add(20)", ""].join("\n"));
    expect(diagnostics(program)).toEqual([]);
  });

  it("a colon call inside a scene raises no diagnostic", () => {
    const program = compileOnce(
      [counter, "store r = 0", "", "scene start", "  & r = a:add(10):add(20)", "end", ""].join("\n"),
    );
    expect(diagnostics(program)).toEqual([]);
  });

  it("a colon call in an included script raises no diagnostic", () => {
    const program = compileOnce(["include shared.sd", ""].join("\n"), {
      shared: [counter, "store r = 0", "& r = a:add(10):add(20)", ""].join("\n"),
    });
    expect(diagnostics(program)).toEqual([]);
  });
});
