import SEElement from "../../core/se-element";
import html from "./footer-navigation.html";

export default class FooterNavigation extends SEElement {
  static override async define(
    tag = "se-footer-navigation",
    dependencies?: Record<string, string>,
    useShadowDom = true,
    useInlineStyles = true
  ) {
    return super.define(tag, dependencies, useShadowDom, useInlineStyles);
  }

  override get html(): string {
    return html;
  }
}
