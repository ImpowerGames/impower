import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { describeRoot } from "../program/describeRoot";

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

function coldCompile(text: string) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [file(text, 1)] });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function incrementalCompile(text: string, line: number, insert: string) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [file(text, 1)] });
    compiler.compile({ textDocument: { uri: MAIN_URI } });
    const at = { line, character: 0 };
    compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: insert }],
    });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function insertLine(text: string, line: number, insert: string): string {
  const lines = text.split("\n");
  lines.splice(line, 0, insert.replace(/\n$/, ""));
  return lines.join("\n");
}

function content(program: SparkProgram): string[] {
  expect(program.chunks, "the compile built statement chunks").toBeDefined();
  return describeRoot(program.chunks!);
}

const SCRIPT = `-> s0

scene s0
  # mood happy
  Line 0.
  # mood sad
  Line 1.
end
`;

describe("tag lines", () => {
  it("two cold compiles of one script produce the same chunks", () => {
    const first = coldCompile(SCRIPT);
    const second = coldCompile(SCRIPT);
    expect(content(second)).toEqual(content(first));
  });

  it("an incremental compile equals a cold compile of the edited text", () => {
    const insert = "  An added line.\n";
    const edited = insertLine(SCRIPT, 4, insert);
    const incremental = incrementalCompile(SCRIPT, 4, insert);
    const cold = coldCompile(edited);
    expect(content(incremental)).toEqual(content(cold));
  });

  it("an added tag line above the others compiles as a cold compile does", () => {
    const insert = "  # weather rain\n";
    const edited = insertLine(SCRIPT, 3, insert);
    const incremental = incrementalCompile(SCRIPT, 3, insert);
    const cold = coldCompile(edited);
    expect(content(incremental)).toEqual(content(cold));
  });
});
