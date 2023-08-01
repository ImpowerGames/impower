import { DidCollapsePreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage";
import { DidExpandPreviewPaneMessage } from "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage";
import SEElement from "../core/se-element";
import component from "./_spark-editor";

export default class SparkEditor extends SEElement {
  static override async define(
    tag = "spark-editor",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  constructor() {
    super();
    this.childNodes.forEach((n) => {
      n.remove();
    });
  }

  override get component() {
    return component();
  }

  get splitPaneEl() {
    return this.getElementByTag("s-split-pane");
  }

  protected override onConnected(): void {
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

  protected override onDisconnected(): void {
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
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidExpandPreviewPaneMessage.type.isNotification(message)) {
        this.splitPaneEl?.setAttribute("reveal", "");
      }
    }
  };

  handleDidCollapsePreviewPane = async (e: Event) => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      if (DidCollapsePreviewPaneMessage.type.isNotification(message)) {
        this.splitPaneEl?.removeAttribute("reveal");
      }
    }
  };
}
