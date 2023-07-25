import SEElement from "../../core/se-element";
import Workspace from "../../workspace/Workspace";
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
    return component({ store: Workspace.instance.state });
  }

  protected override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  protected override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "window/displays") {
        const mode = e.detail.value;
        Workspace.instance.state.displays.panel = mode;
      }
    }
  };
}
