import { history, undo } from "@codemirror/commands";
import { diagnosticCount } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LSPClient } from "@impower/codemirror-vscode-lsp-client/src/client";
import { serverDiagnostics } from "@impower/codemirror-vscode-lsp-client/src/diagnostics";
import {
  branchSpansOf,
  insertConstruct,
  sceneSpansOf,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { LSPPlugin } from "@impower/codemirror-vscode-lsp-client/src/plugin";
import { getDocumentVersion } from "@impower/codemirror-vscode-lsp-client/src/version";
import { ScriptEditorController } from "@impower/sparkdown-document-views/src/modules/script-editor/ScriptEditorController";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "@impower/sparkdown/src/compiler/utils/endsDialogueBlock";
import { getDocumentSymbols } from "../../../packages/sparkdown-language-server/src/utils/providers/getDocumentSymbols";

const rpc = vi.hoisted(() => ({
  notifications: new Map<string, (params: unknown) => void>(),
}));
vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: () => ({
    onRequest() {},
    onNotification(method: string, handler: (params: unknown) => void) {
      rpc.notifications.set(method, handler);
    },
    onClose() {},
    listen() {},
    dispose() {},
  }),
}));

import WorkspaceConfiguration from "../../src/modules/spark-editor/workspace/WorkspaceConfiguration";
import WorkspaceLanguageServer from "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer";
import problems from "../../src/modules/spark-editor/workspace/problems/ProblemsStore";

const URI = "file:///main.sd";
const WARNING = "Cannot find character named `CHARACTER`";
const LF = String.fromCharCode(10);
const SOURCE = ["scene start", "  The door opens.", "end", ""].join(LF);

class Controller extends ScriptEditorController {
  attach(view: EditorView) {
    this._view = view;
    this._textDocument = {
      uri: URI,
      languageId: "sparkdown",
      version: 5,
      text: SOURCE,
    };
  }

  updated(update: ViewUpdate) {
    this.publishWithheld(update.state, update.changes);
  }
}

class StandInServer {
  handler?: (value: object) => void;
  send() {}
  subscribe(handler: (value: object) => void) {
    this.handler = handler;
  }
  unsubscribe() {}
}

const cleanups: (() => void)[] = [];
let ls: WorkspaceLanguageServer;
let heard: unknown[][];

beforeEach(() => {
  rpc.notifications.clear();
  problems.diagnostics.value = {};
  vi.stubGlobal(
    "Worker",
    class {
      addEventListener() {}
      postMessage() {}
    },
  );
  ls = new WorkspaceLanguageServer({
    configuration: new WorkspaceConfiguration(),
    window: {} as never,
  });
  heard = [];
  ls.onPublishedDiagnostics((params) => {
    heard.push(params.diagnostics);
  });
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  ls.stop();
  vi.unstubAllGlobals();
});

const insertedDialogue = (source = SOURCE) => {
  const host = document.body.appendChild(document.createElement("div"));
  const refs = {
    editor: host.appendChild(document.createElement("div")),
    loading: host.appendChild(document.createElement("div")),
    placeholder: host.appendChild(document.createElement("div")),
    main: host.appendChild(document.createElement("div")),
  };
  const controller = new Controller(host, refs, {
    appearance: {} as never,
    languageServerWorker: {} as never,
    languageServerConnection: {} as never,
  });
  const server = new StandInServer();
  const client = new LSPClient({ extensions: [serverDiagnostics()] }).connect(
    server,
    undefined,
    { capabilities: { textDocumentSync: 2 } },
  );
  const view = new EditorView({
    state: EditorState.create({
      doc: source,
      extensions: [
        history(),
        client.plugin({ uri: URI, version: 5 }),
        EditorView.updateListener.of((update) => controller.updated(update)),
      ],
    }),
    parent: refs.editor,
  });
  controller.attach(view);
  cleanups.push(() => {
    controller.dispose();
    view.destroy();
    host.remove();
  });
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 5, languageId: "sparkdown" },
  });
  const symbols = getDocumentSymbols(
    documents.get(URI)!,
    documents.annotations(URI),
    documents.tree(URI),
  );
  view.dispatch({ selection: { anchor: source.indexOf("The door") } });
  expect(
    insertConstruct("dialogue", {
      scenes: sceneSpansOf(symbols),
      branches: branchSpansOf(symbols),
      tree: documents.tree(URI)!,
      endsDialogue: endsDialogueBlock,
    })(view),
  ).toBe(true);
  const { from, to } = view.state.selection.main;
  expect(view.state.sliceDoc(from, to)).toBe("CHARACTER");
  const publish = (diagnostics?: unknown[]) => {
    LSPPlugin.get(view)!.client.sync();
    const at = view.state.doc.toString().indexOf("CHARACTER");
    const line = view.state.doc.lineAt(Math.max(0, at));
    const params = {
      uri: URI,
      version: getDocumentVersion(view.state),
      diagnostics: diagnostics ?? [
        {
          range: {
            start: { line: line.number - 1, character: at - line.from },
            end: { line: line.number - 1, character: at - line.from + 9 },
          },
          severity: 2,
          source: "sparkdown",
          message: WARNING,
        },
      ],
    };
    rpc.notifications.get("textDocument/publishDiagnostics")!(params);
    server.handler!({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params,
    });
  };
  publish();
  return { view, publish, from, to };
};

const agree = (view: EditorView, count: number) => {
  expect(diagnosticCount(view.state)).toBe(count);
  expect(problems.counts.value.problems).toBe(count);
  expect(heard.at(-1)).toHaveLength(count);
};

describe("the editor and the app agree on the withheld placeholder warning", () => {
  it("withhold it while the placeholder is selected", () => {
    const { view } = insertedDialogue();
    agree(view, 0);
  });

  it("show it when the caret leaves", () => {
    const { view, to } = insertedDialogue();
    view.dispatch({ selection: { anchor: to } });
    agree(view, 1);
  });

  it("show it when the caret leaves in the same transaction as an edit on another line", () => {
    const { view, to } = insertedDialogue();
    view.dispatch({
      changes: { from: view.state.doc.toString().indexOf("The door"), insert: "X" },
      selection: { anchor: to },
    });
    agree(view, 1);
  });

  it("keep it hidden while an edit before the selected placeholder moves the range", () => {
    const { view, from, to } = insertedDialogue();
    view.dispatch({
      changes: { from: 0, insert: LF },
      selection: { anchor: from + 1, head: to + 1 },
    });
    agree(view, 0);
  });

  it("keep withholding a fresh publish for the moved range, then show it when the caret leaves", () => {
    const { view, from, to, publish } = insertedDialogue();
    view.dispatch({
      changes: { from: 0, insert: LF },
      selection: { anchor: from + 1, head: to + 1 },
    });
    publish();
    agree(view, 0);
    view.dispatch({ selection: { anchor: to + 1 } });
    agree(view, 1);
  });

  it("keep withholding when an edit moves the placeholder to another line without moving its offsets", () => {
    const { view, from, to, publish } = insertedDialogue(
      ["//", "scene start", "  The door opens.", "end", ""].join(LF),
    );
    const line = view.state.doc.lineAt(from).number;
    view.dispatch({
      changes: { from: 0, to: 2, insert: LF + LF },
      selection: { anchor: from, head: to },
    });
    expect(view.state.sliceDoc(from, to)).toBe("CHARACTER");
    expect(view.state.doc.lineAt(from).number).toBe(line + 2);
    publish();
    agree(view, 0);
    view.dispatch({ selection: { anchor: to } });
    agree(view, 1);
  });

  it("never show the stale warning when the placeholder is typed over", () => {
    const { view, from, to, publish } = insertedDialogue();
    view.dispatch({
      changes: { from, to, insert: "IMANI" },
      selection: { anchor: from + 5 },
    });
    agree(view, 0);
    publish([]);
    agree(view, 0);
  });

  it("never show the stale warning when the insertion is undone", () => {
    const { view } = insertedDialogue();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(SOURCE);
    agree(view, 0);
  });
});
