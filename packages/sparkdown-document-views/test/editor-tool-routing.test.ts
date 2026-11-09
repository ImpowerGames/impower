import { runScopeHandlers, type EditorView } from "@codemirror/view";
import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

let view: EditorView;

afterEach(() => {
  view?.destroy();
  document.body.innerHTML = "";
});

const mount = (withTools: boolean) => {
  const tools = { find: vi.fn(), rename: vi.fn(), references: vi.fn() };
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  [view] = createEditorView(parent, {
    ...(withTools ? { tools } : {}),
    coarsePointer: false,
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) },
    serverInitializeParams: {},
    serverInitializeResult: {
      capabilities: { renameProvider: true, referencesProvider: true },
    },
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: {
      uri: "file:///main.sd",
      version: 0,
      text: "scene start\nend\n",
    },
    top: 0,
    bottom: 0,
  } as never);
  view.dispatch({ selection: { anchor: 8 } });
  return tools;
};

const press = (key: string, shiftKey = false) =>
  runScopeHandlers(view, new KeyboardEvent("keydown", { key, shiftKey }), "editor");

describe("the editor's own name-tool keys", () => {
  it("opens the host's Rename from F2", () => {
    const tools = mount(true);
    expect(press("F2")).toBe(true);
    expect(tools.rename).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector(".cm-lsp-rename-tooltip")).toBeNull();
  });

  it("opens the host's References from Shift+F12", () => {
    const tools = mount(true);
    expect(press("F12", true)).toBe(true);
    expect(tools.references).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor's own Rename where no host supplies one", () => {
    mount(false);
    expect(press("F2")).toBe(true);
    expect(document.querySelector(".cm-lsp-rename-tooltip")).not.toBeNull();
  });
});
