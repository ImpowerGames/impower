import SEElement from "../../core/se-element";
import html from "./share.html";

export default class Share extends SEElement {
  static override async define(
    tag = "se-share",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}
