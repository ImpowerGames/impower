import { RefMap } from "../../../../spec-component/src/component";
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
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-box": Box;
  }
}
