import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-item";

export default class FileItem extends Component(spec) {
  get buttonEl() {
    return this.getElementByTag("s-button");
  }

  get dropdownEl() {
    return this.getElementById("dropdown");
  }

  override onConnected(): void {
    this.buttonEl?.addEventListener("click", this.handleButtonClick);
    this.addEventListener("changing", this.handleChanging);
  }

  override onDisconnected(): void {
    this.buttonEl?.removeEventListener("click", this.handleButtonClick);
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
    const store = this.context.get();
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
