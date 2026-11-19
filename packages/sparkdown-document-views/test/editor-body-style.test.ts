import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, expect, it } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

let view: { destroy: () => void } | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
  document.body.removeAttribute("style");
});

it("creating a script editor leaves the page body's style untouched, even when given the retired top and bottom offsets", () => {
  document.body.removeAttribute("style");
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  [view] = createEditorView(parent, {
    appearance: ALL_ON_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) } as never,
    serverInitializeParams: {} as never,
    serverInitializeResult: { capabilities: {} } as never,
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri: "file:///main.sd", version: 0, text: "scene start\n" },
    top: 12,
    bottom: 34,
  } as never);

  expect(document.body.style.getPropertyValue("--cm-top-offset")).toBe("");
  expect(document.body.style.getPropertyValue("--cm-bottom-offset")).toBe("");
  expect(document.body.getAttribute("style") ?? "").toBe("");
});
