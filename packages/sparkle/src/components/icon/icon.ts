import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import STYLES from "../../../../spec-component/src/caches/STYLE_CACHE";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import spec from "./_icon";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
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
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      stores: this.stores,
      context: this.context,
      state: this.state,
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

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Icon.attrs.icon);
  }
  set icon(value) {
    this.setStringAttribute(Icon.attrs.icon, value);
  }

  /**
   * Sets the size of an icon.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Icon.attrs.size);
  }
  set size(value) {
    this.setStringAttribute(Icon.attrs.size, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Icon.attrs.ariaLabel) {
      this.updateRootAttribute(Icon.attrs.ariaHidden, Boolean(newValue));
      this.updateRootAttribute(Icon.attrs.role, newValue ? "img" : null);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
