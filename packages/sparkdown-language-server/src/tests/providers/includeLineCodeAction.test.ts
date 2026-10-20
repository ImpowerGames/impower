// The language server's quick fixes (#1387): an `include` line, which every
// script under the project's folder makes needless, reports an error whose
// fix deletes the line. A client that asks for code actions gets the fix from
// `textDocument/codeAction`; the web editor's client, which asks for none,
// gets it in the diagnostic's `data`.

import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { INCLUDE_LINE_MESSAGE } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerInclude";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import {
  getCodeActions,
  getDiagnosticActions,
} from "../../utils/providers/getCodeActions";

const MAIN = "file://proj/main.sd";
const DEFS = "file://proj/scripts/defs.sd";
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const compile = (main: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  const file = (uri: string, text: string) => ({
    uri,
    type: "script",
    name: uri.split("/").at(-1)!.split(".")[0]!,
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  });
  compiler.configure({
    files: [file(MAIN, main), file(DEFS, lines("store gold = 1", ""))] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

/** `text` with the include line's quick fix applied. */
const fixed = (text: string): { title: string; kind?: string; text: string } => {
  const program = compile(text);
  const diagnostics = (program.diagnostics?.[MAIN] ?? []).filter(
    (d) =>
      (typeof d.message === "string" ? d.message : d.message.value) ===
      INCLUDE_LINE_MESSAGE,
  );
  expect(diagnostics).toHaveLength(1);
  const document = TextDocument.create(MAIN, "sparkdown", 1, text);
  const actions = getCodeActions(document, diagnostics);
  expect(actions).toHaveLength(1);
  const action = actions[0]!;
  return {
    title: action.title,
    kind: action.kind,
    text: TextDocument.applyEdits(document, action.edit!.changes![MAIN]!),
  };
};

describe("the include line's quick fix", () => {
  test("deletes the line and its line break", () => {
    expect(
      fixed(lines("include scripts/defs.sd", "Gold: {gold}.", "")),
    ).toEqual({
      title: "Delete this line",
      kind: "quickfix",
      text: lines("Gold: {gold}.", ""),
    });
  });

  test("deletes a last line with no line break of its own, and the break before it", () => {
    expect(fixed(lines("Gold: {gold}.", "include scripts/defs.sd")).text).toBe(
      "Gold: {gold}.",
    );
  });

  test("deletes an indented line inside a scene", () => {
    expect(
      fixed(
        lines("-> start", "scene start", "  include scripts/defs.sd", "  Gold: {gold}.", "end", ""),
      ).text,
    ).toBe(lines("-> start", "scene start", "  Gold: {gold}.", "end", ""));
  });

  test("offers nothing for a diagnostic that has no fix", () => {
    const document = TextDocument.create(MAIN, "sparkdown", 1, "Hello.");
    expect(
      getCodeActions(document, [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: "Something else.",
        },
      ]),
    ).toEqual([]);
  });

  test("is carried in the diagnostic's data, by offset, for a client that asks for no code actions", () => {
    const text = lines("Hello.", "include scripts/defs.sd", "Gold: {gold}.", "");
    const program = compile(text);
    const workspace = Object.create(
      SparkdownLanguageServerWorkspace.prototype,
    ) as SparkdownLanguageServerWorkspace;
    const documents = new SparkdownDocumentRegistry([]);
    documents.add({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text },
    });
    Object.assign(workspace, { _documents: documents });
    const published = workspace.getDiagnostics(program, MAIN);
    const include = published.find(
      (d) =>
        (typeof d.message === "string" ? d.message : d.message.value) ===
        INCLUDE_LINE_MESSAGE,
    );
    const start = text.indexOf("include");
    expect(include?.data).toEqual([
      {
        name: "Delete this line",
        changes: [{ from: start, to: text.indexOf("Gold"), insert: "" }],
      },
    ]);
    expect(
      getDiagnosticActions(TextDocument.create(MAIN, "sparkdown", 1, text), include!),
    ).toEqual(include?.data);

    Object.assign(workspace, {
      _clientCapabilities: { textDocument: { codeAction: {} } },
    });
    expect(
      workspace.getDiagnostics(program, MAIN).every((d) => d.data === undefined),
    ).toBe(true);
  });
});
