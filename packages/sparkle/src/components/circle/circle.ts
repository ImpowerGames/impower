import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import component from "./_circle";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap([...getKeys(DEFAULT_TRANSFORMERS)]),
};

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

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

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
    return Circle.augmentCss(css);
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
