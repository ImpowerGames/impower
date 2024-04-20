import type Input from "../../../../../../packages/sparkle/src/components/input/input";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-item";

export default class FileItem extends Component(spec) {
  override onConnected() {
    document.addEventListener("click", this.handleDocumentClick);
    this.ref.button.addEventListener("click", this.handleButtonClick);
    this.addEventListener("changing", this.handleChanging);
    const nameInput = this.ref.nameInput as Input;
    nameInput?.addEventListener("focus", this.handleFocusNameInput);
    nameInput?.addEventListener("blur", this.handleBlurNameInput);
    nameInput?.addEventListener("keydown", this.handleKeyDownNameInput);
    if (nameInput) {
      nameInput.focus();
      const filename = this.filename;
      const [name] = filename.split(".");
      const selectionLength = name != null ? name.length : filename.length;
      nameInput.ref.input.setSelectionRange(0, selectionLength);
    }
  }

  override onDisconnected() {
    document.removeEventListener("click", this.handleDocumentClick);
    this.ref.button.removeEventListener("click", this.handleButtonClick);
    this.removeEventListener("changing", this.handleChanging);
    const nameInput = this.ref.nameInput as Input;
    nameInput?.removeEventListener("focus", this.handleFocusNameInput);
    nameInput?.removeEventListener("blur", this.handleBlurNameInput);
    nameInput?.removeEventListener("keydown", this.handleKeyDownNameInput);
  }

  handleFocusNameInput = async (e: Event) => {
    this.emit("input/focused");
  };

  handleBlurNameInput = async (e: Event) => {
    this.finishEditingName();
  };

  handleKeyDownNameInput = async (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      this.finishEditingName();
    }
  };

  handleDocumentClick = (e: MouseEvent) => {
    if (this.renaming) {
      const clickedOutside =
        typeof e.composedPath === "function" &&
        !e.composedPath().includes(this);
      if (clickedOutside) {
        this.finishEditingName();
      }
    }
  };

  override shouldAttributeTriggerUpdate() {
    return true;
  }

  handleButtonClick = (e: Event) => {
    if (!this.renaming) {
      e.stopPropagation();
      const filename = this.filename;
      if (filename) {
        Workspace.window.openedFileEditor(filename);
        const detail = { value: "logic-editor" };
        this.emit("changing", detail);
        this.emit("changed", detail);
      }
    }
  };

  handleChanging = async (e: Event) => {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (e instanceof CustomEvent) {
      if (e.detail.key === "file-options") {
        const filename = this.filename;
        if (filename) {
          if (e.detail.value === "delete") {
            this.deleteFile(projectId, filename);
          }
          if (e.detail.value === "rename") {
            this.renaming = true;
          }
        }
      }
    }
  };

  finishEditingName() {
    const nameInput = this.ref.nameInput as Input;
    const newFilename = nameInput.ref.input.value;
    const oldFilename = this.filename;
    if (newFilename != null && oldFilename !== newFilename) {
      this.renameFile(oldFilename, newFilename);
    }
    this.renaming = false;
    this.emit("input/unfocused");
  }

  async deleteFile(projectId: string | undefined, filename: string) {
    if (projectId) {
      const uri = Workspace.fs.getFileUri(projectId, filename);
      const deletedFiles = await Workspace.fs.deleteFiles({
        files: [{ uri }],
      });
      if (deletedFiles.some((d) => d.type === "script")) {
        await Workspace.window.recordScriptChange();
      } else {
        await Workspace.window.recordAssetChange();
      }
    }
  }

  async renameFile(oldFilename: string, newFilename: string) {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      this.filename = newFilename;
      const oldUri = Workspace.fs.getFileUri(projectId, oldFilename);
      const newUri = Workspace.fs.getFileUri(projectId, newFilename);
      const renamedFiles = await Workspace.fs.renameFiles({
        files: [{ oldUri, newUri }],
      });
      if (renamedFiles.some((d) => d.type === "script")) {
        await Workspace.window.recordScriptChange();
      } else {
        await Workspace.window.recordAssetChange();
      }
    }
  }
}
