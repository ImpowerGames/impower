import { Component } from "../../../../../../packages/spec-component/src/component";
import getValidFileName from "../../utils/getValidFileName";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import spec from "./_file-upload-button";

export default class FileAddButton extends Component(spec) {
  get buttonEl() {
    return this.getElementByTag("s-button");
  }

  override onConnected(): void {
    this.buttonEl?.addEventListener("change", this.handleInputChange);
  }

  override onDisconnected(): void {
    this.buttonEl?.removeEventListener("change", this.handleInputChange);
  }

  handleInputChange = async (e: Event) => {
    const event = e as Event & {
      target: HTMLInputElement & EventTarget;
    };
    const fileList = event.target.files;
    if (fileList) {
      this.upload(fileList);
    }
  };

  async upload(fileList: FileList) {
    const projectId = WorkspaceCache.get().project.id;
    if (projectId) {
      if (fileList) {
        const files = await Promise.all(
          Array.from(fileList).map(async (file) => {
            const validFileName = getValidFileName(file.name);
            const data = await file.arrayBuffer();
            return {
              uri: Workspace.fs.getFileUri(projectId, validFileName),
              data,
            };
          })
        );
        await Workspace.fs.createFiles({
          files,
        });
      }
    }
  }
}
