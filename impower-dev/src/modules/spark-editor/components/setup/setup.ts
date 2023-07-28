import { DidOpenPanelMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenPanelMessage";
import SEElement from "../../core/se-element";
import Workspace from "../../workspace/Workspace";
import component from "./_setup";

export default class Setup extends SEElement {
  static override async define(
    tag = "se-setup",
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
      if (e.detail.key === "window/setup") {
        const value = e.detail.value;
        this.emit(
          DidOpenPanelMessage.method,
          DidOpenPanelMessage.type.notification({ pane: "setup", panel: value })
        );
      }
    }
  };
}
