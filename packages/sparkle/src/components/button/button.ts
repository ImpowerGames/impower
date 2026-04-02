import {
  getCssColor,
  getCssIcon,
  getCssMask,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_button";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_TRANSFORMERS = {
  icon: getCssIcon,
  color: getCssColor,
  spacing: getCssSize,
  size: getCssSize,
  "active-icon": getCssIcon,
  "active-color": getCssColor,
  "icon-size": getCssSize,
};

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  structuralAttributes = [
    "type",
    "href",
    "accept",
    "multiple",
    "icon",
    "active-icon",
    "variant",
    "disable-ripple",
  ];

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
    if (
      name === this.attrs.ariaHasPopup ||
      name === this.attrs.ariaExpanded ||
      name === this.attrs.href ||
      name === this.attrs.target ||
      name === this.attrs.type ||
      name === this.attrs.autofocus
    ) {
      this.updateRootAttribute(name, newValue);
    }
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
    if (name === this.attrs.icon) {
      const iconEl = this.refs.icon;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === this.attrs.label) {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label);
      }
    }
    if (name === this.attrs.activeLabel) {
      const activeLabel = newValue;
      if (activeLabel) {
        this.setAssignedToSlot(activeLabel, "active-label");
      }
    }
    if (name === this.attrs.active) {
      const active = newValue != null;
      this.updateRootAttribute(
        this.attrs.ariaChecked,
        active ? "true" : "false",
      );
    }
  }

  override onConnected() {
    const label = this.label;
    if (label) {
      this.setAssignedToSlot(label);
    }
    const icon = this.icon;
    const iconEl = this.refs.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const inputEl = this.refs.input;
    if (inputEl) {
      inputEl.addEventListener("change", this.handleInputChange);
      this.bindFocus(inputEl);
    }
    const rippleEl = this.refs.ripple;
    rippleEl?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  override onDisconnected() {
    const inputEl = this.refs.input;
    if (inputEl) {
      inputEl.removeEventListener("change", this.handleInputChange);
      this.unbindFocus(inputEl);
    }
    const rippleEl = this.refs.ripple;
    rippleEl?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent) => {
    if (this.disabled) {
      e.stopPropagation();
      e.preventDefault();
    } else {
      const value = this.value;
      const type = this.type;
      if (type === "toggle") {
        const newActive = !this.active;
        this.active = newActive;
        if (value) {
          this.emitChange(newActive ? value : null);
        } else {
          this.emitChange(newActive ? "on" : null);
        }
      } else {
        if (value) {
          this.emitChange(value);
        }
      }
    }
  };

  protected handleInputChange = (e: Event) => {
    const propagatableEvent = new Event(e.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    Object.defineProperty(propagatableEvent, "target", {
      writable: false,
      value: e.target,
    });
    return this.dispatchEvent(propagatableEvent);
  };

  emitChange(value: string | null) {
    const rect = this.root?.getBoundingClientRect();
    const detail = { key: this.key, oldRect: rect, newRect: rect, value };
    this.emit(CHANGING_EVENT, detail);
    this.emit(CHANGED_EVENT, detail);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-button": Button;
  }
  interface HTMLElementEventMap {
    changing: CustomEvent;
    changed: CustomEvent;
  }
}
