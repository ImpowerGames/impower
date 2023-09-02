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

  getFilename() {
    return (
      Workspace.window.state?.panes?.logic?.panels?.scripts?.activeEditor
        ?.filename || ""
    );
  }

  handleChanging = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const filename = this.getFilename();
      if (e.detail.key === "close-file-editor") {
        Workspace.window.closedFileEditor(filename);
      }
      if (e.detail.key === "file-options") {
        if (filename) {
          const uri = Workspace.fs.getFileUri(Workspace.project.id, filename);
          if (e.detail.value === "delete") {
            await Workspace.fs.deleteFiles({
              files: [{ uri }],
            });
            Workspace.window.closedFileEditor(filename);
          }
        }
      }
    }
  };
}
