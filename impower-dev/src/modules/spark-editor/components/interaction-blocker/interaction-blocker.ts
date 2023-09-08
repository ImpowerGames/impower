import { DidChangeProjectStateMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeProjectStateMessage";
import SEElement from "../../core/se-element";
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
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidChangeProjectStateMessage.method,
      this.handleDidChangeProjectState
    );
  }

  handleDidChangeProjectState = (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidChangeProjectStateMessage.type.isNotification(message)) {
        const params = message.params;
        const { state } = params;
        if (
          !state.id ||
          state.syncState === "loading" ||
          state.syncState === "importing" ||
          state.syncState === "exporting"
        ) {
          this.hidden = false;
        } else {
          this.hidden = true;
        }
      }
    }
  };
}
