import SparkleElement from "../../core/sparkle-element";
import { getCssIcon } from "../../utils/getCssIcon";
import { getCssMask } from "../../utils/getCssMask";
import { getCssSize } from "../../utils/getCssSize";
import type Ripple from "../ripple/ripple";
import css from "./tab.css";
import html from "./tab.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_TAB_DEPENDENCIES = {
  "s-ripple": "s-ripple",
};

/**
 * Tabs are used to represent and activate panels.
 */
export default class Tab extends SparkleElement {
  static override dependencies = DEFAULT_TAB_DEPENDENCIES;

  static override async define(
    tag = "s-tab",
    dependencies = DEFAULT_TAB_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Tab.augment(html, DEFAULT_TAB_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "active", "value", "disabled", "icon"];
  }

  /**
   * Draws the tab in an active state.
   */
  get active(): boolean {
    return this.getBooleanAttribute("active");
  }
  set active(value: boolean) {
    this.setBooleanAttribute("active", value);
  }

  /**
   * The value this tab is associated with.
   */
  get value(): string | null {
    return this.getStringAttribute("value");
  }

  /**
   * The icon to display next to the label.
   */
  get icon(): string | null {
    return this.getStringAttribute("icon");
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Tab.dependencies["s-ripple"]);
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "disabled") {
      this.updateRootAttribute("tabindex", newValue != null ? "-1" : "0");
      this.updateRootAttribute(
        "aria-disabled",
        newValue != null ? "true" : "false"
      );
    }
    if (name === "disabled") {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === "mask") {
      const ripple = this.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === "spacing") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === "icon") {
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = name == null;
      }
      if (this.active) {
        this.updateRootCssVariable(name, getCssIcon(newValue, "-fill"));
      } else {
        this.updateRootCssVariable(name, getCssIcon(newValue));
      }
    }
    if (name === "active") {
      const active = newValue != null;
      this.updateRootAttribute("aria-selected", active ? "true" : "false");
      this.updateRootAttribute("tabindex", active ? "0" : "-1");
      const icon = this.icon;
      if (icon != null) {
        if (active) {
          this.updateRootCssVariable("--icon", getCssIcon(icon, "-fill"));
        } else {
          this.updateRootCssVariable("--icon", getCssIcon(icon));
        }
      }
    }
  }

  protected override onConnected(): void {
    this.ripple?.bind?.(this.root);
    const icon = this.icon;
    const iconEl = this.iconEl;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const active = this.active;
    this.updateRootAttribute("aria-selected", active ? "true" : "false");
    this.updateRootAttribute("tabindex", active ? "0" : "-1");
  }

  protected override onDisconnected(): void {
    this.ripple?.unbind?.(this.root);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tab": Tab;
  }
}
