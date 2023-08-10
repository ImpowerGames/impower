import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_logic";

export default class Logic extends SEElement {
  static override async define(
    tag = "se-logic",
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
      if (e.detail.key === "logic-view") {
        const value = e.detail.value;
        this.emit(
          DidOpenViewMessage.method,
          DidOpenViewMessage.type.notification({
            pane: "logic",
            view: value,
          })
        );
      }
    }
  };
}
