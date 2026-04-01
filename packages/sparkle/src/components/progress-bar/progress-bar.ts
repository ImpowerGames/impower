import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_progress-bar";

const DEFAULT_TRANSFORMERS = {
  "track-width": getCssSize,
  "indicator-width": getCssSize,
  speed: (v: string) => v,
};

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.value) {
      this.updateRootAttribute(this.attrs.ariaValueNow, newValue);
      this.updateRootCssVariable(
        name,
        newValue.endsWith("%") ? newValue : `${newValue}%`,
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-bar": ProgressBar;
  }
}
