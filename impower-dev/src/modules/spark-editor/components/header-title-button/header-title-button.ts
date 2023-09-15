import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-title-button";

export default class HeaderTitleButton extends Component(spec) {
  override onConnected() {
    this.ref.nameInput?.addEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
    this.ref.nameInput?.addEventListener("blur", this.handleBlurNameInput);
    this.ref.nameButton?.addEventListener("click", this.handleClickNameButton);
  }

  override onDisconnected() {
    this.ref.nameInput?.removeEventListener(
      "keydown",
      this.handleKeyDownNameInput
    );
    this.ref.nameInput?.removeEventListener("blur", this.handleBlurNameInput);
    this.ref.nameButton?.removeEventListener(
      "click",
      this.handleClickNameButton
    );
  }

  handleClickNameButton = () => {
    Workspace.window.startedEditingProjectName();
    this.emit("input/focused");
  };

  handleKeyDownNameInput = async (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLInputElement;
      const name = target.value;
      this.emit("input/unfocused");
      await Workspace.window.finishedEditingProjectName(name);
    }
  };

  handleBlurNameInput = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const name = target.value;
    this.emit("input/unfocused");
    await Workspace.window.finishedEditingProjectName(name);
  };
}
