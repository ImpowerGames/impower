import SEElement from "../../core/se-element";
import html from "./scripts.html";

export default class Logic extends SEElement {
  static override async define(
    tag = "se-scripts",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
