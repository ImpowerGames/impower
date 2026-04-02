import {
  getCssProportion,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_progress-circle";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

/**
 * Progress circles are used to show the progress of an operation in a circular fashion.
 */
export default class ProgressCircle extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.value) {
      const proportion = getCssProportion(newValue, 0);
      this.updateCssVariable(name, String(proportion));
      this.updateRootAttribute(this.attrs.ariaValueNow, newValue);
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
