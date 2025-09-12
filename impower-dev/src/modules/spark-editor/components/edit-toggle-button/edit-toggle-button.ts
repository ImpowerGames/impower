import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_edit-toggle-button";

export default class EditToggleButton extends Component(spec) {
  override onConnected() {
    this.refs.doneButton.addEventListener(
      "pointerdown",
      this.handlePointerDownDoneButton
    );
    this.refs.menuDropdown.addEventListener(
      "changed",
      this.handleChangedMenuDropdown
    );
    window.addEventListener("editor/focused", this.handleEditorFocused);
    window.addEventListener("editor/unfocused", this.handleEditorUnfocused);
    window.addEventListener("input/focused", this.handleInputFocused);
    window.addEventListener("input/unfocused", this.handleInputUnfocused);
  }

  override onDisconnected() {
    this.refs.doneButton.removeEventListener(
      "pointerdown",
      this.handlePointerDownDoneButton
    );
    this.refs.menuDropdown.removeEventListener(
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
    window.setTimeout(() => {
      this.refs.doneButton.hidden = false;
      this.refs.menuDropdown.hidden = true;
    }, 100);
  }

  finishEditing() {
    this.refs.doneButton.hidden = true;
    this.refs.menuDropdown.hidden = false;
  }
}
