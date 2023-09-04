import { ChangedHeaderInfoMessage } from "@impower/spark-editor-protocol/src/protocols/window/ChangedHeaderInfoMessage";
import SEElement from "../../core/se-element";
import { Workspace } from "../../workspace/Workspace";
import component from "./_header-title-caption";

export default class HeaderTitleCaption extends SEElement {
  static override async define(
    tag = "se-header-title-caption",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get component() {
    return component({ store: Workspace.window.state });
  }

  protected override onConnected(): void {
    window.addEventListener(ChangedHeaderInfoMessage.method, this.handleRender);
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      ChangedHeaderInfoMessage.method,
      this.handleRender
    );
  }

  handleRender = () => {
    this.render();
  };
}
