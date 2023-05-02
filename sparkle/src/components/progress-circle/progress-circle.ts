import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import { getCssDuration } from "../../utils/getCssDuration";
import { getCssSize } from "../../utils/getCssSize";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Progress circles are used to show the progress of an operation in a circular fashion.
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
    return [
      ...super.observedAttributes,
      "value",
      "size",
      "track-width",
      "track-color",
      "speed",
    ];
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

  /**
   * The width of the track.
   */
  get trackWidth(): string | null {
    return this.getStringAttribute("track-width");
  }

  /**
   * The color of the track.
   */
  get trackColor(): string | null {
    return this.getStringAttribute("track-color");
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute("speed");
  }

  get indicatorEl(): HTMLElement | null {
    return this.getElementByClass("indicator");
  }

  get labelEl(): HTMLElement | null {
    return this.getElementByClass("label");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "value") {
      this.updateRootAttribute("aria-valuenow", newValue);
      const numberValue = newValue.endsWith("%")
        ? Number(newValue.replace("%", ""))
        : Number(newValue);
      this.updateRootStyle("--percentage", String(numberValue / 100));
      const labelEl = this.labelEl;
      if (labelEl) {
        if (newValue != null) {
          labelEl.textContent = `${numberValue}%`;
        } else {
          labelEl.textContent = "";
        }
      }
    }
    if (name === "size") {
      this.updateRootStyle("--size", getCssSize(newValue));
    }
    if (name === "track-width") {
      this.updateRootStyle("--track-width", getCssSize(newValue));
    }
    if (name === "track-color") {
      this.updateRootStyle("--track-color", getCssColor(newValue));
    }
    if (name === "speed") {
      this.updateRootStyle("--speed", getCssDuration(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
