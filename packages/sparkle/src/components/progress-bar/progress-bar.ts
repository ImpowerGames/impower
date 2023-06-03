import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getKeys } from "../../utils/getKeys";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

export const DEFAULT_TRANSFORMERS = {
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "value",
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-progress-bar";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get html() {
    return html;
  }

  override get styles() {
    return [ProgressBar.augmentCss(css)];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  /**
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute(ProgressBar.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(ProgressBar.attributes.value, value);
  }

  /**
   * The width of the track.
   */
  get trackWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressBar.attributes.trackWidth);
  }
  set trackWidth(value) {
    this.setStringAttribute(ProgressBar.attributes.trackWidth, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressBar.attributes.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(ProgressBar.attributes.indicatorWidth, value);
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute(ProgressBar.attributes.speed);
  }
  set speed(value) {
    this.setStringAttribute(ProgressBar.attributes.speed, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === ProgressBar.attributes.value) {
      this.updateRootAttribute(ProgressBar.attributes.ariaValueNow, newValue);
      this.updateRootCssVariable(
        name,
        newValue.endsWith("%") ? newValue : `${newValue}%`
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-bar": ProgressBar;
  }
}
