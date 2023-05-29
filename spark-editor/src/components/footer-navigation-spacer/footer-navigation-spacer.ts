import SEElement from "../../core/se-element";
import html from "./footer-navigation-spacer.html";

export default class FooterNavigationSpacer extends SEElement {
  static override async define(
    tag = "se-footer-navigation-spacer",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ) {
    return super.define(tag, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }
}