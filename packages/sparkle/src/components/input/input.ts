import {
  getCssColor,
  getCssMask,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_input";

const DEFAULT_TRANSFORMERS = {
  "placeholder-color": getCssColor,
};

export default class Input extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
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
    if (name === this.attrs.disabled) {
      const ripple = this.refs.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === this.attrs.mask) {
      const ripple = this.refs.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
  }

  override onConnected() {
    const ripple = this.refs.ripple;
    if (ripple) {
      ripple?.bind?.(this.root);
    }
  }

  override onDisconnected() {
    const ripple = this.refs.ripple;
    if (ripple) {
      ripple?.unbind?.(this.root);
    }
  }

  select() {
    this.refs.input.select();
  }

  unselect() {
    this.refs.input.blur();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sl-input": Input;
  }
}
