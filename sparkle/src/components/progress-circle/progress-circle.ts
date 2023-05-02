import SparkleElement from "../../core/sparkle-element";
import { getCssSize } from "../../utils/getCssSize";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Progress circles are used to show the progress of a determinate operation in a circular fashion.
 */
export default class ProgressCircle extends SparkleElement {
  static override async define(
    tag = "s-progress-circle",
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
    return [...super.observedAttributes, "value", "size"];
  }

  /**
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute("value");
  }

  /**
   * The size of the circle.
   */
  get size(): string | null {
    return this.getStringAttribute("size");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "value") {
      this.updateRootAttribute("aria-valuenow", newValue);
      const indicator = this.getElementByClass("indicator");
      if (indicator) {
        const numberValue = Number(newValue);
        const radius = parseFloat(
          getComputedStyle(indicator).getPropertyValue("r")
        );
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (numberValue / 100) * circumference;
        const indicatorOffset = `${offset}px`;
        indicator.style.strokeDashoffset = indicatorOffset;
        this.updateRootStyle("--percentage", String(numberValue / 100));
      }
    }
    if (name === "size") {
      this.updateRootStyle("--size", getCssSize(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
