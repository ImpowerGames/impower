import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssSize } from "../../utils/getCssSize";
import css from "./circle.css";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["size"]);

/**
 * Circles are basic surfaces for styling and laying out content.
 */
export default class Circle
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-circle";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  /**
   * The size of the circle.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Circle.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Circle.attributes.size, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Circle.attributes.size) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-circle": Circle;
  }
}
