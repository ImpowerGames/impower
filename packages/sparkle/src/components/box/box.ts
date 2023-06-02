import SparkleElement from "../../core/sparkle-element";
import css from "./box.css";
import html from "./box.html";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static override tagName = "s-box";

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true,
    useInlineStyles = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom, useInlineStyles);
  }

  override get html() {
    return html;
  }

  override get styles() {
    return [Box.augmentCss(css)];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
