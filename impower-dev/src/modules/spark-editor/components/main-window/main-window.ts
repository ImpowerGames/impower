import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import spec from "./_main-window";

export default class MainWindow extends Component(spec) {
  override onConnected() {
    this.ownerDocument.addEventListener("enter", this.handleEnter);
    window.addEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleDidExpandPreviewPane
    );
    window.addEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleDidCollapsePreviewPane
    );
  }

  override onDisconnected() {
    this.ownerDocument.removeEventListener("enter", this.handleEnter);
    window.removeEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleDidExpandPreviewPane
    );
    window.removeEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleDidCollapsePreviewPane
    );
  }

  handleEnter = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.key === "pane") {
        const pane = e.detail.value;
        this.context.pane = pane;
        Workspace.window.openedPane(pane);
      }
    }
  };

  handleDidExpandPreviewPane = async (e: Event) => {
    this.ref.splitPane.setAttribute("reveal", "");
  };

  handleDidCollapsePreviewPane = async (e: Event) => {
    this.ref.splitPane.removeAttribute("reveal");
  };
}
