import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic";

export default class Logic extends Component(spec) {
  override onConnected() {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "logic-view") {
        const value = e.detail.value;
        Workspace.window.openedView("logic", value);
      }
    }
  };
}
