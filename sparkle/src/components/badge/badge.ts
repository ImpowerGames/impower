import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./badge.css";
import html from "./badge.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["float"]);

/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-badge";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html() {
    return html;
  }

  override get styles() {
    return [styles];
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
