import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_graphics";

export default class Graphics extends Component(spec) {
  override onConnected() {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "graphics-panel") {
        const value = e.detail.value;
        Workspace.window.openedPanel("graphics", value);
      }
    }
  };
}
