import { getCssProportion } from "../../../../sparkle-transformer/src/utils/getCssProportion";
import { getCssSize } from "../../../../sparkle-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import css from "./progress-circle.css";
import html from "./progress-circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "value",
  "track-width",
  "indicator-width",
  "speed",
  "size",
]);

/**
 * Progress circles are used to show the progress of an operation in a circular fashion.
 */
export default class ProgressCircle
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-progress-circle";

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
  override get size(): SizeName | string | null {
    return super.size;
  }

  /**
   * The width of the track.
   */
  get trackWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attributes.trackWidth);
  }
  set trackWidth(value) {
    this.setStringAttribute(ProgressCircle.attributes.trackWidth, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attributes.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(ProgressCircle.attributes.indicatorWidth, value);
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
      this.updateRootAttribute(
        ProgressCircle.attributes.ariaValueNow,
        newValue
      );
      const labelEl = this.labelEl;
      if (labelEl) {
        if (newValue != null) {
          labelEl.textContent = `${proportion * 100}%`;
        } else {
          labelEl.textContent = "";
        }
      }
    }
    if (name === ProgressCircle.attributes.trackWidth) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
