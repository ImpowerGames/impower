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
  static async define(tag = "s-icon"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "aria-label",
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

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "aria-label") {
      this.updateRootAttribute("aria-hidden", Boolean(newValue));
      this.updateRootAttribute("role", newValue ? "img" : null);
    }
    if (name === "icon") {
      this.updateRootStyle("--icon", getCssIcon(newValue));
      if (newValue) {
        this.updateRootClass("icon-mask", true);
      }
    }
    if (name === "size") {
      this.updateRootStyle("--size", getCssSize(newValue));
    }
    if (name === "fill") {
      this.updateRootStyle("--fill", getCssColor(newValue));
    }
    if (name === "stroke") {
      this.updateRootStyle("--stroke", getCssColor(newValue));
    }
    if (name === "stroke-width") {
      this.updateRootStyle("--stroke-width", newValue);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
