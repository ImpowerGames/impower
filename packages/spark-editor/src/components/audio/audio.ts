import SEElement from "../../core/se-element";
import html from "./audio.html";

export default class Audio extends SEElement {
  static override async define(
    tag = "se-audio",
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
