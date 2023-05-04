import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import { getCssDuration } from "../../utils/getCssDuration";
import { getCssProportion } from "../../utils/getCssProportion";
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
   * The current progress as a percentage from 0 to 1, or 0% to 100%.
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

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "value") {
      const proportion = getCssProportion(newValue, 0);
      this.updateRootCssVariable(name, String(proportion));
      this.updateRootAttribute("aria-valuenow", newValue);
      const labelEl = this.labelEl;
      if (labelEl) {
        if (newValue != null) {
          labelEl.textContent = `${proportion * 100}%`;
        } else {
          labelEl.textContent = "";
        }
      }
    }
    if (name === "size") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === "track-width") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === "track-color") {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === "speed") {
      this.updateRootCssVariable(name, getCssDuration(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
