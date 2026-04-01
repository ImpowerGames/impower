import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_divider";

const DEFAULT_TRANSFORMERS = {
  size: getCssSize,
};

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.vertical) {
      this.updateRootAttribute(
        this.attrs.ariaOrientation,
        newValue != null ? "vertical" : "horizontal",
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-divider": Divider;
  }
}
