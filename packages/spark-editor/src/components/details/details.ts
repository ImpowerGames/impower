import SEElement from "../../core/se-element";
import html from "./details.html";

export default class Details extends SEElement {
  static override async define(
    tag = "se-details",
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
