import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_preview-toggle-button";

export default class PreviewToggleButton extends SEElement {
  static override async define(
    tag = "se-preview-toggle-button",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  protected override onConnected(): void {
    this.root.addEventListener("changed", this.handleChanged);
  }

  protected override onDisconnected(): void {
    this.root.removeEventListener("changed", this.handleChanged);
  }

  handleChanged = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.value) {
        Workspace.window.expandedPreviewPane();
      } else {
        Workspace.window.collapsedPreviewPane();
      }
    }
  };
}
