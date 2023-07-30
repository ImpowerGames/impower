import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_game-preview";

const DEFAULT_DEPENDENCIES = {
  "spark-game-preview": "spark-game-preview",
};

export default class GamePreview extends SEElement {
  static override async define(
    tag = "se-game-preview",
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
          type: "game",
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
