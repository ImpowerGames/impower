// A closure decides while it is lowered whether each name its body calls is a
// top-level function (called directly) or an enclosing variable (captured as
// an upvalue). An edit elsewhere in the document that declares or removes that
// top-level function changes the answer, so the incremental compile has to
// lower the closure's chunk again even when the edit's reparse window does not
// reach it.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const MAIN_URI = "file://proj/main.sd";

const file = (text: string, version: number): File => ({
  uri: MAIN_URI,
  type: "script",
  name: "main",
  ext: "sd",
  text,
  version,
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

function position(text: string, offset: number) {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

function coldCompile(text: string) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [file(text, 1)] });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

// Compiles `base`, replaces `[from, to)` with `insert` through
// `updateDocument`, and compiles again.
function incrementalAfterEdit(base: string, from: number, to: number, insert: string) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [file(base, 1)] });
    compiler.compile({ textDocument: { uri: MAIN_URI } });
    compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        { range: { start: position(base, from), end: position(base, to) }, text: insert },
      ],
    });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function run(program: any) {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  const errors: string[] = [];
  story.onError = (message: string) => {
    errors.push(message);
  };
  const output = quiet(() => story.ContinueMaximally());
  return { output, errors };
}

function diagnostics(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list.map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

// Six scenes keep the function's chunk outside the region an edit at the top
// of the document reparses, so the incremental compile carries it.
const scenes = (numbers: number[]) =>
  numbers.flatMap((i) => [`scene s${i}`, `  Line ${i}.`, "end", ""]);
const SCENES = scenes([1, 2, 3, 4, 5, 6]);

const BODY = [
  "-> s0",
  "",
  "scene s0",
  "  & r = bottom()",
  "  Result {r}.",
  "end",
  "",
  ...SCENES,
  "store r = 0",
  "",
  "function bottom()",
  "  local g = function() return helper() end",
  "  return g()",
  "end",
  "",
].join("\n");

const HELPER = ["function helper()", "  return 7", "end", "", ""].join("\n");

describe("a carried closure follows the document's top-level functions", () => {
  it("calls a top-level function an edit declares above it", () => {
    const incremental = incrementalAfterEdit(BODY, 0, 0, HELPER);
    const cold = coldCompile(HELPER + BODY);
    expect(run(cold)).toEqual({ output: "Result 7.\n", errors: [] });
    expect(run(incremental)).toEqual(run(cold));
    expect(diagnostics(incremental)).toEqual(diagnostics(cold));
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  });

  it("calls a top-level function an edit declares at the end of the document", () => {
    // The scenes after the closure keep its chunk before the region an edit
    // at the end of the document reparses.
    const base = BODY + ["", ...scenes([7, 8, 9, 10, 11, 12])].join("\n");
    const insert = ["", "function helper()", "  return 7", "end", ""].join("\n");
    const incremental = incrementalAfterEdit(base, base.length, base.length, insert);
    const cold = coldCompile(base + insert);
    expect(run(cold)).toEqual({ output: "Result 7.\n", errors: [] });
    expect(run(incremental)).toEqual(run(cold));
    expect(diagnostics(incremental)).toEqual(diagnostics(cold));
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  });

  it("stops calling a top-level function an edit removes", () => {
    const incremental = incrementalAfterEdit(HELPER + BODY, 0, HELPER.length, "");
    const cold = coldCompile(BODY);
    expect(diagnostics(incremental)).toEqual(diagnostics(cold));
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  });
});
