import { getCssIcon } from "../../../../sparkle-transformer/src/utils/getCssIcon";
import { getCssMask } from "../../../../sparkle-transformer/src/utils/getCssMask";
import { getCssSize } from "../../../../sparkle-transformer/src/utils/getCssSize";
import Icons from "../../configs/icons";
import SparkleElement from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import css from "./button.css";
import html from "./button.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const DEFAULT_DEPENDENCIES = getDependencyNameMap([
  "s-badge",
  "s-progress-circle",
  "s-ripple",
  "s-icon",
]);

export const DEFAULT_TRANSFORMERS = {
  icon: (v: string) => getCssIcon(v, Icons.all()),
  spacing: getCssSize,
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "href",
  "target",
  "type",
  "autofocus",
  "disabled",
  "variant",
  "label",
  "action",
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-button";

  static override dependencies = { ...DEFAULT_DEPENDENCIES };

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html() {
    return Button.augment(
      this.href
        ? html.replace("<button ", "<a ").replace("</button>", "</a>")
        : html,
      DEFAULT_DEPENDENCIES
    );
  }

  override get styles() {
    return [styles];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
  }

  /**
   * The default behavior of the button. Possible values are:
   *
   * `submit`: The button submits the form data to the server.
   * `reset`: The button resets all the controls to their initial values.
   * `button`: The button has no default behavior, and does nothing when pressed by default.
   */
  get type(): string | null {
    return this.getStringAttribute(Button.attributes.type);
  }
  set type(value) {
    this.setStringAttribute(Button.attributes.type, value);
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
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Button.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Button.attributes.icon, value);
  }

  /**
   * The size of the button.
   *
   * Default is `md`.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Button.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Button.attributes.size, value);
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): SizeName | string | null {
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
      name === Button.attributes.ariaHasPopup ||
      name === Button.attributes.ariaExpanded ||
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
    if (name === Button.attributes.icon) {
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
