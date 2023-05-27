import SEElement from "../../core/se-element";
import html from "./gui.html";

export default class GUI extends SEElement {
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
