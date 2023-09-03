import { DidChangePersistenceStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangePersistenceState";
import { DidLoadProjectNameMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidLoadProjectNameMessage";
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
    window.addEventListener(
      DidChangePersistenceStateMessage.method,
      this.handleRender
    );
    window.addEventListener(
      DidLoadProjectNameMessage.method,
      this.handleRender
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidChangePersistenceStateMessage.method,
      this.handleRender
    );
    window.removeEventListener(
      DidLoadProjectNameMessage.method,
      this.handleRender
    );
  }

  handleRender = () => {
    this.render();
  };
}
