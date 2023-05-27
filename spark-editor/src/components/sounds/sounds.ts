import SEElement from "../../core/se-element";
import html from "./sounds.html";

export default class Sounds extends SEElement {
  static override async define(
    tag = "se-sounds",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
