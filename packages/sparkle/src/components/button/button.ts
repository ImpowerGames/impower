import STYLES from "../../../../spark-element/src/caches/STYLE_CACHE";
import { Properties } from "../../../../spark-element/src/types/properties";
import getAttributeNameMap from "../../../../spark-element/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spark-element/src/utils/getDependencyNameMap";
import { getKeys } from "../../../../spark-element/src/utils/getKeys";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import component from "./_button";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap([
  "s-badge",
  "s-progress-circle",
  "s-ripple",
  "s-icon",
]);

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
  spacing: getCssSize,
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "href",
    "target",
    "accept",
    "multiple",
    "type",
    "autofocus",
    "disabled",
    "loading",
    "variant",
    "label",
    "value",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Buttons represent actions that are available to the user.
 */
export default class Button
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-button";

  static override dependencies = DEFAULT_DEPENDENCIES;

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component({
      attrs: {
        type: this.type,
        href: this.href,
        accept: this.accept,
        multiple: this.multiple,
      },
    });
  }

  override transformHtml(html: string) {
    return Button.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override transformCss(css: string) {
    return Button.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Whether or not the content of this button should be replaced with a loading spinner.
   */
  get loading(): boolean {
    return this.getBooleanAttribute(Button.attributes.loading);
  }
  set loading(value) {
    this.setStringAttribute(Button.attributes.loading, value);
  }

  /**
   * The default behavior of the button. Possible values are:
   *
   * `submit`: The button submits the form data to the server.
   * `reset`: The button resets all the controls to their initial values.
   * `button`: The button has no default behavior, and does nothing when pressed by default.
   * `file`: The button allows uploading a file.
   * `container`: The button is a container for an element that cannot be nested inside a true `button` element
   * (Component will be wrapped in `div` instead of `button`).
   */
  get type(): string | null {
    return this.getStringAttribute(Button.attributes.type);
  }
  set type(value) {
    this.setStringAttribute(Button.attributes.type, value);
  }

  /**
   * The URL that the link button points to.
   * (Component will be wrapped in `a` instead of `button`)
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
   * The file types that this button will accept.
   * (Component will be wrapped in `div` instead of `button`)
   */
  get accept(): string | null {
    return this.getStringAttribute(Button.attributes.accept);
  }
  set accept(value) {
    this.setStringAttribute(Button.attributes.accept, value);
  }

  /**
   * The file types that this button will accept.
   * (Component will be wrapped in `div` instead of `button`)
   */
  get multiple(): string | null {
    return this.getStringAttribute(Button.attributes.multiple);
  }
  set multiple(value) {
    this.setStringAttribute(Button.attributes.multiple, value);
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
   * The value this button will emit when clicked.
   */
  get value(): string | null {
    return this.getStringAttribute(Button.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(Button.attributes.value, value);
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

  get inputEl(): HTMLElement | null {
    return this.getElementByTag("input");
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
    const inputEl = this.inputEl;
    if (inputEl) {
      inputEl.addEventListener("change", this.handleInputChange);
      this.bindFocus(inputEl);
    }
    this.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  protected override onDisconnected(): void {
    const inputEl = this.inputEl;
    if (inputEl) {
      inputEl.removeEventListener("change", this.handleInputChange);
      this.unbindFocus(inputEl);
    }
    this.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent): void => {
    const value = this.value;
    if (value) {
      const rect = this.root?.getBoundingClientRect();
      const detail = { oldRect: rect, newRect: rect, value };
      this.emit(CHANGING_EVENT, detail);
      this.emit(CHANGED_EVENT, detail);
    }
  };

  protected handleInputChange = (e: Event): void => {
    const propagatableEvent = new Event(e.type, {
      bubbles: true,
      cancelable: false,
      composed: true,
    });
    Object.defineProperty(propagatableEvent, "target", {
      writable: false,
      value: e.target,
    });
    this.dispatchEvent(propagatableEvent);
  };

  protected override onContentAssigned(children: Element[]): void {
    const nodes = children;
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
  interface HTMLElementEventMap {
    changing: CustomEvent;
    changed: CustomEvent;
  }
}
