// A `# tag` line compiles to a runtime container of its own, so the tags'
// walker stops at the line's boundary. The container's name depends only on
// the script's text: two compiles of the same script produce the same
// program, and an incremental compile equals a cold compile of its text.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

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

// Compiles `text`, inserts `insert` at the start of `line`, and returns the
// incremental compile of the edited text.
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

function containerNames(program: any): string[] {
  return [...JSON.stringify(program.compiled).matchAll(/"#n":"(id-[^"]*)"/g)].map((m) => m[1]!);
}

const SCRIPT = `-> s0

scene s0
  # mood happy
  Line 0.
  # mood sad
  Line 1.
end
`;

describe("tag line container names", () => {
  it("two cold compiles of one script produce the same program", () => {
    const first = coldCompile(SCRIPT);
    const second = coldCompile(SCRIPT);
    expect(containerNames(first)).toHaveLength(2);
    expect(JSON.stringify(second.compiled)).toBe(JSON.stringify(first.compiled));
  });

  it("an incremental compile equals a cold compile of the edited text", () => {
    const insert = "  An added line.\n";
    const edited = insertLine(SCRIPT, 4, insert);
    const incremental = incrementalCompile(SCRIPT, 4, insert);
    const cold = coldCompile(edited);
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  });

  it("an added tag line above renames the containers as a cold compile does", () => {
    const insert = "  # weather rain\n";
    const edited = insertLine(SCRIPT, 3, insert);
    const incremental = incrementalCompile(SCRIPT, 3, insert);
    const cold = coldCompile(edited);
    expect(containerNames(cold)).toHaveLength(3);
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
  });

  it("an edit below a tag line keeps its container's name", () => {
    const before = containerNames(coldCompile(SCRIPT));
    const after = containerNames(incrementalCompile(SCRIPT, 7, "  Line 2.\n"));
    expect(after).toEqual(before);
  });
});
