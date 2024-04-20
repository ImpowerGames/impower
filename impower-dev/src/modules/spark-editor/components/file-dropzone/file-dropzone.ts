import { Component } from "../../../../../../packages/spec-component/src/component";
import getValidFileName from "../../utils/getValidFileName";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-dropzone";

export default class FileDropzone extends Component(spec) {
  override onConnected() {
    window.addEventListener("dragenter", this.handleDragEnter);
    window.addEventListener("dragleave", this.handleDragLeave);
    window.addEventListener("dragover", this.handleDragOver);
    window.addEventListener("drop", this.handleDrop);
  }

  override onDisconnected() {
    window.removeEventListener("dragenter", this.handleDragEnter);
    window.removeEventListener("dragleave", this.handleDragLeave);
    window.removeEventListener("dragover", this.handleDragOver);
    window.removeEventListener("drop", this.handleDrop);
  }

  handleDragEnter = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.ref.dragover.hidden = false;
  };

  handleDragLeave = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.ref.dragover.hidden = true;
  };

  handleDragOver = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.ref.dragover.hidden = false;
  };

  handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.ref.dragover.hidden = true;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      this.upload(files);
    }
  };

  async upload(fileArray: File[]) {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      if (fileArray) {
        if (fileArray.length === 1 && fileArray[0]?.name.endsWith(".zip")) {
          const file = fileArray[0];
          const fileName = file.name;
          const fileBuffer = await file.arrayBuffer();
          await Workspace.window.importLocalProject(fileName, fileBuffer);
        } else {
          const files = await Promise.all(
            fileArray.map(async (file) => {
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
          await Workspace.window.recordAssetChange();
        }
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-file-dropzone": FileDropzone;
  }
}
