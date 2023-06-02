import SEElement from "../../core/se-element";
import html from "./access.html";

export default class Access extends SEElement {
  static override async define(
    tag = "se-access",
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
