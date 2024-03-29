import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import { Component } from "../../../../../packages/spec-component/src/component";
import spec from "./_spark-editor";

export default class SparkEditor extends Component(spec) {
  constructor() {
    super();
    this.childNodes.forEach((n) => {
      n.remove();
    });
  }

  override onConnected() {
    window.addEventListener("dragenter", this.handleDragEnter);
    window.addEventListener("dragover", this.handleDragOver);
    window.addEventListener("drop", this.handleDrop);
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
    window.removeEventListener("dragenter", this.handleDragEnter);
    window.removeEventListener("dragover", this.handleDragOver);
    window.removeEventListener("drop", this.handleDrop);
    window.removeEventListener(
      DidExpandPreviewPaneMessage.method,
      this.handleDidExpandPreviewPane
    );
    window.removeEventListener(
      DidCollapsePreviewPaneMessage.method,
      this.handleDidCollapsePreviewPane
    );
  }

  handleDragEnter = async (e: Event) => {
    e.preventDefault();
  };

  handleDragOver = async (e: Event) => {
    e.preventDefault();
  };

  handleDrop = async (e: Event) => {
    e.preventDefault();
  };

  handleDidExpandPreviewPane = async (e: Event) => {
    this.ref.splitPane.setAttribute("reveal", "");
  };

  handleDidCollapsePreviewPane = async (e: Event) => {
    this.ref.splitPane.removeAttribute("reveal");
  };
}
