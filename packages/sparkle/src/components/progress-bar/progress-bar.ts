import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import spec from "./_progress-bar";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap(["value", ...getKeys(DEFAULT_TRANSFORMERS)]),
};

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar
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
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute(ProgressBar.attrs.value);
  }
  set value(value) {
    this.setStringAttribute(ProgressBar.attrs.value, value);
  }

  /**
   * The width of the track.
   */
  get trackWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressBar.attrs.trackWidth);
  }
  set trackWidth(value) {
    this.setStringAttribute(ProgressBar.attrs.trackWidth, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(ProgressBar.attrs.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(ProgressBar.attrs.indicatorWidth, value);
  }

  /**
   * The speed of the animation.
   */
  get speed(): string | null {
    return this.getStringAttribute(ProgressBar.attrs.speed);
  }
  set speed(value) {
    this.setStringAttribute(ProgressBar.attrs.speed, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === ProgressBar.attrs.value) {
      this.updateRootAttribute(ProgressBar.attrs.ariaValueNow, newValue);
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
