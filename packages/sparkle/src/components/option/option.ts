import {
  getCssIcon,
  getCssMask,
  getCssSize,
} from "../../../../sparkle-style-transformer/src/utils/transformers";
import { SparkleComponent } from "../../core/sparkle-component";
import spec from "./_option";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_TRANSFORMERS = {
  icon: (v: string) => getCssIcon(v),
  "active-icon": (v: string) => getCssIcon(v),
  spacing: getCssSize,
  size: getCssSize,
  "icon-size": getCssSize,
};

/**
 * Options represent actions that are available to the user.
 */
export default class Option extends SparkleComponent(
  spec,
  DEFAULT_TRANSFORMERS,
) {
  structuralAttributes = [
    "type",
    "href",
    "icon",
    "active-icon",
    "disable-ripple",
  ];

  override shouldAttributeTriggerUpdate(
    name: string,
    oldValue: string,
    newValue: string,
  ) {
    if (this.structuralAttributes.includes(name as any)) {
      return true;
    }
    return super.shouldAttributeTriggerUpdate(name, oldValue, newValue);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (
      name === this.attrs.ariaHasPopup ||
      name === this.attrs.ariaExpanded ||
      name === this.attrs.autofocus ||
      name === this.attrs.href
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
    this.refs.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  override onDisconnected() {
    this.refs.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent) => {
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
    }
  };

  emitChange(value: string | null) {
    const rect = this.root?.getBoundingClientRect();
    const detail = { key: this.key, oldRect: rect, newRect: rect, value };
    this.emit(CHANGING_EVENT, detail);
    this.emit(CHANGED_EVENT, detail);
  }

  override onContentAssigned(children: Element[]) {
    const nodes = children;
    nodes.forEach((node) => {
      if (node.nodeName.toLowerCase() === this.selectors.badge) {
        const el = node as HTMLElement;
        el.setAttribute("float", this.getAttribute("rtl") ? "left" : "right");
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-option": Option;
  }
}
