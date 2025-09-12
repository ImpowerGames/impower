import {
  getCssProportion,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import spec from "./_progress-circle";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  size: getCssSize,
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["value", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Progress circles are used to show the progress of an operation in a circular fashion.
 */
export default class ProgressCircle
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get refs() {
    return super.refs as RefMap<typeof this.selectors>;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The current progress as a percentage from 0 to 1, or 0% to 100%.
   */
  get value(): string | null {
    return this.getStringAttribute(ProgressCircle.attrs.value);
  }
  set value(value) {
    this.setStringAttribute(ProgressCircle.attrs.value, value);
  }

  /**
   * The size of the circle.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attrs.size);
  }
  set size(value) {
    this.setStringAttribute(ProgressCircle.attrs.size, value);
  }

  /**
   * The width of the track.
   */
  get trackWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attrs.trackWidth);
  }
  set trackWidth(value) {
    this.setStringAttribute(ProgressCircle.attrs.trackWidth, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressCircle.attrs.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(ProgressCircle.attrs.indicatorWidth, value);
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute(ProgressCircle.attrs.speed);
  }
  set speed(value) {
    this.setStringAttribute(ProgressCircle.attrs.speed, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === ProgressCircle.attrs.value) {
      const proportion = getCssProportion(newValue, 0);
      this.updateRootCssVariable(name, String(proportion));
      this.updateRootAttribute(ProgressCircle.attrs.ariaValueNow, newValue);
      const labelEl = this.refs.label;
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
