import { DidBlockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidBlockInteractionsMessage";
import { DidUnblockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidUnblockInteractionsMessage";
import { WillBlockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillBlockInteractionsMessage";
import { WillUnblockInteractionsMessage } from "@impower/spark-editor-protocol/src/protocols/window/WillUnblockInteractionsMessage";
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
      WillBlockInteractionsMessage.method,
      this.handleWillBlockInteractions
    );
    window.addEventListener(
      WillUnblockInteractionsMessage.method,
      this.handleWillUnblockInteractions
    );
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      WillBlockInteractionsMessage.method,
      this.handleWillBlockInteractions
    );
    window.removeEventListener(
      WillUnblockInteractionsMessage.method,
      this.handleWillUnblockInteractions
    );
  }

  handleWillBlockInteractions = async () => {
    if (this) {
      this.hidden = false;
    }
    const message = DidBlockInteractionsMessage.type.notification({});
    this.emit(message.method, message);
  };

  handleWillUnblockInteractions = async () => {
    if (this) {
      this.hidden = true;
    }
    const message = DidUnblockInteractionsMessage.type.notification({});
    this.emit(message.method, message);
  };
}
