import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { HideEditorStatusBarMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorStatusBarMessage";
import { ShowEditorStatusBarMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import spec from "./_main-window";

export default class MainWindow extends Component(spec) {
  override onConnected() {
    this.ref.footerVisibilityManager.addEventListener(
      "changing",
      this.handleChangingFooterVisibility
    );
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
    this.ref.footerVisibilityManager.removeEventListener(
      "changing",
      this.handleChangingFooterVisibility
    );
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

  handleChangingFooterVisibility = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.hidden) {
        this.emit(
          HideEditorStatusBarMessage.method,
          HideEditorStatusBarMessage.type.request({})
        );
      } else {
        this.emit(
          ShowEditorStatusBarMessage.method,
          ShowEditorStatusBarMessage.type.request({})
        );
      }
    }
  };

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
