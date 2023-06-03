import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import SparkleElement from "../../core/sparkle-element";
import { ColorName } from "../../types/colorName";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import css from "./skeleton.css";
import html from "./skeleton.html";

export const DEFAULT_TRANSFORMERS = {
  "sheen-color": getCssColor,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Skeletons are used to provide a visual representation of where content will eventually be drawn.
 */
export default class Skeleton
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-skeleton";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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

  override get styles() {
    return [Skeleton.augmentCss(css)];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  /**
   * The color of the sheen.
   */
  get sheenColor(): ColorName | string | null {
    return this.getStringAttribute(Skeleton.attributes.sheenColor);
  }
  set sheenColor(value) {
    this.setStringAttribute(Skeleton.attributes.sheenColor, value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-skeleton": Skeleton;
  }
}
