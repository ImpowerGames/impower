import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssColor } from "../../utils/getCssColor";
import { getCssDuration } from "../../utils/getCssDuration";
import { getCssProportion } from "../../utils/getCssProportion";
import { getCssSize } from "../../utils/getCssSize";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_PROGRESS_CIRCLE_ATTRIBUTES = getAttributeNameMap([
  "value",
  "size",
  "track-width",
  "track-color",
  "speed",
]);

/**
 * Progress circles are used to show the progress of an operation in a circular fashion.
 */
export default class ProgressCircle extends SparkleElement {
  static override tagName = "s-progress-circle";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_PROGRESS_CIRCLE_ATTRIBUTES };
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
   * The current progress as a percentage from 0 to 1, or 0% to 100%.
   */
  get value(): string | null {
    return this.getStringAttribute(ProgressCircle.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(ProgressCircle.attributes.value, value);
  }

  /**
   * The size of the circle.
   */
  get size(): string | null {
    return this.getStringAttribute(ProgressCircle.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(ProgressCircle.attributes.size, value);
  }

  /**
   * The width of the track.
   */
  get trackWidth(): string | null {
    return this.getStringAttribute(ProgressCircle.attributes.trackWidth);
  }
  set trackWidth(value) {
    this.setStringAttribute(ProgressCircle.attributes.trackWidth, value);
  }

  /**
   * The color of the track.
   */
  get trackColor(): string | null {
    return this.getStringAttribute(ProgressCircle.attributes.trackColor);
  }
  set trackColor(value) {
    this.setStringAttribute(ProgressCircle.attributes.trackColor, value);
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute(ProgressCircle.attributes.speed);
  }
  set speed(value) {
    this.setStringAttribute(ProgressCircle.attributes.speed, value);
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
    if (name === ProgressCircle.attributes.value) {
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
    if (name === ProgressCircle.attributes.size) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === ProgressCircle.attributes.trackWidth) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === ProgressCircle.attributes.trackColor) {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
    if (name === ProgressCircle.attributes.speed) {
      this.updateRootCssVariable(name, getCssDuration(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
