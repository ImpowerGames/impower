import { LoadGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/LoadGameMessage";
import { DidOpenFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenFileEditorMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-game";

export default class GamePreview extends SEElement {
  static override async define(
    tag = "se-preview-game",
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
      const { uri, selectedRange } = editor;
      const { programs } = await Workspace.fs.buildAll(uri);
      this.emit(
        LoadGameMessage.method,
        LoadGameMessage.type.request({
          programs,
          options: {
            entryProgram: Workspace.fs.getName(uri),
            entryLine: selectedRange?.start?.line ?? 0,
          },
        })
      );
    }
  }
}
