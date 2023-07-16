import SEElement from "../../core/se-element";
import html from "./graphics.html";

export default class Graphics extends SEElement {
  static override async define(
    tag = "se-graphics",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
