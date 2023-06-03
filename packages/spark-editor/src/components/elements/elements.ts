import SEElement from "../../core/se-element";
import html from "./elements.html";

export default class Elements extends SEElement {
  static override async define(
    tag = "se-elements",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
