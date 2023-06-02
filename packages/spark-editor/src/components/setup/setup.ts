import SEElement from "../../core/se-element";
import html from "./setup.html";

export default class Setup extends SEElement {
  static override async define(
    tag = "se-setup",
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
