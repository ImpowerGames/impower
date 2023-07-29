import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_logic-list";

const DEFAULT_DEPENDENCIES = {
  "sparkdown-script-editor": "sparkdown-script-editor",
};

export default class LogicList extends SEElement {
  static override async define(
    tag = "se-logic-list",
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  override transformHtml(html: string) {
    return SEElement.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  protected override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  protected override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "window/logic/panel") {
        const value = e.detail.value;
        this.emit(
          DidOpenPanelMessage.method,
          DidOpenPanelMessage.type.notification({
            pane: "logic",
            panel: value,
          })
        );
      }
    }
  };
}
