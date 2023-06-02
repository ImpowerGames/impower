import SEElement from "../../core/se-element";
import html from "./option-button.html";

export default class OptionButton extends SEElement {
  static override async define(
    tag = "se-option-button",
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
