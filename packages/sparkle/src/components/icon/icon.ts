import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import Icons from "../../configs/icons";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import css from "./icon.css";
import html from "./icon.html";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, Icons.all()),
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
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
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }

  override get css() {
    return Icon.augmentCss(css);
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
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
