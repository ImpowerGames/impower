import { getCssSize } from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_icon";

const DEFAULT_TRANSFORMERS = {
  "icon-size": getCssSize,
};

/**
 * Icons are symbols that can be used to represent various options within an application.
 */
export default class Icon extends SparkleComponent(spec, DEFAULT_TRANSFORMERS) {
  structuralAttributes = Object.keys(spec.props).map(
    (prop) => this.attrs[prop as keyof typeof this.attrs],
  );

  override shouldAttributeTriggerUpdate(
    name: string,
    oldValue: string,
    newValue: string,
  ) {
    if (this.structuralAttributes.includes(name)) {
      return true;
    }
    return super.shouldAttributeTriggerUpdate(name, oldValue, newValue);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === this.attrs.ariaLabel) {
      this.updateRootAttribute(this.attrs.ariaHidden, Boolean(newValue));
      this.updateRootAttribute(this.attrs.role, newValue ? "img" : null);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": Icon;
  }
}
