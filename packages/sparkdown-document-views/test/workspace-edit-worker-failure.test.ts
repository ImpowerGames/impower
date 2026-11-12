import type { EditorView } from "@codemirror/view";
import { LSPPlugin, type LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const MAIN = "file:///p/main.sd";

const EDIT = {
  documentChanges: [
    {
      textDocument: { uri: MAIN, version: 0 },
      edits: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
          newText: "new",
        },
      ],
    },
    { kind: "rename" as const, oldUri: "file:///p/a.png", newUri: "file:///p/b.png" },
  ],
};

const mountEditor = (result: { applied: boolean; failureReason?: string }) => {
  const applyWorkspaceEdit = vi.fn(async (_params: unknown) => result);
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const [view] = createEditorView(parent, {
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) } as never,
    serverInitializeParams: {} as never,
    serverInitializeResult: { capabilities: {} } as never,
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit,
      }),
    textDocument: { uri: MAIN, version: 0, text: "old\n" },
    top: 0,
    bottom: 0,
  } as never) as unknown as [EditorView];
  const workspace = LSPPlugin.get(view)!.client.workspace as SparkdownCodemirrorWorkspace;
  return { view, workspace, applyWorkspaceEdit };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("a language-server workspace edit (I-2148)", () => {
  it("does not change the open script when the worker rolls back the files", async () => {
    const { view, workspace } = mountEditor({ applied: false, failureReason: "rolled back" });
    await workspace.updateFiles({ edit: EDIT }, "rename");
    expect(view.state.doc.toString()).toBe("old\n");
    view.destroy();
  });

  it("hands the whole edit, open script included, to the apply seam with the rename-symbol kind", async () => {
    const { view, workspace, applyWorkspaceEdit } = mountEditor({ applied: true });
    await workspace.updateFiles({ label: "Rename", edit: EDIT }, "rename");
    expect(applyWorkspaceEdit).toHaveBeenCalledTimes(1);
    expect(applyWorkspaceEdit.mock.calls[0]![0]).toEqual({
      label: "Rename",
      edit: EDIT,
      metadata: { action: { kind: "rename-symbol", targets: [] } },
    });
    expect(view.state.doc.toString()).toBe("old\n");
    view.destroy();
  });
});
