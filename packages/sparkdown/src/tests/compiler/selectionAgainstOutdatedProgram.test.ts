import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SelectedCompilerDocumentMessage } from "../../compiler/classes/messages/SelectedCompilerDocumentMessage";

const URI = "inmemory:///main.sd";

const SOURCE = [
  "$:",
  "  A MOONLIT ROOFTOP",
  "",
  "BUNNY:",
  "  Nice night for it. >",
  "  Isn't it though. >",
  "  Or is it?",
  "",
].join("\n");

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

function compilerWithSource(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler;
}

function typeNewLine(compiler: SparkdownCompiler, version: number) {
  const edited = [
    "$:",
    "  A MOONLIT ROOFTOP",
    "",
    "BUNNY:",
    "  Nice night for it. >",
    "  Isn't it though. >",
    "  Wait, do you hear that? >",
    "  Or is it?",
    "",
  ].join("\n");
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [{ text: edited }],
  } as never);
}

function select(compiler: SparkdownCompiler, line: number) {
  return compiler.selectDocument({
    textDocument: { uri: URI },
    selectedRange: {
      start: { line, character: 0 },
      end: { line, character: 0 },
    },
    docChanged: false,
    userEvent: true,
  } as never);
}

describe("a selection made against a program the document has outrun (#489)", () => {
  it("is not outdated while the document matches the compiled program", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });

  it("is outdated once the document has been edited since that compile", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);

    expect(compiler.isProgramOutdated()).toBe(true);
    expect(select(compiler, 6).programOutdated).toBe(true);
  });

  it("stops being outdated once the edit has been compiled", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });

  it("tells the selection listeners before they run", () => {
    const compiler = compilerWithSource(SOURCE);
    quiet(() => compiler.compile({ textDocument: { uri: URI } } as never));
    typeNewLine(compiler, 2);

    const seen: (boolean | undefined)[] = [];
    compiler.addEventListener(SelectedCompilerDocumentMessage.method, (p) => {
      seen.push(p.programOutdated);
    });
    select(compiler, 6);

    expect(seen).toEqual([true]);
  });

  it("says nothing is outdated when no compile has happened yet", () => {
    const compiler = compilerWithSource(SOURCE);

    expect(compiler.isProgramOutdated()).toBe(false);
    expect(select(compiler, 6).programOutdated).toBe(false);
  });
});
