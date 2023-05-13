import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./badge.css";
import html from "./badge.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_BADGE_ATTRIBUTES = getAttributeNameMap(["float"]);

/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge extends SparkleElement {
  static override tagName = "s-badge";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_BADGE_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
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

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Badge.attributes.float) {
      this.updateRootCssVariable(name, newValue);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
