import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssIcon } from "../../utils/getCssIcon";
import { getCssMask } from "../../utils/getCssMask";
import { getCssSize } from "../../utils/getCssSize";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import css from "./button.css";
import html from "./button.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_BUTTON_DEPENDENCIES = getDependencyNameMap([
  "s-badge",
  "s-progress-circle",
  "s-ripple",
  "s-icon",
]);

export const DEFAULT_BUTTON_ATTRIBUTES = getAttributeNameMap([
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
  "size",
  "spacing",
]);

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button extends SparkleElement {
  static override tagName = "s-button";

  static override dependencies = { ...DEFAULT_BUTTON_DEPENDENCIES };

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_BUTTON_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_BUTTON_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
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

  /**
   * The URL that the link button points to.
   */
  get href(): string | null {
    return this.getStringAttribute(Button.attributes.href);
  }
  set href(value) {
    this.setStringAttribute(Button.attributes.href, value);
  }

  /**
   * Where to display the linked `href` URL for a link button. Common options
   * include `_blank` to open in a new tab.
   */
  get target(): string | null {
    return this.getStringAttribute(Button.attributes.target);
  }
  set target(value) {
    this.setStringAttribute(Button.attributes.target, value);
  }

  /**
   * Determines the overall look of the button.
   */
  get variant(): "filled" | "tonal" | "outlined" | "text" | null {
    return this.getStringAttribute(Button.attributes.variant);
  }
  set variant(value) {
    this.setStringAttribute(Button.attributes.variant, value);
  }

  /**
   * The size of the button.
   *
   * Default is `md`.
   */
  get size(): "xs" | "sm" | "md" | "lg" | null {
    return this.getStringAttribute(Button.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Button.attributes.size, value);
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): string | null {
    return this.getStringAttribute(Button.attributes.spacing);
  }
  set spacing(value) {
    this.setStringAttribute(Button.attributes.spacing, value);
  }

  /**
   * The button label.
   */
  get label(): string | null {
    return this.getStringAttribute(Button.attributes.label);
  }
  set label(value) {
    this.setStringAttribute(Button.attributes.label, value);
  }

  /**
   * The icon to display next to the label.
   */
  get icon(): string | null {
    return this.getStringAttribute(Button.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Button.attributes.icon, value);
  }

  /**
   * The action to perform when clicking this button.
   */
  get action(): string | null {
    return this.getStringAttribute(Button.attributes.action);
  }
  set action(value) {
    this.setStringAttribute(Button.attributes.action, value);
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
      Button.dependencies.progressCircle
    );
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Button.dependencies.ripple);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (
      name === "aria-haspopup" ||
      name === "aria-expanded" ||
      name === Button.attributes.href ||
      name === Button.attributes.target ||
      name === Button.attributes.type ||
      name === Button.attributes.autofocus
    ) {
      this.updateRootAttribute(name, newValue);
    }
    if (name === Button.attributes.disabled) {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Button.attributes.loading) {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Button.attributes.mask) {
      const ripple = this.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Button.attributes.spacing) {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
    if (name === Button.attributes.icon) {
      this.updateRootCssVariable(name, getCssIcon(newValue));
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === Button.attributes.loading) {
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
    if (name === Button.attributes.label) {
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
      if (node.nodeName.toLowerCase() === Button.dependencies.badge) {
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
