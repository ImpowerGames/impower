import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import { getCssIcon } from "../../utils/getCssIcon";
import { getCssSize } from "../../utils/getCssSize";
import css from "./icon.css";
import html from "./icon.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Icons are symbols that can be used to represent various options within an application.
 */
export default class Icon extends SparkleElement {
  static override async define(
    tag = "s-icon",
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "icon",
      "fill",
      "size",
      "stroke",
      "stroke-width",
    ];
  }

  /**
   * Sets the size of an icon.
   */
  get size(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("size");
  }

  /**
   * Sets the fill of an icon.
   *
   * If not provided a value, it will use "currentColor".
   */
  get fill(): "" | "currentColor" | "none" | null {
    return this.getStringAttribute("fill");
  }

  /**
   * Sets the stroke of an icon.
   *
   * If not provided a value, it will use "currentColor".
   */
  get stroke(): "" | "currentColor" | "none" | null {
    return this.getStringAttribute("stroke");
  }

  /**
   * Sets the stroke width of an icon.
   */
  get strokeWidth(): "xs" | "sm" | "md" | "lg" | "xl" | null {
    return this.getStringAttribute("stroke-width");
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
    if (name === "icon") {
      this.updateRootCssVariable(name, getCssIcon(newValue));
    }
    if (name === "size") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === "fill") {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === "stroke") {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === "stroke-width") {
      this.updateRootCssVariable(name, newValue);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
