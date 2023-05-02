import SparkleElement from "../../core/sparkle-element";
import { getCssIcon } from "../../utils/getCssIcon";
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

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "disabled") {
      this.updateRootAttribute("tabindex", newValue != null ? "-1" : "0");
      this.updateRootAttribute(
        "aria-disabled",
        newValue != null ? "true" : "false"
      );
    }
    if (name === "disabled" || name === "loading") {
      if (newValue != null) {
        this.ripple?.setAttribute("disabled", "");
      } else {
        this.ripple?.removeAttribute("disabled");
      }
    }
    if (name === "active") {
      this.updateRootAttribute(
        "aria-selected",
        newValue != null ? "true" : "false"
      );
    }
    if (name === "icon") {
      if (this.active) {
        this.updateRootStyle("--icon", getCssIcon(newValue, "-fill"));
      } else {
        this.updateRootStyle("--icon", getCssIcon(newValue));
      }
    }
    if (name === "active") {
      if (this.icon != null) {
        if (this.active) {
          this.updateRootStyle("--icon", getCssIcon(this.icon, "-fill"));
        } else {
          this.updateRootStyle("--icon", getCssIcon(this.icon));
        }
      }
    }
    if (name === "spacing") {
      this.updateRootStyle("--spacing", getCssSize(newValue));
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.ripple?.bind?.(this.root);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ripple?.unbind?.(this.root);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tab": Tab;
  }
}
