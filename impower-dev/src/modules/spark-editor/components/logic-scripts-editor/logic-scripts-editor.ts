import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic-scripts-editor";

export default class LogicScriptsEditor extends Component(spec) {
  override onConnected() {
    this.addEventListener("changing", this.handleChanging);
  }

  override onDisconnected() {
    this.removeEventListener("changing", this.handleChanging);
  }

  getFilename() {
    const store = this.stores.workspace.current;
    return store?.panes?.logic?.panels?.scripts?.activeEditor?.filename || "";
  }

  handleChanging = async (e: Event) => {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (e instanceof CustomEvent) {
      const filename = this.getFilename();
      if (e.detail.key === "close-file-editor") {
        Workspace.window.closedFileEditor(filename);
      }
      if (e.detail.key === "file-options") {
        if (filename) {
          if (e.detail.value === "delete") {
            if (projectId) {
              const uri = Workspace.fs.getFileUri(projectId, filename);
              await Workspace.fs.deleteFiles({
                files: [{ uri }],
              });
            }
            Workspace.window.closedFileEditor(filename);
          }
        }
      }
    }
  };
}
