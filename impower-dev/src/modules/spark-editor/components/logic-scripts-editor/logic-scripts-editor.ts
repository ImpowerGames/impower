import { DidCloseFileEditorMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCloseFileEditorMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_logic-scripts-editor";

export default class LogicScriptsEditor extends SEElement {
  static override async define(
    tag = "se-logic-scripts-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  protected override onConnected(): void {
    this.addEventListener("changing", this.handleChanging);
  }

  protected override onDisconnected(): void {
    this.removeEventListener("changing", this.handleChanging);
  }

  getFilePath() {
    return Workspace.window.state?.logic?.panels?.scripts?.openFilePath || "";
  }

  handleChanging = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "close-file-editor") {
        this.emit(
          DidCloseFileEditorMessage.method,
          DidCloseFileEditorMessage.type.notification({
            pane: "logic",
            panel: "scripts",
          })
        );
      }
      if (e.detail.key === "file-options") {
        const filePath = this.getFilePath();
        if (filePath) {
          const uri = Workspace.fs.getWorkspaceUri(filePath);
          if (e.detail.value === "delete") {
            await Workspace.fs.deleteFiles({
              files: [{ uri }],
            });
            this.emit(
              DidCloseFileEditorMessage.method,
              DidCloseFileEditorMessage.type.notification({
                pane: "logic",
                panel: "scripts",
              })
            );
          }
        }
      }
    }
  };
}
