import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage.js";
import { DidChangeTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage";
import { DidSaveTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_script-editor";

export default class ScriptEditor extends Component(spec) {
  protected _uri?: string;

  protected _version?: number;

  override onConnected() {
    this.loadFile();
    window.addEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.addEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
    );
  }

  override onDisconnected() {
    window.removeEventListener(
      DidChangeTextDocumentMessage.method,
      this.handleDidChangeTextDocument
    );
    window.removeEventListener(
      DidSaveTextDocumentMessage.method,
      this.handleDidSaveTextDocument
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
            await Workspace.window.requireTextSync();
          }
        }
      }
    }
  };

  override onContextChanged(
    oldContext: { pulledAt: string },
    newContext: { pulledAt: string }
  ) {
    if (oldContext.pulledAt !== newContext.pulledAt) {
      this.render();
    }
  }

  async loadFile() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const filename = this.filename || "main.script";
      const editor = await Workspace.window.getActiveEditor(filename);
      if (editor) {
        const uri = editor.uri;
        const visibleRange = editor.visibleRange;
        const selectedRange = editor.selectedRange;
        const files = await Workspace.fs.getFiles(projectId);
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

  override onInit() {
    this.setup();
  }

  override onStoreUpdate() {
    this.setup();
  }

  setup() {
    const store = this.stores.workspace.current;
    const syncState = store?.project?.syncState;
    if (
      syncState === "syncing" ||
      syncState === "loading" ||
      syncState === "importing" ||
      syncState === "exporting"
    ) {
      this.ref.sparkdownScriptEditor.setAttribute("readonly", "");
    } else {
      this.ref.sparkdownScriptEditor.removeAttribute("readonly");
    }
  }
}
