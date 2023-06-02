import SEElement from "../../core/se-element";
import html from "./music.html";

export default class Music extends SEElement {
  static override async define(
    tag = "se-music",
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
