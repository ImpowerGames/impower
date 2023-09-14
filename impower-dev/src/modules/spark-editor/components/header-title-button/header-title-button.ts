import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-title-button";

export default class HeaderTitleButton extends Component(spec) {
  get nameButtonEl() {
    return this.getElementById("name-button");
  }

  get nameInputEl() {
    const input = this.getElementById("name-input") as HTMLElement & {
      inputEl: HTMLInputElement;
    };
    return input?.inputEl;
  }

  override onConnected(): void {
    const nameInputEl = this.nameInputEl;
    if (nameInputEl) {
      nameInputEl.select();
      nameInputEl.addEventListener("keydown", this.handleKeyDownNameInput);
      nameInputEl.addEventListener("blur", this.handleBlurNameInput);
    }
    const nameButtonEl = this.nameButtonEl;
    if (nameButtonEl) {
      nameButtonEl.addEventListener("click", this.handleClickNameButton);
    }
  }

  override onDisconnected(): void {
    const nameInputEl = this.nameInputEl;
    if (nameInputEl) {
      nameInputEl.removeEventListener("keydown", this.handleKeyDownNameInput);
      nameInputEl.removeEventListener("blur", this.handleBlurNameInput);
    }
    const nameButtonEl = this.nameButtonEl;
    if (nameButtonEl) {
      nameButtonEl.removeEventListener("click", this.handleClickNameButton);
    }
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
