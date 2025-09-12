import { HideEditorStatusBarMessage } from "@impower/spark-editor-protocol/src/protocols/editor/HideEditorStatusBarMessage";
import { ShowEditorStatusBarMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_main-window";

export default class MainWindow extends Component(spec) {
  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
    this.refs.footerVisibilityManager?.addEventListener(
      "changing",
      this.handleChangingFooterVisibility
    );
    window.addEventListener("enter", this.handleEnter);
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
    this.refs.footerVisibilityManager?.removeEventListener(
      "changing",
      this.handleChangingFooterVisibility
    );
    window.removeEventListener("enter", this.handleEnter);
  }

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (DidExpandPreviewPaneMessage.type.is(e.detail)) {
        this.handleDidExpandPreviewPane();
      }
      if (DidCollapsePreviewPaneMessage.type.is(e.detail)) {
        this.handleDidCollapsePreviewPane();
      }
    }
  };

  handleChangingFooterVisibility = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (e.detail.hidden) {
        this.emit(
          MessageProtocol.event,
          HideEditorStatusBarMessage.type.request({})
        );
      } else {
        this.emit(
          MessageProtocol.event,
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

  handleDidExpandPreviewPane = async () => {
    this.refs.splitPane.setAttribute("reveal", "");
  };

  handleDidCollapsePreviewPane = async () => {
    this.refs.splitPane.removeAttribute("reveal");
  };
}
