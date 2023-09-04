import { ChangedHeaderInfoMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedHeaderInfoMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_header-title-button";

export default class HeaderTitleButton extends SEElement {
  static override async define(
    tag = "se-header-title-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  get nameButtonEl() {
    return this.getElementById("name-button");
  }

  get nameInputEl() {
    const input = this.getElementById("name-input") as HTMLElement & {
      inputEl: HTMLInputElement;
    };
    return input?.inputEl;
  }

  protected override onConnected(): void {
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
    window.addEventListener(
      ChangedHeaderInfoMessage.method,
      this.handleLoadProjectName
    );
  }

  protected override onDisconnected(): void {
    const nameInputEl = this.nameInputEl;
    if (nameInputEl) {
      nameInputEl.removeEventListener("keydown", this.handleKeyDownNameInput);
      nameInputEl.removeEventListener("blur", this.handleBlurNameInput);
    }
    const nameButtonEl = this.nameButtonEl;
    if (nameButtonEl) {
      nameButtonEl.removeEventListener("click", this.handleClickNameButton);
    }
    window.removeEventListener(
      ChangedHeaderInfoMessage.method,
      this.handleLoadProjectName
    );
  }

  handleLoadProjectName = () => {
    this.render();
  };

  handleClickNameButton = () => {
    Workspace.window.startEditingProjectName();
    this.render();
  };

  handleKeyDownNameInput = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLInputElement;
      const name = target.value;
      Workspace.window.finishEditingProjectName(Workspace.project.id, name);
      this.render();
    }
  };

  handleBlurNameInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const name = target.value;
    Workspace.window.finishEditingProjectName(Workspace.project.id, name);
    this.render();
  };
}
