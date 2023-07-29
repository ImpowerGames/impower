import STYLES from "../../../../spark-element/src/caches/STYLE_CACHE";
import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import component from "./_icon";

const DEFAULT_TRANSFORMERS = {
  icon: (v: string) => getCssIcon(v, STYLES.icons),
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["icon", "size", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Icons are symbols that can be used to represent various options within an application.
 */
export default class Icon
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-icon";

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
    return Icon.augmentCss(css);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Icon.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Icon.attributes.icon, value);
  }

  /**
   * Sets the size of an icon.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Icon.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Icon.attributes.size, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Icon.attributes.ariaLabel) {
      this.updateRootAttribute(Icon.attributes.ariaHidden, Boolean(newValue));
      this.updateRootAttribute(Icon.attributes.role, newValue ? "img" : null);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
