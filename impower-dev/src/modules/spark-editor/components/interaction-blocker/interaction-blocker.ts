import { ChangedProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedProjectStateMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_interaction-blocker";

export default class InteractionBlocker extends SEElement {
  static override async define(
    tag = "se-interaction-blocker",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  protected override onConnected(): void {
    window.addEventListener(
      ChangedProjectStateMessage.method,
      this.handleChangedProjectState
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      ChangedProjectStateMessage.method,
      this.handleChangedProjectState
    );
  }

  handleChangedProjectState = (e: Event) => {
    if (
      !Workspace.window.state.project.id ||
      Workspace.window.state.project.syncState === "loading" ||
      Workspace.window.state.project.syncState === "importing" ||
      Workspace.window.state.project.syncState === "exporting"
    ) {
      this.hidden = false;
    } else {
      this.hidden = true;
    }
  };
}
