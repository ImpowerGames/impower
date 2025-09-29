import Input from "../../../../../../packages/sparkle/src/components/input/input";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic-scripts-editor";

export default class LogicScriptsEditor extends Component(spec) {
  override onConnected() {
    this.addEventListener("changing", this.handleChanging);
    this.refs.nameInput?.addEventListener("focus", this.handleFocusNameInput);
    this.refs.nameInput?.addEventListener("blur", this.handleBlurNameInput);
    this.refs.nameInput?.addEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
  }

  override onDisconnected() {
    this.removeEventListener("changing", this.handleChanging);
    this.refs.nameInput?.removeEventListener(
      "focus",
      this.handleFocusNameInput
    );
    this.refs.nameInput?.removeEventListener("blur", this.handleBlurNameInput);
    this.refs.nameInput?.removeEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
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
              await Workspace.window.recordScriptChange();
            }
            Workspace.window.closedFileEditor(filename);
          }
        }
      }
    }
  };

  handleFocusNameInput = async (e: Event) => {
    const target = e.target as Input;
    target.select();
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

  finishEditingName() {
    const nameInput = this.refs.nameInput as unknown as Input;
    nameInput.unselect();
    nameInput.blur();
    const newName = nameInput.refs.input.value;
    const oldFilename = this.getFilename();
    const [oldName, oldExt] = oldFilename.split(".");
    if (newName != null && oldName !== newName) {
      const newFilename = newName + "." + oldExt;
      this.renameFile(oldFilename, newFilename);
    }
    this.emit("input/unfocused");
  }

  async renameFile(oldFilename: string, newFilename: string) {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
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
      Workspace.window.openedFileEditor(newFilename);
    }
  }
}
