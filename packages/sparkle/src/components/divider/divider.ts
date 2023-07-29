import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import component from "./_divider";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["vertical", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-divider";

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
    return Divider.augmentCss(css);
  }

  /**
   * Whether or not the divider is vertical instead of horizontal.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(Divider.attributes.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(Divider.attributes.vertical, value);
  }

  /**
   * The size of the divider
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Divider.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Divider.attributes.size, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Divider.attributes.vertical) {
      this.updateRootAttribute(
        Divider.attributes.ariaOrientation,
        newValue != null ? "vertical" : "horizontal"
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-divider": Divider;
  }
}
