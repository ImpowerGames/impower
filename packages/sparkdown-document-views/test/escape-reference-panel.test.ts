import { runScopeHandlers, type EditorView } from "@codemirror/view";
import {
  isReferencePanelOpen,
  type LSPClient,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
Element.prototype.scrollIntoView ??= () => {};

const URI = "file:///main.sd";

let view: EditorView;

afterEach(() => {
  view?.destroy();
  document.body.innerHTML = "";
});

const mount = () => {
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = new EventTarget() as EventTarget & {
    postMessage: (message: { id?: number; method?: string }) => void;
  };
  worker.postMessage = (message) => {
    if (message.method !== "textDocument/references") return;
    const range = (character: number) => ({
      start: { line: 0, character },
      end: { line: 0, character: character + 5 },
    });
    queueMicrotask(() =>
      worker.dispatchEvent(
        new MessageEvent("message", {
          data: {
            jsonrpc: "2.0",
            id: message.id,
            result: [
              { uri: URI, range: range(6) },
              { uri: URI, range: range(12) },
            ],
          },
        }),
      ),
    );
  };
  [view] = createEditorView(parent, {
    coarsePointer: false,
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) },
    serverInitializeParams: {},
    serverInitializeResult: { capabilities: { referencesProvider: true } },
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri: URI, version: 0, text: "scene start start\n" },
    top: 0,
    bottom: 0,
  } as never);
  view.dispatch({ selection: { anchor: 8 } });
};

const press = (key: string, shiftKey = false) =>
  runScopeHandlers(
    view,
    new KeyboardEvent("keydown", { key, shiftKey }),
    "editor",
  );

const openReferences = async () => {
  press("F12", true);
  await vi.waitFor(() => expect(isReferencePanelOpen(view.state)).toBe(true));
};

describe("Escape with the references panel open", () => {
  it("closes the references panel from the script", async () => {
    mount();
    await openReferences();
    expect(press("Escape")).toBe(true);
    expect(isReferencePanelOpen(view.state)).toBe(false);
    expect(view.dom.querySelector(".cm-lsp-reference-panel")).toBeNull();
  });
});
