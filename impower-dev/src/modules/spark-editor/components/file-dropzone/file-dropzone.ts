import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DragFilesEnterMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesEnterMessage";
import { DragFilesLeaveMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesLeaveMessage";
import { DragFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DragFilesOverMessage";
import { DropFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DropFilesMessage";
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
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
  }

  override onDisconnected() {
    window.removeEventListener("dragenter", this.handleDragEnter);
    window.removeEventListener("dragleave", this.handleDragLeave);
    window.removeEventListener("dragover", this.handleDragOver);
    window.removeEventListener("drop", this.handleDrop);
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
  }

  handleDragEnter = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.dragEnter();
  };

  handleDragLeave = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.dragLeave();
  };

  handleDragOver = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver();
  };

  handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []);
    const fileArray = await Promise.all(
      files.map(async (f) => {
        const name = f.name;
        const buffer = await f.arrayBuffer();
        return {
          name,
          buffer,
        };
      })
    );
    this.drop(fileArray);
  };

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DragFilesEnterMessage.type.is(message)) {
        this.dragEnter();
      }
      if (DragFilesLeaveMessage.type.is(message)) {
        this.dragLeave();
      }
      if (DragFilesOverMessage.type.is(message)) {
        this.dragOver();
      }
      if (DropFilesMessage.type.is(message)) {
        this.drop(message.params.files);
      }
    }
  };

  dragEnter() {
    this.refs.dragover.hidden = false;
  }

  dragLeave() {
    this.refs.dragover.hidden = true;
  }

  dragOver() {
    this.refs.dragover.hidden = false;
  }

  async drop(fileArray: { name: string; buffer: ArrayBuffer }[]) {
    this.refs.dragover.hidden = true;
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      if (fileArray) {
        if (fileArray.length === 1 && fileArray[0]?.name.endsWith(".zip")) {
          const file = fileArray[0];
          await Workspace.window.importLocalProject(file.name, file.buffer);
        } else {
          const files = fileArray.map((file) => {
            const validFileName = getValidFileName(file.name);
            const data = file.buffer;
            return {
              uri: Workspace.fs.getFileUri(projectId, validFileName),
              data,
            };
          });
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
