import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic-list";

export default class LogicList extends Component(spec) {
  override onConnected() {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "logic-panel") {
        const panel = e.detail.value;
        this.context.panel = panel;
        Workspace.window.openedPanel("logic", panel);
        if (panel === "main") {
          Workspace.window.openedFileEditor("main.sd");
        }
      }
    }
  };
}
