import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
} from "../../core/sparkle-element";
import component from "./_badge";

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["float"]),
};

/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-badge";

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

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return Badge.augmentCss(css);
  }

  /**
   * Determines if the badge should be floated over the left or right corner.
   */
  get float(): "left" | "right" | null {
    return this.getStringAttribute(Badge.attributes.float);
  }
  set float(value) {
    this.setStringAttribute(Badge.attributes.float, value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
