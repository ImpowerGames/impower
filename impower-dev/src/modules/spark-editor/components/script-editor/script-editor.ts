import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage.js";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage.js";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_script-editor";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["filename"]),
};

export default class ScriptEditor
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

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

  get filename(): string | null {
    return this.getStringAttribute(ScriptEditor.attributes.filename);
  }
  set filename(value) {
    this.setStringAttribute(ScriptEditor.attributes.filename, value);
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
    const filename = this.filename || "main.script";
    const editor = await Workspace.window.getActiveEditor(
      Workspace.project.id,
      filename
    );
    if (editor) {
      const uri = editor.uri;
      const visibleRange = editor.visibleRange;
      const existingText = await Workspace.fs.readTextDocument({
        textDocument: { uri },
      });
      const languageServerCapabilities =
        await Workspace.lsp.getServerCapabilities();
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
          languageServerCapabilities,
        })
      );
    }
  }
}
