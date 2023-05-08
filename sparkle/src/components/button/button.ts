import SparkleElement from "../../core/sparkle-element";
import { getCssIcon } from "../../utils/getCssIcon";
import { getCssMask } from "../../utils/getCssMask";
import { getCssSize } from "../../utils/getCssSize";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import css from "./button.css";
import html from "./button.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_BUTTON_DEPENDENCIES = {
  "s-badge": "s-badge",
  "s-progress-circle": "s-progress-circle",
  "s-ripple": "s-ripple",
  "s-icon": "s-icon",
};

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button extends SparkleElement {
  static override dependencies = DEFAULT_BUTTON_DEPENDENCIES;

  static override async define(
    tag = "s-button",
    dependencies = DEFAULT_BUTTON_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Button.augment(
      this.href
        ? html.replace("<button ", "<a ").replace("</button>", "</a>")
        : html,
      DEFAULT_BUTTON_DEPENDENCIES
    );
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [
      ...super.observedAttributes,
      "aria-expanded",
      "aria-haspopup",
      "href",
      "target",
      "type",
      "autofocus",
      "disabled",
      "variant",
      "icon",
      "label",
      "action",
    ];
  }

  /**
   * The URL that the link button points to.
   */
  get href(): string | null {
    return this.getStringAttribute("href");
  }

  /**
   * Where to display the linked `href` URL for a link button. Common options
   * include `_blank` to open in a new tab.
   */
  get target(): string | null {
    return this.getStringAttribute("target");
  }

  /**
   * Determines the overall look of the button.
   */
  get variant(): "filled" | "tonal" | "outlined" | "text" | null {
    return this.getStringAttribute("variant");
  }

  /**
   * The size of the button.
   *
   * Default is `md`.
   */
  get size(): "xs" | "sm" | "md" | "lg" | null {
    return this.getStringAttribute("size");
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): string | null {
    return this.getStringAttribute("spacing");
  }

  /**
   * The button label.
   */
  get label(): string | null {
    return this.getStringAttribute("label");
  }

  /**
   * The icon to display next to the label.
   */
  get icon(): string | null {
    return this.getStringAttribute("icon");
  }

  /**
   * The action to perform when clicking this button.
   */
  get action(): string | null {
    return this.getStringAttribute("action");
  }

  get labelEl(): HTMLElement | null {
    return this.getElementByClass("label");
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get spinnerEl(): HTMLElement | null {
    return this.getElementByClass("spinner");
  }

  get progressCircle(): ProgressCircle | null {
    return this.getElementByTag<ProgressCircle>(
      Button.dependencies["s-progress-circle"]
    );
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Button.dependencies["s-ripple"]);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (
      name === "aria-haspopup" ||
      name === "aria-expanded" ||
      name === "href" ||
      name === "target" ||
      name === "type" ||
      name === "autofocus"
    ) {
      this.updateRootAttribute(name, newValue);
    }
    if (name === "disabled") {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === "loading") {
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
      this.updateRootCssVariable(name, getCssIcon(newValue));
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === "loading") {
      const loading = newValue != null;
      const ripple = this.ripple;
      const labelEl = this.labelEl;
      const iconEl = this.iconEl;
      const spinnerEl = this.spinnerEl;
      if (ripple) {
        ripple.hidden = loading;
      }
      if (labelEl) {
        labelEl.ariaHidden = loading ? "true" : null;
      }
      if (iconEl) {
        iconEl.ariaHidden = loading ? "true" : null;
      }
      if (spinnerEl) {
        spinnerEl.hidden = !loading;
      }
    }
    if (name === "label") {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label);
      }
    }
  }

  protected override onConnected(): void {
    const label = this.label;
    if (label) {
      this.setAssignedToSlot(label);
    }
    const icon = this.icon;
    const iconEl = this.iconEl;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    this.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    this.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (): void => {
    const action = this.action;
    if (action) {
      const [id, attr] = action.split(":");
      if (id && attr) {
        const siblings =
          (this.parentElement?.childNodes as NodeListOf<HTMLElement>) || [];
        const element = [this.parentElement, ...Array.from(siblings)].find(
          (sibling) =>
            (sibling as HTMLElement)?.getAttribute?.("id") === id.trim()
        );
        if (element) {
          const [attrName, attrValue] = attr.split("=");
          if (attrName) {
            if (attrName.startsWith("!") && !attrValue) {
              const attr = attrName.slice(1);
              if (element.getAttribute(attr) != null) {
                element.removeAttribute(attr);
              } else {
                element.setAttribute(attr, attrValue || "");
              }
            } else {
              if (attrValue === "null") {
                element.removeAttribute(attrName);
              } else {
                element.setAttribute(attrName, attrValue || "");
              }
            }
          }
        }
      }
    }
  };

  protected override onContentAssigned(slot: HTMLSlotElement): void {
    const nodes = slot?.assignedNodes?.();
    nodes.forEach((node) => {
      if (node.nodeName.toLowerCase() === Button.dependencies["s-badge"]) {
        const el = node as HTMLElement;
        el.setAttribute("float", this.getAttribute("rtl") ? "left" : "right");
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-button": Button;
  }
}
