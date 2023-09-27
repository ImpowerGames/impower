import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-navigation";

export default class HeaderNavigation extends Component(spec) {
  override onConnected() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected() {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      await Workspace.window.syncProject();
    }
  };

  handleEditorFocused = () => {
    this.startEditing();
  };

  handleEditorUnfocused = () => {
    this.finishEditing();
  };

  handleInputFocused = () => {
    this.startEditing();
  };

  handleInputUnfocused = () => {
    this.finishEditing();
  };

  startEditing() {
    this.ref.previewButton.hidden = true;
    this.ref.doneButton.hidden = false;
  }

  async finishEditing() {
    if (this.ref.previewButton.hidden) {
      this.ref.previewButton.hidden = false;
    }
    if (!this.ref.doneButton.hidden) {
      this.ref.doneButton.hidden = true;
    }
  }
}
