import type { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { SparkdownCodemirrorWorkspace } from "../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace";
import createEditorView from "../src/modules/script-editor/utils/createEditorView";
import { scriptLabelText } from "../src/modules/script-editor/utils/extensions/scriptLabel";
import { createScriptSampleState } from "../src/modules/script-sample/SparkdownScriptSample";
import { ALL_OFF_APPEARANCE } from "./fixtures/scriptAppearance";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const openScriptEditor = (uri: string) => {
  const parent = document.body.appendChild(document.createElement("div"));
  const worker = Object.assign(new EventTarget(), {
    postMessage: () => {},
  }) as unknown as Worker;
  const [view] = createEditorView(parent, {
    appearance: ALL_OFF_APPEARANCE,
    serverWorker: worker,
    serverConnection: { onRequest: () => ({ dispose: () => {} }) } as never,
    serverInitializeParams: {} as never,
    serverInitializeResult: { capabilities: {} } as never,
    serverWorkspace: (client: LSPClient) =>
      new SparkdownCodemirrorWorkspace(client, {
        showDocument: async () => {},
        applyWorkspaceEdit: async () => ({ applied: false }),
      } as never),
    textDocument: { uri, version: 0, text: "Hello\n" },
  } as never);
  return view;
};

describe("script editor accessible name", () => {
  let view: { destroy: () => void } | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
    document.body.replaceChildren();
  });

  it("names the script editor's text box after the script it holds", () => {
    const editor = openScriptEditor("file:///project/scripts/Chapter%201.sd");
    view = editor;
    expect(editor.contentDOM.getAttribute("role")).toBe("textbox");
    expect(editor.contentDOM.getAttribute("aria-label")).toBe("Chapter 1");
  });

  it("names the Settings script sample's text box with the sample's label", () => {
    view = new EditorView({
      state: createScriptSampleState(
        "Hello",
        ALL_OFF_APPEARANCE,
        undefined,
        "Read-only syntax sample",
      ),
      parent: document.body,
    });
    expect(
      (view as EditorView).contentDOM.getAttribute("aria-label"),
    ).toBe("Read-only syntax sample");
  });

  it("reads the name from the last path segment without its extension", () => {
    expect(scriptLabelText("file:///p/main.sd")).toBe("main");
    expect(scriptLabelText("file:///p/scripts/main.sd")).toBe("main");
    expect(scriptLabelText("file:///p/a.b/intro.sd?x=1")).toBe("intro");
    expect(scriptLabelText("file:///p/%E0%A4%A.sd")).toBe("%E0%A4%A");
    expect(scriptLabelText("file:///p/")).toBe("Script");
  });
});
