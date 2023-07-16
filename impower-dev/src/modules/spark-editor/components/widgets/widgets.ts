import SEElement from "../../core/se-element";
import html from "./widgets.html";

export default class Widgets extends SEElement {
  static override async define(
    tag = "se-widgets",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
