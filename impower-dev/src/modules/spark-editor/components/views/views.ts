import SEElement from "../../core/se-element";
import html from "./views.html";

export default class Views extends SEElement {
  static override async define(
    tag = "se-views",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}