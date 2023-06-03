import SEElement from "../../core/se-element";
import html from "./logic.html";

export default class Logic extends SEElement {
  static override async define(
    tag = "se-logic",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
