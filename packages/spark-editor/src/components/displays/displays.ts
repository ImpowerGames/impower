import SEElement from "../../core/se-element";
import html from "./displays.html";

export default class Displays extends SEElement {
  static override async define(
    tag = "se-displays",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
