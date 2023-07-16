import SparkleElement from "../../core/sparkle-element";
import component from "./_box";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static override tagName = "s-box";

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return Box.augmentCss(css);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
