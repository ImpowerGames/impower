import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { ColorName } from "../../types/colorName";
import spec from "./_skeleton";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "sheen-color": getCssColor,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Skeletons are used to provide a visual representation of where content will eventually be drawn.
 */
export default class Skeleton
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({ props: this.props, state: this.state });
  }

  override get css() {
    return spec.css;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The color of the sheen.
   */
  get sheenColor(): ColorName | string | null {
    return this.getStringAttribute(Skeleton.attrs.sheenColor);
  }
  set sheenColor(value) {
    this.setStringAttribute(Skeleton.attrs.sheenColor, value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-skeleton": Skeleton;
  }
}
