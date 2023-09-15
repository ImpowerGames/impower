import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-item";

export default class FileItem extends Component(spec) {
  override onConnected() {
    this.ref.button.addEventListener("click", this.handleButtonClick);
    this.addEventListener("changing", this.handleChanging);
  }

  override onDisconnected() {
    this.ref.button.removeEventListener("click", this.handleButtonClick);
    this.removeEventListener("changing", this.handleChanging);
  }

  handleButtonClick = (e: Event) => {
    e.stopPropagation();
    const filename = this.filename;
    if (filename) {
      Workspace.window.openedFileEditor(filename);
    }
  };

  handleChanging = (e: Event) => {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (e instanceof CustomEvent) {
      if (e.detail.key === "file-options") {
        const filename = this.filename;
        if (filename) {
          if (e.detail.value === "delete") {
            if (projectId) {
              const uri = Workspace.fs.getFileUri(projectId, filename);
              Workspace.fs.deleteFiles({
                files: [{ uri }],
              });
            }
          }
        }
      }
    }
  };
}
