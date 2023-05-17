import { getCssSize } from "../../../../sparkle-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import css from "./circle.css";
import html from "./circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Circles are basic surfaces for styling and laying out content.
 */
export default class Circle
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-circle";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html() {
    return html;
  }

  override get styles() {
    return [styles];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  /**
   * The size of the circle.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Circle.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Circle.attributes.size, value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-circle": Circle;
  }
}
