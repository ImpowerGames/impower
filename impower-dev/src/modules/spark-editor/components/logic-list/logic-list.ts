import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_logic-list";

export default class LogicList extends Component(spec) {
  override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "logic-panel") {
        const panel = e.detail.value;
        Workspace.window.openedPanel("logic", panel);
        if (panel === "main") {
          Workspace.window.openedFileEditor("main.script");
        }
      }
    }
  };
}
