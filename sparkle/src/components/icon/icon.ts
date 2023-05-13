import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssColor } from "../../utils/getCssColor";
import { getCssIcon } from "../../utils/getCssIcon";
import { getCssSize } from "../../utils/getCssSize";
import css from "./icon.css";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_ICON_ATTRIBUTES = getAttributeNameMap([
  "icon",
  "fill",
  "size",
  "stroke",
  "stroke-width",
]);

/**
 * Icons are symbols that can be used to represent various options within an application.
 */
export default class Icon extends SparkleElement {
  static override tagName = "s-icon";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ICON_ATTRIBUTES };
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
   * The name of the icon to display.
   */
  get icon(): string | null {
    return this.getStringAttribute(Icon.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Icon.attributes.icon, value);
  }

  /**
   * Sets the size of an icon.
   */
  get size(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute(Icon.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Icon.attributes.size, value);
  }

  /**
   * Sets the fill of an icon.
   *
   * If not provided a value, it will use "currentColor".
   */
  get fill(): "" | "currentColor" | "none" | null {
    return this.getStringAttribute(Icon.attributes.fill);
  }
  set fill(value) {
    this.setStringAttribute(Icon.attributes.fill, value);
  }

  /**
   * Sets the stroke of an icon.
   *
   * If not provided a value, it will use "currentColor".
   */
  get stroke(): "" | "currentColor" | "none" | null {
    return this.getStringAttribute(Icon.attributes.stroke);
  }
  set stroke(value) {
    this.setStringAttribute(Icon.attributes.stroke, value);
  }

  /**
   * Sets the stroke width of an icon.
   */
  get strokeWidth(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute(Icon.attributes.strokeWidth);
  }
  set strokeWidth(value) {
    this.setStringAttribute(Icon.attributes.strokeWidth, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "aria-label") {
      this.updateRootAttribute("aria-hidden", Boolean(newValue));
      this.updateRootAttribute("role", newValue ? "img" : null);
    }
    if (name === Icon.attributes.icon) {
      this.updateRootCssVariable(name, getCssIcon(newValue));
    }
    if (name === Icon.attributes.size) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === Icon.attributes.fill) {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === Icon.attributes.stroke) {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === Icon.attributes.strokeWidth) {
      this.updateRootCssVariable(name, newValue);
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
