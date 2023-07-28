import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage.js";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage.js";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import Workspace from "../../workspace/Workspace";
import component from "./_script-editor";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-script-editor": "sparkdown-script-editor",
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["file-path"]),
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
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformHtml(html: string) {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  /**
   * The file path to read from and write to.
   */
  get filePath(): string | null {
    return this.getStringAttribute(ScriptEditor.attributes.filePath);
  }
  set filePath(value) {
    this.setStringAttribute(ScriptEditor.attributes.filePath, value);
  }

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === ScriptEditor.attributes.filePath) {
      this.loadFile(newValue);
    }
  }

  protected override onConnected(): void {
    this.loadFile(this.filePath);
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

  async loadFile(filePath: string | null) {
    if (!filePath) {
      return;
    }
    const uri = Workspace.fs.getWorkspaceUri(filePath);
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
      })
    );
  }
}
