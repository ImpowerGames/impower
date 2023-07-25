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

  protected override onConnected(): void {
    window.addEventListener("dragenter", this.handleDragEnter);
    window.addEventListener("dragover", this.handleDragOver);
    window.addEventListener("drop", this.handleDrop);
  }

  protected override onDisconnected(): void {
    window.removeEventListener("dragenter", this.handleDragEnter);
    window.removeEventListener("dragover", this.handleDragOver);
    window.removeEventListener("drop", this.handleDrop);
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
}
