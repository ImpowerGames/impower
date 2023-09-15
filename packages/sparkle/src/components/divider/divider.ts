import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import spec from "./_divider";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["vertical", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider
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
   * Whether or not the divider is vertical instead of horizontal.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(Divider.attrs.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(Divider.attrs.vertical, value);
  }

  /**
   * The size of the divider
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Divider.attrs.size);
  }
  set size(value) {
    this.setStringAttribute(Divider.attrs.size, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Divider.attrs.vertical) {
      this.updateRootAttribute(
        Divider.attrs.ariaOrientation,
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
