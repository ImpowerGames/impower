import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import Icons from "../../configs/icons";
import SparkleElement from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import css from "./icon.css";
import html from "./icon.html";

const styles = new CSSStyleSheet();

export const DEFAULT_TRANSFORMERS = {
  icon: (v: string) => getCssIcon(v, Icons.all()),
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "icon",
  "size",
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

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
    styles.replaceSync(Icon.augmentCss(css));
    return [styles];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
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
