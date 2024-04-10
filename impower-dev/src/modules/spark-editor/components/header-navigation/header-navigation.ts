import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_header-navigation";

export default class HeaderNavigation extends Component(spec) {
  override onConnected() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  override onDisconnected() {
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown = async (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      await Workspace.window.syncProject();
    }
  };
}
