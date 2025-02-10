import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-screenplay";

export default class PreviewScreenplay extends Component(spec) {
  override onConnected() {
    this.loadFile();
    window.addEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.addEventListener(
      DidWriteFilesMessage.method,
      this.handleDidWriteFiles
    );
    window.addEventListener(
      DidDeleteFilesMessage.method,
      this.handleDidDeleteFiles
    );
  }

  override onDisconnected() {
    window.removeEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.removeEventListener(
      DidWriteFilesMessage.method,
      this.handleDidWriteFiles
    );
    window.removeEventListener(
      DidDeleteFilesMessage.method,
      this.handleDidDeleteFiles
    );
  }

  protected handleDidOpenTextDocument = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenTextDocumentMessage.type.isNotification(message)) {
        this.loadFile();
      }
    }
  };

  protected handleDidWriteFiles = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidWriteFilesMessage.type.isNotification(message)) {
        const params = message.params;
        const remote = params.remote;
        const files = params.files;
        const editor = Workspace.window.getActiveEditorForPane("logic");
        if (remote && files.find((f) => f.uri === editor?.uri)) {
          this.loadFile();
        }
      }
    }
  };

  protected handleDidDeleteFiles = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidDeleteFilesMessage.type.isNotification(message)) {
        const params = message.params;
        const files = params.files;
        const editor = Workspace.window.getActiveEditorForPane("logic");
        if (files.find((f) => f.uri === editor?.uri)) {
          this.loadFile();
        }
      }
    }
  };

  override onContextChanged(
    oldContext: { textPulledAt: string },
    newContext: { textPulledAt: string }
  ) {
    if (oldContext.textPulledAt !== newContext.textPulledAt) {
      this.loadFile();
    }
  }

  async loadFile() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const editor = Workspace.window.getActiveEditorForPane("logic");
      if (editor) {
        const { uri, visibleRange, selectedRange } = editor;
        const files = await Workspace.fs.getFiles(projectId);
        const file = files[uri];
        const existingText = file?.text || "";
        this.emit(
          LoadPreviewMessage.method,
          LoadPreviewMessage.type.request({
            type: "screenplay",
            textDocument: {
              uri,
              languageId: "sparkdown",
              version: 0,
              text: existingText,
            },
            visibleRange,
            selectedRange,
          })
        );
      }
    }
  }
}
