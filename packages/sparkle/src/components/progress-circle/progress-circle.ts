import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssProportion from "../../../../sparkle-style-transformer/src/utils/getCssProportion";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import component from "./_progress-circle";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["value", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

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

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  override transformCss(css: string) {
    return ProgressCircle.augmentCss(css);
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
  get size(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(ProgressCircle.attributes.size, value);
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
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-circle": ProgressCircle;
  }
}
