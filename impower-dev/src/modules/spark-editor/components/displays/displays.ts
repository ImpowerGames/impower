import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_displays";

export default class Displays extends SEElement {
  static override async define(
    tag = "se-displays",
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
      if (e.detail.key === "displays-panel") {
        const value = e.detail.value;
        Workspace.window.openedPanel("displays", value);
      }
    }
  };
}
