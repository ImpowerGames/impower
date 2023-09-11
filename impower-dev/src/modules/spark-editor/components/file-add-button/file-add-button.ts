import { Component } from "../../../../../../packages/spec-component/src/component";
import getUniqueFileName from "../../utils/getUniqueFileName";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import spec from "./_file-add-button";

export default class FileAddButton extends Component(spec) {
  override onConnected(): void {
    this.addEventListener("click", this.handleClick);
  }

  override onDisconnected(): void {
    this.removeEventListener("click", this.handleClick);
  }

  handleClick = async (e: MouseEvent) => {
    const projectId = WorkspaceCache.get().project.id;
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
}
