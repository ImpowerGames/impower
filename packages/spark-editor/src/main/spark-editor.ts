import SEElement from "../core/se-element";
import html from "./spark-editor.html";

export default class SparkEditor extends SEElement {
  static override async define(
    tag = "se-gui",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
