import { diagnosticCount, forEachDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { getDocumentSymbols } from "../../sparkdown-language-server/src/utils/providers/getDocumentSymbols";
import { afterEach, describe, expect, it } from "vitest";
import { LSPClient } from "../src/client";
import { serverDiagnostics } from "../src/diagnostics";
import { LSPPlugin } from "../src/plugin";
import { branchSpansOf, insertConstruct, sceneSpansOf } from "../src/insert";

const URI = "file:///main.sd";
const LF = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(LF);
const WARNING = "Cannot find character named `CHARACTER`";

class StandInServer {
  handler?: (value: object) => void;
  send() {}
  subscribe(handler: (value: object) => void) {
    this.handler = handler;
  }
  unsubscribe() {}
  publish(view: EditorView, diagnostics: unknown[]) {
    LSPPlugin.get(view)!.client.sync();
    this.handler!({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: URI, diagnostics },
    });
  }
}

const compiled = (text: string) => {
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
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: URI } }).program
      .diagnostics?.[URI] ?? [];
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const structureOf = (source: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const symbols = getDocumentSymbols(
    documents.get(URI)!,
    documents.annotations(URI),
    documents.tree(URI),
  );
  return {
    scenes: sceneSpansOf(symbols),
    branches: branchSpansOf(symbols),
    tree: documents.tree(URI)!,
    endsDialogue: endsDialogueBlock,
  };
};

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

const mount = (doc: string) => {
  const server = new StandInServer();
  const client = new LSPClient({ extensions: [serverDiagnostics()] }).connect(
    server,
    undefined,
    { capabilities: { textDocumentSync: 2 } },
  );
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [client.plugin({ uri: URI, version: 0 })],
    }),
    parent: document.body,
  });
  views.push(view);
  const publish = () =>
    server.publish(view, compiled(view.state.doc.toString()));
  return { view, server, publish };
};

const shown = (view: EditorView) => {
  const found: string[] = [];
  forEachDiagnostic(view.state, (d, from, to) => {
    found.push(`${view.state.sliceDoc(from, to)}: ${d.message}`);
  });
  return found;
};

const SOURCE = lines(
  "define IMANI as character with",
  '  name = "Imani"',
  "end",
  "",
  "scene start",
  "  The door opens.",
  "end",
  "",
);

const addDialogue = (view: EditorView) => {
  const source = view.state.doc.toString();
  view.dispatch({ selection: { anchor: source.indexOf("The door opens.") } });
  expect(insertConstruct("dialogue", structureOf(source))(view)).toBe(true);
  const { from, to } = view.state.selection.main;
  expect(view.state.sliceDoc(from, to)).toBe("CHARACTER");
};

const typeOver = (view: EditorView, text: string) => {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: "input.type",
  });
};

describe("the missing-character warning on the Add > Dialogue placeholder", () => {
  it("is withheld while the inserted placeholder is untouched and selected", () => {
    const { view, publish } = mount(SOURCE);
    addDialogue(view);
    expect(
      compiled(view.state.doc.toString()).map((d) =>
        typeof d.message === "string" ? d.message : d.message.value,
      ),
    ).toEqual([WARNING]);
    publish();
    expect(shown(view)).toEqual([]);
    expect(diagnosticCount(view.state)).toBe(0);
  });

  it("shows the warning at once when the caret leaves the unedited placeholder", () => {
    const { view, publish } = mount(SOURCE);
    addDialogue(view);
    publish();
    view.dispatch({ selection: { anchor: view.state.selection.main.to } });
    expect(shown(view)).toEqual([`CHARACTER: ${WARNING}`]);
    expect(diagnosticCount(view.state)).toBe(1);
  });

  it("shows no warning when the placeholder is replaced with an existing character", () => {
    const { view, publish } = mount(SOURCE);
    addDialogue(view);
    publish();
    typeOver(view, "IMANI");
    expect(shown(view)).toEqual([]);
    publish();
    expect(shown(view)).toEqual([]);
  });

  it("shows the warning when the placeholder is replaced with an unknown name", () => {
    const { view, publish } = mount(SOURCE);
    addDialogue(view);
    publish();
    typeOver(view, "NOBODY");
    publish();
    expect(shown(view)).toEqual([
      "NOBODY: Cannot find character named `NOBODY`",
    ]);
  });

  it("still warns for a hand-typed CHARACTER cue, before and during a withheld placeholder", () => {
    const typed = SOURCE.replace(
      "  The door opens.",
      lines("  CHARACTER:", "    Hi.", "  The door opens."),
    );
    const { view, publish } = mount(typed);
    publish();
    expect(shown(view)).toEqual([`CHARACTER: ${WARNING}`]);
    addDialogue(view);
    publish();
    const withheld = view.state.selection.main;
    expect(shown(view)).toEqual([`CHARACTER: ${WARNING}`]);
    let warnedAt = -1;
    forEachDiagnostic(view.state, (_d, from) => {
      warnedAt = from;
    });
    expect(warnedAt).toBe(typed.indexOf("CHARACTER"));
    expect(warnedAt).not.toBe(withheld.from);
  });

  it("keeps another diagnostic on the cue line when the placeholder is typed over", () => {
    const { view, server } = mount(SOURCE);
    addDialogue(view);
    const line = view.state.doc.lineAt(view.state.selection.main.from);
    const { from, to } = view.state.selection.main;
    const at = (start: number, end: number) => ({
      start: { line: line.number - 1, character: start },
      end: { line: line.number - 1, character: end },
    });
    server.publish(view, [
      {
        range: at(from - line.from, to - line.from),
        severity: 2,
        message: { kind: "markdown", value: WARNING },
      },
      { range: at(0, line.length), severity: 1, message: "Something else" },
    ]);
    expect(shown(view)).toEqual(["  CHARACTER:: Something else"]);
    typeOver(view, "IMANI");
    expect(shown(view)).toEqual(["  IMANI:: Something else"]);
  });

  it("keeps every other diagnostic at its lint position when the caret leaves during an edit elsewhere", () => {
    const others = (text: string) => {
      const door = text.split(LF).findIndex((l) => l.includes("The door"));
      return [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
          severity: 1,
          message: "First",
        },
        {
          range: { start: { line: door, character: 2 }, end: { line: door, character: 6 } },
          severity: 1,
          message: "Second",
        },
        {
          range: { start: { line: door, character: 0 }, end: { line: door, character: 2 } },
          severity: 1,
          message: "Indent",
        },
      ];
    };
    const { view, server } = mount(SOURCE);
    addDialogue(view);
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const text = view.state.doc.toString();
    server.publish(view, [
      {
        range: {
          start: { line: line.number - 1, character: from - line.from },
          end: { line: line.number - 1, character: to - line.from },
        },
        severity: 2,
        message: { kind: "markdown", value: WARNING },
      },
      ...others(text),
    ]);
    const control = mount(text);
    control.server.publish(control.view, others(text));
    const door = text.indexOf("  The door");
    const leaveWhileEditing = (target: EditorView) =>
      target.dispatch({
        changes: [
          { from: 0, insert: "X" },
          { from: door, insert: "Y" },
        ],
        selection: { anchor: to + 4 },
      });
    leaveWhileEditing(view);
    leaveWhileEditing(control.view);
    expect(shown(control.view)).toHaveLength(3);
    expect(shown(control.view)).toEqual(
      expect.arrayContaining(["define: First", "The : Second"]),
    );
    expect(shown(view)).toEqual([
      ...shown(control.view),
      `CHARACTER: ${WARNING}`,
    ]);
  });

  it("still shows another diagnostic on the placeholder's line", () => {
    const { view, server } = mount(SOURCE);
    addDialogue(view);
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const range = {
      start: { line: line.number - 1, character: from - line.from },
      end: { line: line.number - 1, character: to - line.from },
    };
    server.publish(view, [
      { range, severity: 2, source: "sparkdown", message: { kind: "markdown", value: WARNING } },
      { range, severity: 1, source: "sparkdown", message: "Something else" },
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
        severity: 2,
        message: WARNING,
      },
    ]);
    expect(shown(view)).toEqual([
      `define: ${WARNING}`,
      "CHARACTER: Something else",
    ]);
  });
});
