import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_edit-toggle-button";

export default class EditToggleButton extends Component(spec) {
  override onConnected() {
    this.ref.button.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected() {
    this.ref.button.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  handlePointerDown = (e: Event) => {
    if (this.ref.button.active) {
      Workspace.window.unfocus();
    } else {
      // clicked options menu
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
    this.ref.button.active = true;
  }

  async finishEditing() {
    this.ref.button.active = false;
  }
}
