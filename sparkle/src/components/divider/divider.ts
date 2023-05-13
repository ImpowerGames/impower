import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./divider.css";
import html from "./divider.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["vertical"]);

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-divider";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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
   * Whether or not the divider is vertical instead of horizontal.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(Divider.attributes.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(Divider.attributes.vertical, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Divider.attributes.vertical) {
      this.updateRootAttribute(
        Divider.attributes.ariaOrientation,
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
