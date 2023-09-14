import { Component } from "../../../../../../packages/spec-component/src/component";
import getUniqueFileName from "../../utils/getUniqueFileName";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-add-button";

export default class FileAddButton extends Component(spec) {
  get buttonEl() {
    return this.getElementById("button");
  }

  override onConnected(): void {
    this.addEventListener("click", this.handleClick);
  }

  override onDisconnected(): void {
    this.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const store = this.context.get();
    const projectId = store?.project?.id;
    if (projectId) {
      const files = await Workspace.fs.getFiles();
      const fileUris = Object.keys(files);
      const filenames = fileUris.map((uri) => Workspace.fs.getFilename(uri));
      const filename = this.filename;
      if (filename) {
        const uniqueFileName = getUniqueFileName(filenames, filename);
        await Workspace.fs.createFiles({
          files: [
            {
              uri: Workspace.fs.getFileUri(projectId, uniqueFileName),
              data: new ArrayBuffer(0),
            },
          ],
        });
      }
    }
  };

  override onUpdate(): void {
    const store = this.context.get();
    const syncState = store?.project?.syncState;
    if (
      syncState === "syncing" ||
      syncState === "loading" ||
      syncState === "importing" ||
      syncState === "exporting"
    ) {
      this.buttonEl?.setAttribute("disabled", "");
    } else {
      this.buttonEl?.removeAttribute("disabled");
    }
  }
}
