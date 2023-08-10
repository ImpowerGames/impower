import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_logic-list";

export default class LogicList extends SEElement {
  static override async define(
    tag = "se-logic-list",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  protected override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  protected override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "logic-panel") {
        const panel = e.detail.value;
        Workspace.window.openedPanel("logic", panel);
        if (panel === "main") {
          Workspace.window.openedFileEditor("logic", panel, "logic/main.sd");
        }
      }
    }
  };
}
