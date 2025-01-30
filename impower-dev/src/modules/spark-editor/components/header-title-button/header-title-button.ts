import type Input from "../../../../../../packages/sparkle/src/components/input/input";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-title-button";

export default class HeaderTitleButton extends Component(spec) {
  override onConnected() {
    this.ref.nameInput?.addEventListener("focus", this.handleFocusNameInput);
    this.ref.nameInput?.addEventListener("blur", this.handleBlurNameInput);
    this.ref.nameInput?.addEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
  }

  override onDisconnected() {
    this.ref.nameInput?.removeEventListener("focus", this.handleFocusNameInput);
    this.ref.nameInput?.removeEventListener("blur", this.handleBlurNameInput);
    this.ref.nameInput?.removeEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
  }

  handleFocusNameInput = async (e: Event) => {
    const nameInput = this.ref.nameInput as Input;
    nameInput.select();
    Workspace.window.startedEditingProjectName();
    this.emit("input/focused");
  };

  handleBlurNameInput = async (e: Event) => {
    const target = e.target as Input;
    const name = target.ref.input.value;
    this.emit("input/unfocused");
    if (name != null) {
      await Workspace.window.finishedEditingProjectName(name);
    }
  };

  handleKeyDownNameInput = async (e: KeyboardEvent) => {
    const target = e.target as Input;
    const name = target.ref.input.value;
    if (e.key === "Enter") {
      this.emit("input/unfocused");
      if (name != null) {
        await Workspace.window.finishedEditingProjectName(name);
      }
    }
  };
}
