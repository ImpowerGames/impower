import SEElement from "../core/se-element";
import html from "./spark-editor.html";

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

  override get html() {
    return html;
  }
}
