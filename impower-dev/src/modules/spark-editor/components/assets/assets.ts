import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_assets";

export default class Assets extends Component(spec) {
  override onConnected() {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "assets-panel") {
        const panel = e.detail.value;
        this.context.panel = panel;
        Workspace.window.openedPanel("assets", panel);
      }
    }
  };
}
