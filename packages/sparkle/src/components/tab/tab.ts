import {
  getCssColor,
  getCssIcon,
  getCssMask,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_tab";

const DEFAULT_TRANSFORMERS = {
  icon: getCssIcon,
  "active-icon": getCssIcon,
  "icon-size": getCssSize,
  "active-text-color": getCssColor,
  "inactive-text-color": getCssColor,
  "active-background-color": getCssColor,
  "inactive-background-color": getCssColor,
  "active-border-color": getCssColor,
  "inactive-border-color": getCssColor,
  "hover-color": getCssColor,
};

/**
 * Tabs are used to represent and activate panels.
 */
export default class Tab extends SparkleComponent(spec, DEFAULT_TRANSFORMERS) {
  structuralAttributes = ["icon", "active-icon", "disable-ripple"];

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
      this.updateRootAttribute(
        this.attrs.tabIndex,
        newValue != null ? "-1" : "0",
      );
      this.updateRootAttribute(
        this.attrs.ariaDisabled,
        newValue != null ? "true" : "false",
      );
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
    if (name === this.attrs.icon) {
      const iconEl = this.refs.icon;
      if (iconEl) {
        iconEl.hidden = name == null;
      }
    }
    if (name === this.attrs.active) {
      const active = newValue != null;
      this.updateRootAttribute(
        this.attrs.ariaSelected,
        active ? "true" : "false",
      );
      this.updateRootAttribute(this.attrs.tabIndex, active ? "0" : "-1");
    }
  }

  override onConnected() {
    this.refs.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
    const icon = this.icon;
    const iconEl = this.refs.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const active = this.active;
    this.updateRootAttribute(
      this.attrs.ariaSelected,
      active ? "true" : "false",
    );
    this.updateRootAttribute(this.attrs.tabIndex, active ? "0" : "-1");
  }

  override onDisconnected() {
    this.refs.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tab": Tab;
  }
}
