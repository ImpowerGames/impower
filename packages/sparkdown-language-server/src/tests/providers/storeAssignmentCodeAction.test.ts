import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { STORE_INSIDE_FLOW_MESSAGE } from "@impower/sparkdown/src/compiler/utils/declarationPlacement";
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
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const compile = (main: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: main,
        version: 1,
        languageId: "sparkdown",
      },
    ] as never,
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

const storeDiagnostics = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? []).filter(
    (d) =>
      (typeof d.message === "string" ? d.message : d.message.value) ===
      STORE_INSIDE_FLOW_MESSAGE,
  );

const actions = (text: string): { title: string; kind?: string; text: string }[] => {
  const diagnostics = storeDiagnostics(compile(text));
  expect(diagnostics).toHaveLength(1);
  const document = TextDocument.create(MAIN, "sparkdown", 1, text);
  return getCodeActions(document, diagnostics).map((action) => ({
    title: action.title,
    kind: action.kind,
    text: TextDocument.applyEdits(document, action.edit!.changes![MAIN]!),
  }));
};

const scene = (...body: string[]) =>
  lines("store gold = 0", "", "scene start", ...body, "  Gold: {gold}.", "end", "");

describe("the store-inside-a-flow quick fix", () => {
  test("changes a store inside a scene to an assignment", () => {
    expect(actions(scene("  store gold = 1"))).toEqual([
      {
        title: "Change to an assignment",
        kind: "quickfix",
        text: scene("  & gold = 1"),
      },
    ]);
  });

  test("drops the keyword of a store on a line & already marks", () => {
    expect(actions(scene("  & store gold = 1"))[0]?.text).toBe(
      scene("  & gold = 1"),
    );
  });

  test("changes a store of several names, one value each", () => {
    expect(actions(scene("  store gold, silver = 1, 2"))[0]?.text).toBe(
      scene("  & gold, silver = 1, 2"),
    );
  });

  test("is not offered on a store whose names spread from a call", () => {
    expect(
      actions(
        lines(
          "function pair()",
          "  return 1, 2",
          "end",
          "",
          "scene start",
          "  store a, b = pair()",
          "  {a} {b}",
          "end",
          "",
        ),
      ),
    ).toEqual([]);
  });

  test("is not offered on a store that gives its name a type", () => {
    expect(actions(scene("  store count: number = 1"))).toEqual([]);
  });

  test("is carried in the diagnostic's data, by offset, for a client that asks for no code actions", () => {
    const text = scene("  store gold = 1");
    const program = compile(text);
    const workspace = Object.create(
      SparkdownLanguageServerWorkspace.prototype,
    ) as SparkdownLanguageServerWorkspace;
    const documents = new SparkdownDocumentRegistry([]);
    documents.add({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text },
    });
    Object.assign(workspace, { _documents: documents, _watchedFiles: new Map() });
    const store = workspace
      .getDiagnostics(program, MAIN)
      .find(
        (d) =>
          (typeof d.message === "string" ? d.message : d.message.value) ===
          STORE_INSIDE_FLOW_MESSAGE,
      );
    const start = text.indexOf("store gold = 1");
    expect(store?.data).toEqual([
      {
        name: "Change to an assignment",
        changes: [
          { from: start, to: start + "store gold = 1".length, insert: "& gold = 1" },
        ],
      },
    ]);
    expect(
      getDiagnosticActions(
        TextDocument.create(MAIN, "sparkdown", 1, text),
        storeDiagnostics(program)[0]!,
      ),
    ).toEqual(store?.data);
  });
});
