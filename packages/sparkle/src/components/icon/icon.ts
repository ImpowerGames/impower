import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import spec from "./_icon";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "icon-size": getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "name",
    "icon-size",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
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

  override get props() {
    return {
      ...super.props,
      name: this.name,
    };
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

  override get refs() {
    return super.refs as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The name of the svg to display.
   */
  get name(): string | null {
    return this.getStringAttribute(Icon.attrs.name);
  }
  set name(value) {
    this.setStringAttribute(Icon.attrs.name, value);
  }

  /**
   * Sets the size of an icon.
   */
  get iconSize(): SizeName | string | null {
    return this.getStringAttribute(Icon.attrs.iconSize);
  }
  set iconSize(value) {
    this.setStringAttribute(Icon.attrs.iconSize, value);
  }

  structuralAttributes = Object.keys(spec.props).map(
    (prop) => Icon.attrs[prop as keyof typeof Icon.attrs]
  );

  override shouldAttributeTriggerUpdate(
    name: string,
    oldValue: string,
    newValue: string
  ) {
    if (this.structuralAttributes.includes(name)) {
      return true;
    }
    return super.shouldAttributeTriggerUpdate(name, oldValue, newValue);
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
