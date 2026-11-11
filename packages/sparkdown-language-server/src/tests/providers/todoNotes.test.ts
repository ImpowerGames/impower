import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getTodoNotes } from "../../utils/providers/getTodoNotes";

const URI = "file:///proj/main.sd";
const lines = (...text: string[]) => text.join(String.fromCharCode(10));

const SCRIPT = lines(
  "// TODO: fix this",
  "scene A",
  "  Hello. // todo later",
  "  // Todo",
  "  // todolist is not a note",
  "  // not a TODO",
  "  /* TODO block */",
  '  store s = "// TODO no"',
  "end",
  "",
);

const registry = (text: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return documents;
};

const notesOf = (text: string) => {
  const documents = registry(text);
  return getTodoNotes(documents.get(URI)!, documents.tree(URI));
};

describe("provider · todo notes", () => {
  test("a line or trailing comment beginning with todo is an information note over the comment", () => {
    expect(
      notesOf(SCRIPT).map((d) => [d.message, d.severity, d.source, d.range]),
    ).toEqual([
      [
        "To do: fix this",
        DiagnosticSeverity.Information,
        "todo",
        { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
      ],
      [
        "To do: later",
        DiagnosticSeverity.Information,
        "todo",
        { start: { line: 2, character: 9 }, end: { line: 2, character: 22 } },
      ],
      [
        "To do",
        DiagnosticSeverity.Information,
        "todo",
        { start: { line: 3, character: 2 }, end: { line: 3, character: 9 } },
      ],
      [
        "To do: block",
        DiagnosticSeverity.Information,
        "todo",
        { start: { line: 6, character: 5 }, end: { line: 6, character: 15 } },
      ],
    ]);
  });

  test("each note records the comment text its fix expects to remove", () => {
    expect(notesOf(SCRIPT).map((d) => d.data)).toEqual([
      { expect: "// TODO: fix this" },
      { expect: "// todo later" },
      { expect: "// Todo" },
      { expect: "TODO block" },
    ]);
  });

  test("each line of a block comment that begins with todo is a note", () => {
    expect(
      notesOf(
        lines(
          "scene A",
          "  /* todo: first",
          "  not a note",
          "    TODO second */",
          "  Shown. /* todo inline */ text",
          "end",
          "",
        ),
      ).map((d) => [d.message, d.range]),
    ).toEqual([
      [
        "To do: first",
        { start: { line: 1, character: 5 }, end: { line: 1, character: 16 } },
      ],
      [
        "To do: second",
        { start: { line: 3, character: 4 }, end: { line: 3, character: 15 } },
      ],
      [
        "To do: inline",
        { start: { line: 4, character: 12 }, end: { line: 4, character: 23 } },
      ],
    ]);
  });

  test("a string, a longer or shorter word and a mid-comment todo are not notes", () => {
    expect(
      notesOf(
        lines(
          "  // todolist",
          "  // TOD: fix this",
          "  // not a TODO",
          "  /* not a TODO */",
          '  store s = "// TODO no"',
          "",
        ),
      ),
    ).toEqual([]);
  });

  test("the workspace publishes the notes with the document's diagnostics", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri: URI,
          type: "script",
          name: "main",
          ext: "sd",
          text: SCRIPT,
          version: 1,
          languageId: "sparkdown",
        },
      ] as never,
    });
    const { warn, error, log } = console;
    console.warn = console.error = console.log = () => {};
    let program: SparkProgram;
    try {
      program = compiler.compile({ textDocument: { uri: URI } }).program;
    } finally {
      console.warn = warn;
      console.error = error;
      console.log = log;
    }
    const workspace = Object.create(
      SparkdownLanguageServerWorkspace.prototype,
    ) as SparkdownLanguageServerWorkspace;
    Object.assign(workspace, { _documents: registry(SCRIPT), _watchedFiles: new Map() });
    const notes = workspace
      .getDiagnostics(program, URI)
      .filter((d) => d.source === "todo")
      .map((d) => d.message);
    expect(notes).toEqual(["To do: fix this", "To do: later", "To do", "To do: block"]);
  });
});
