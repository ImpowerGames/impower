import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage.js";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage.js";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_script-editor";

export default class ScriptEditor extends SEElement {
  static override async define(
    tag = "se-script-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  protected override onConnected(): void {
    this.loadFile();
    window.addEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
    );
  }

  protected handleDidSaveTextDocument = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidSaveTextDocumentMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const text = params.text;
        if (text != null) {
          Workspace.fs.writeTextDocument({ textDocument, text });
        }
      }
    }
  };

  async loadFile() {
    const editor = Workspace.window.getActiveEditor("logic");
    if (editor) {
      const { uri, visibleRange } = editor;
      const existingText = await Workspace.fs.readTextDocument({
        textDocument: { uri },
      });
      await Workspace.lsp.starting;
      this.emit(
        LoadEditorMessage.method,
        LoadEditorMessage.type.request({
          textDocument: {
            uri,
            languageId: "sparkdown",
            version: 0,
            text: existingText,
          },
          visibleRange,
        })
      );
    }
  }
}
