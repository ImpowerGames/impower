import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import STYLES from "../../../../spec-component/src/caches/STYLE_CACHE";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getDependencyNameMap from "../../../../spec-component/src/utils/getDependencyNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import type ProgressCircle from "../progress-circle/progress-circle";
import type Ripple from "../ripple/ripple";
import spec from "./_button";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-badge"]);

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
  "pressed-icon": (v: string) => getCssIcon(v, STYLES.icons),
  "active-icon": (v: string) => getCssIcon(v, STYLES.icons),
  "active-color": getCssColor,
  spacing: getCssSize,
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "key",
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
    "active",
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
  static override get tag() {
    return spec.tag;
  }

  override get props() {
    return {
      ...super.props,
      type: this.type,
      href: this.href,
      accept: this.accept,
      multiple: this.multiple,
    };
  }

  override get html() {
    return spec.html({ props: this.props, state: this.state });
  }

  override get css() {
    return spec.css;
  }

  static override get dependencies() {
    return DEFAULT_DEPENDENCIES;
  }

  static override get attrs() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Key that is included in all emitted events.
   */
  get key(): string | null {
    return this.getStringAttribute(Button.attrs.key);
  }
  set key(value) {
    this.setStringAttribute(Button.attrs.key, value);
  }

  /**
   * Whether or not the content of this button should be replaced with a loading spinner.
   */
  get loading(): boolean {
    return this.getBooleanAttribute(Button.attrs.loading);
  }
  set loading(value) {
    this.setStringAttribute(Button.attrs.loading, value);
  }

  /**
   * The default behavior of the button. Possible values are:
   *
   * `div`: The button is a `div` that looks like a button (the root tag will be `div` instead of `button`).
   * `a`: The button behaves like a link (the root tag will be `a` instead of `button`).
   * `file`: The button allows uploading a file (the root tag will be `label` instead of `button`).
   * `toggle`: The button can be toggled between an active and inactive state.
   * `submit`: The button submits the form data to the server.
   * `reset`: The button resets all the controls to their initial values.
   * `button`: The button has no default behavior, and does nothing when pressed by default.
   *
   * Defaults to `button`
   */
  get type():
    | "div"
    | "a"
    | "file"
    | "toggle"
    | "submit"
    | "reset"
    | "button"
    | null {
    return this.getStringAttribute(Button.attrs.type);
  }
  set type(value) {
    this.setStringAttribute(Button.attrs.type, value);
  }

  /**
   * The URL that the link button points to.
   * (Component will be wrapped in `a` instead of `button`)
   */
  get href(): string | null {
    return this.getStringAttribute(Button.attrs.href);
  }
  set href(value) {
    this.setStringAttribute(Button.attrs.href, value);
  }

  /**
   * Where to display the linked `href` URL for a link button. Common options
   * include `_blank` to open in a new tab.
   */
  get target(): string | null {
    return this.getStringAttribute(Button.attrs.target);
  }
  set target(value) {
    this.setStringAttribute(Button.attrs.target, value);
  }

  /**
   * The file types that this button will accept.
   * (Component will be wrapped in `div` instead of `button`)
   */
  get accept(): string | null {
    return this.getStringAttribute(Button.attrs.accept);
  }
  set accept(value) {
    this.setStringAttribute(Button.attrs.accept, value);
  }

  /**
   * The file types that this button will accept.
   * (Component will be wrapped in `div` instead of `button`)
   */
  get multiple(): string | null {
    return this.getStringAttribute(Button.attrs.multiple);
  }
  set multiple(value) {
    this.setStringAttribute(Button.attrs.multiple, value);
  }

  /**
   * The overall look of the button.
   */
  get variant(): "filled" | "tonal" | "outlined" | "text" | null {
    return this.getStringAttribute(Button.attrs.variant);
  }
  set variant(value) {
    this.setStringAttribute(Button.attrs.variant, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Button.attrs.icon);
  }
  set icon(value) {
    this.setStringAttribute(Button.attrs.icon, value);
  }

  /**
   * The name of the icon to display when the button is pressed.
   */
  get pressedIcon(): IconName | string | null {
    return this.getStringAttribute(Button.attrs.pressedIcon);
  }
  set pressedIcon(value) {
    this.setStringAttribute(Button.attrs.pressedIcon, value);
  }

  /**
   * The name of the icon to display when the button is toggled.
   */
  get activeIcon(): IconName | string | null {
    return this.getStringAttribute(Button.attrs.activeIcon);
  }
  set activeIcon(value) {
    this.setStringAttribute(Button.attrs.activeIcon, value);
  }

  /**
   * The color when the button is toggled.
   */
  get activeColor(): IconName | string | null {
    return this.getStringAttribute(Button.attrs.activeColor);
  }
  set activeColor(value) {
    this.setStringAttribute(Button.attrs.activeColor, value);
  }

  /**
   * The size of the button.
   *
   * Default is `md`.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Button.attrs.size);
  }
  set size(value) {
    this.setStringAttribute(Button.attrs.size, value);
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): SizeName | string | null {
    return this.getStringAttribute(Button.attrs.spacing);
  }
  set spacing(value) {
    this.setStringAttribute(Button.attrs.spacing, value);
  }

  /**
   * The button label.
   */
  get label(): string | null {
    return this.getStringAttribute(Button.attrs.label);
  }
  set label(value) {
    this.setStringAttribute(Button.attrs.label, value);
  }

  /**
   * The toggle state of this button.
   */
  get active(): boolean {
    return this.getBooleanAttribute(Button.attrs.active);
  }
  set active(value) {
    this.setBooleanAttribute(Button.attrs.active, value);
  }

  /**
   * The value this button will emit when clicked.
   */
  get value(): string | null {
    return this.getStringAttribute(Button.attrs.value);
  }
  set value(value) {
    this.setStringAttribute(Button.attrs.value, value);
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get spinnerEl(): HTMLElement | null {
    return this.getElementByClass("spinner");
  }

  get buttonEl(): HTMLElement | null {
    return this.getElementByTag("button");
  }

  get labelEl(): HTMLElement | null {
    return this.getElementByTag("label");
  }

  get inputEl(): HTMLElement | null {
    return this.getElementByTag("input");
  }

  get progressCircleEl(): ProgressCircle | null {
    return this.getElementById<ProgressCircle>("progress-circle");
  }

  get rippleEl(): Ripple | null {
    return this.getElementById<Ripple>("ripple");
  }

  override onAttributeChanged(name: string, newValue: string): void {
    if (
      name === Button.attrs.ariaHasPopup ||
      name === Button.attrs.ariaExpanded ||
      name === Button.attrs.href ||
      name === Button.attrs.target ||
      name === Button.attrs.type ||
      name === Button.attrs.autofocus
    ) {
      this.updateRootAttribute(name, newValue);
    }
    if (name === Button.attrs.disabled) {
      const ripple = this.rippleEl;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Button.attrs.loading) {
      const ripple = this.rippleEl;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Button.attrs.mask) {
      const ripple = this.rippleEl;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Button.attrs.icon) {
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === Button.attrs.loading) {
      const loading = newValue != null;
      const ripple = this.rippleEl;
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
    if (name === Button.attrs.label) {
      const label = newValue;
      if (label) {
        this.setAssignedToSlot(label);
      }
    }
    if (name === Button.attrs.active) {
      const active = newValue != null;
      this.updateRootAttribute(
        Button.attrs.ariaChecked,
        active ? "true" : "false"
      );
    }
  }

  override onConnected(): void {
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
    this.rippleEl?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  override onDisconnected(): void {
    const inputEl = this.inputEl;
    if (inputEl) {
      inputEl.removeEventListener("change", this.handleInputChange);
      this.unbindFocus(inputEl);
    }
    this.rippleEl?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent): void => {
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
  };

  protected handleInputChange = (e: Event): void => {
    const propagatableEvent = new Event(e.type, {
      bubbles: true,
      cancelable: true,
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
