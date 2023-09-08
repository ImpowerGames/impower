import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { DidOpenTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidOpenTextDocumentMessage";
import { DidChangeProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeProjectStateMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-screenplay";

export default class PreviewScreenplay extends SEElement {
  static override async define(
    tag = "se-preview-screenplay",
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
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.addEventListener(
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidOpenTextDocumentMessage.method,
      this.handleDidOpenTextDocument
    );
    window.removeEventListener(
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
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

  protected handleDidChangeProjectState = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeProjectStateMessage.type.isNotification(message)) {
        const params = message.params;
        const { changed } = params;
        if (changed.includes("syncedAt")) {
          await this.loadFile();
        }
      }
    }
  };

  async loadFile() {
    const editor = await Workspace.window.getOpenEditor("logic");
    if (editor) {
      const { uri, visibleRange, selectedRange } = editor;
      const files = await Workspace.fs.getFiles();
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
