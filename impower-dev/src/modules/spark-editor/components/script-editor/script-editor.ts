import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage.js";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { DidChangeProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeProjectStateMessage";
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

  protected _uri?: string;

  protected _version?: number;

  protected override onConnected() {
    this.loadFile();
    window.addEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.addEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
    );
    window.addEventListener(
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
  }

  protected override onDisconnected() {
    window.removeEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.removeEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
    );
    window.removeEventListener(
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
  }

  protected handleDidChangeTextDocument = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeTextDocumentMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        if (this._uri != null && this._uri === textDocument.uri) {
          this._version = textDocument.version;
        }
      }
    }
  };

  protected handleDidSaveTextDocument = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidSaveTextDocumentMessage.type.isNotification(message)) {
        const params = message.params;
        const textDocument = params.textDocument;
        const text = params.text;
        if (
          this._uri != null &&
          this._uri === textDocument.uri &&
          this._version != null
        ) {
          if (text != null) {
            await Workspace.fs.writeTextDocument({
              textDocument: {
                uri: this._uri,
                version: this._version,
                text,
              },
            });
            await Workspace.window.updateModificationTime();
          }
        }
      }
    }
  };

  protected handleDidChangeProjectState = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeProjectStateMessage.type.isNotification(message)) {
        const params = message.params;
        const { changed } = params;
        if (changed.includes("syncState")) {
          // TODO: make editor readonly while syncing
        }
        if (changed.includes("syncedAt")) {
          await this.loadFile();
        }
      }
    }
  };

  async loadFile() {
    const filename = this.filename || "main.script";
    const editor = await Workspace.window.getActiveEditor(filename);
    if (editor) {
      const uri = editor.uri;
      const visibleRange = editor.visibleRange;
      const selectedRange = editor.selectedRange;
      const files = await Workspace.fs.getFiles();
      const file = files[uri];
      const text = file?.text || "";
      const version = file?.version || 0;
      const languageServerCapabilities =
        await Workspace.lsp.getServerCapabilities();
      this._uri = uri;
      this._version = version;
      this.emit(
        LoadEditorMessage.method,
        LoadEditorMessage.type.request({
          textDocument: {
            uri,
            languageId: "sparkdown",
            version,
            text,
          },
          visibleRange,
          selectedRange,
          languageServerCapabilities,
        })
      );
    }
  }
}
