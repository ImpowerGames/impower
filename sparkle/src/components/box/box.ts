import SparkleElement from "../../core/sparkle-element";

/**
 * Boxes are basic surfaces for styling and laying out content.
 */
export default class Box extends SparkleElement {
  static async define(tag = "s-box"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
