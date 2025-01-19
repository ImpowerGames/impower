import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_edit-toggle-button";

export default class EditToggleButton extends Component(spec) {
  override onConnected() {
    this.ref.doneButton.addEventListener(
      "pointerdown",
      this.handlePointerDownDoneButton
    );
    this.ref.menuDropdown.addEventListener(
      "changed",
      this.handleChangedMenuDropdown
    );
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected() {
    this.ref.doneButton.removeEventListener(
      "pointerdown",
      this.handlePointerDownDoneButton
    );
    this.ref.menuDropdown.removeEventListener(
      "changed",
      this.handleChangedMenuDropdown
    );
    window.removeEventListener("editor/focused", this.handleEditorFocused);
    window.removeEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.removeEventListener("input/focused", this.handleInputFocused);
    window.removeEventListener("input/unfocused", this.handleInputUnfocused);
  }

  handlePointerDownDoneButton = (e: Event) => {
    Workspace.window.unfocus();
  };

  handleChangedMenuDropdown = async (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "project-menu") {
        if (e.detail.value === "search") {
          const uri = Workspace.window.getOpenedDocumentUri();
          if (uri) {
            Workspace.window.search(uri);
          }
        }
      }
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
    window.requestAnimationFrame(() => {
      this.ref.doneButton.hidden = false;
      this.ref.menuDropdown.hidden = true;
    });
  }

  finishEditing() {
    this.ref.doneButton.hidden = true;
    this.ref.menuDropdown.hidden = false;
  }
}
