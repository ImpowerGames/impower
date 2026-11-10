import type { EditorView } from "@codemirror/view";
import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";
import { settleParse } from "./helpers/parseSettle";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const liveEditor = (onIdle: () => void) => {
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
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri: "file:///main.sd", version: 0, text: "scene start\n" },
    top: 0,
    bottom: 0,
    onIdle,
  } as never) as unknown as [EditorView];
  return view;
};

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("script editor destroy", () => {
  it("does not call onIdle after the view is destroyed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onIdle = vi.fn();
    const view = liveEditor(onIdle);
    settleParse(view);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "x" } });
    view.destroy();
    vi.advanceTimersByTime(1000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("calls onIdle once the view settles while alive", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onIdle = vi.fn();
    const view = liveEditor(onIdle);
    settleParse(view);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "x" } });
    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalled();
    view.destroy();
  });
});
