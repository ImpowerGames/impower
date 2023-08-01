import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage.js";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_screenplay-preview";

export default class ScreenplayPreview extends SEElement {
  static override async define(
    tag = "se-screenplay-preview",
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
      DidOpenFileEditorMessage.method,
      this.handleDidOpenFileEditor
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidOpenFileEditorMessage.method,
      this.handleDidOpenFileEditor
    );
  }

  handleDidOpenFileEditor = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidOpenFileEditorMessage.type.isNotification(message)) {
        this.loadFile();
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
        })
      );
    }
  }
}
