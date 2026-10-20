// A `store` or `const` named after a define type raises a shadow warning, and
// whether it does depends on the define types anywhere in the document. An edit
// elsewhere that adds or removes such a define changes the answer, so the
// incremental compile has to lower the store's chunk again even when the
// edit's reparse window does not reach it.
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

// Every diagnostic as `sev<severity> L<line>: <message>`.
function diagList(program: any): string[] {
  return Object.values(program.diagnostics ?? {})
    .flatMap((list: any) =>
      list.map((d: any) => {
        const message = typeof d.message === "string" ? d.message : (d.message?.value ?? "");
        return `sev${d.severity} L${d.range?.start?.line}: ${message}`;
      }),
    )
    .sort();
}

const shadowWarnings = (list: string[]) => list.filter((d) => d.includes("shadows the define type"));

// Six scenes keep the store's chunk outside the region an edit at the top of
// the document reparses, so the incremental compile carries it.
const BASE = [
  "-> s0",
  "",
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [`scene s${i}`, `  Line ${i}.`, "end", ""]),
  "store thing = 1",
  "",
].join("\n");

const DEFINES = [
  "define thing with",
  "  x = 1",
  "end",
  "",
  "define hero as thing with",
  "  x = 2",
  "end",
  "",
  "",
].join("\n");

describe("a carried store's shadow warning follows the document's define types", () => {
  it("warns once an edit above it adds a define type of its name", () => {
    const incremental = incrementalAfterEdit(BASE, 0, 0, DEFINES);
    const cold = coldCompile(DEFINES + BASE);
    expect(shadowWarnings(diagList(cold))).toHaveLength(1);
    expect(diagList(incremental)).toEqual(diagList(cold));
  });

  it("stops warning once an edit removes the define type of its name", () => {
    const incremental = incrementalAfterEdit(DEFINES + BASE, 0, DEFINES.length, "");
    const cold = coldCompile(BASE);
    expect(shadowWarnings(diagList(cold))).toEqual([]);
    expect(diagList(incremental)).toEqual(diagList(cold));
  });
});
