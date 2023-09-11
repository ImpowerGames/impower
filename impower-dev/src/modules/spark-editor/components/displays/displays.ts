import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_displays";

export default class Displays extends Component(spec) {
  override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "displays-panel") {
        const value = e.detail.value;
        Workspace.window.openedPanel("displays", value);
      }
    }
  };
}
