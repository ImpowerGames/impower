import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_preview-toggle-button";

export default class PreviewToggleButton extends Component(spec) {
  override onConnected() {
    this.root.addEventListener("changed", this.handleChanged);
  }

  override onDisconnected() {
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
