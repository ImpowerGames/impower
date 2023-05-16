import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./icon.css";
import html from "./icon.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap(["icon", "size"]);

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
   * Sets the size of an icon.
   */
  override get size(): SizeName | string | null {
    return super.size;
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

  protected override onContentAssigned(slot: HTMLSlotElement): void {
    if (slot.assignedNodes().length > 0) {
      if (this.icon == null) {
        this.setAttribute("icon", "");
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
