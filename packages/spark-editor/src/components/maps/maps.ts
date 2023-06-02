import SEElement from "../../core/se-element";
import html from "./maps.html";

export default class Maps extends SEElement {
  static override async define(
    tag = "se-maps",
    dependencies?: Record<string, string>,
    useShadowDom = true,
    useInlineStyles = true
  ) {
    return super.define(tag, dependencies, useShadowDom, useInlineStyles);
  }

  override get html() {
    return html;
  }
}
