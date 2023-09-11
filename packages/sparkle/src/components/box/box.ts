import SparkleElement from "../../core/sparkle-element";
import spec from "./_box";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return this.getHTML(spec, { props: {}, state: {} });
  }

  override get css() {
    return this.getCSS(spec);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
