import { DidOpenViewMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidOpenViewMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import spec from "./_logic";

export default class Logic extends Component(spec) {
  override onConnected(): void {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected(): void {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "logic-view") {
        const value = e.detail.value;
        this.emit(
          DidOpenViewMessage.method,
          DidOpenViewMessage.type.notification({
            pane: "logic",
            view: value,
          })
        );
      }
    }
  };
}
