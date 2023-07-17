import SEElement from "../../core/se-element";
import Workspace from "../../state/Workspace";
import component from "./_audio";

export default class Audio extends SEElement {
  static override async define(
    tag = "se-audio",
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
      if (e.detail.key === "window/audio") {
        const mode = e.detail.value;
        Workspace.instance.state.audio.panel = mode;
      }
    }
  };
}
