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
    return spec.html({ props: this.props, state: this.state });
  }

  override get css() {
    return spec.css;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
