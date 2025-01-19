import type Input from "../../../../../../packages/sparkle/src/components/input/input";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-title-button";

export default class HeaderTitleButton extends Component(spec) {
  override onConnected() {
    this.ref.nameButton?.addEventListener("click", this.handleClickNameButton);
    const nameInput = this.ref.nameInput as Input;
    nameInput?.addEventListener("focus", this.handleFocusNameInput);
    nameInput?.addEventListener("blur", this.handleBlurNameInput);
    nameInput?.addEventListener("keydown", this.handleKeyDownNameInput);

    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }

  override onDisconnected() {
    this.ref.nameButton?.removeEventListener(
      "click",
      this.handleClickNameButton
    );
    const nameInput = this.ref.nameInput as Input;
    nameInput?.removeEventListener("focus", this.handleFocusNameInput);
    nameInput?.removeEventListener("blur", this.handleBlurNameInput);
    nameInput?.removeEventListener("keydown", this.handleKeyDownNameInput);
  }

  handleClickNameButton = () => {
    Workspace.window.startedEditingProjectName();
  };

  handleFocusNameInput = async (e: Event) => {
    this.emit("input/focused");
  };

  handleBlurNameInput = async (e: Event) => {
    const target = e.target as Input;
    const name = target.ref.input.value;
    if (name != null) {
      await Workspace.window.finishedEditingProjectName(name);
    }
    this.emit("input/unfocused");
  };

  handleKeyDownNameInput = async (e: KeyboardEvent) => {
    const target = e.target as Input;
    const name = target.ref.input.value;
    if (e.key === "Enter") {
      if (name != null) {
        await Workspace.window.finishedEditingProjectName(name);
      }
      this.emit("input/unfocused");
    }
  };
}
