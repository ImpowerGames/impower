import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
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
  }

  override onDisconnected() {
    window.removeEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
  }

  handleDidOpenTextDocument = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenTextDocumentMessage.type.isNotification(message)) {
        this.loadFile();
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
