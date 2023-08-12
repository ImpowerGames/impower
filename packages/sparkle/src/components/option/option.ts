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
import type Ripple from "../ripple/ripple";
import component from "./_option";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap([
  "s-badge",
  "s-ripple",
  "s-icon",
]);

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
  "active-icon": (v: string) => getCssIcon(v, STYLES.icons),
  spacing: getCssSize,
  size: getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "key",
    "type",
    "href",
    "active",
    "value",
    "autofocus",
    "disabled",
    "label",
    "action",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Options represent actions that are available to the user.
 */
export default class Option
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-option";

  static override dependencies = DEFAULT_DEPENDENCIES;

  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  static override async define(
    tagName?: string,
    dependencies = DEFAULT_DEPENDENCIES,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component({ attrs: { type: this.type, href: this.href } });
  }

  override transformHtml(html: string) {
    return Option.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override transformCss(css: string) {
    return Option.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  /**
   * Key that is included in all emitted events.
   */
  get key(): string | null {
    return this.getStringAttribute(Option.attributes.key);
  }
  set key(value) {
    this.setStringAttribute(Option.attributes.key, value);
  }

  /**
   * The default behavior of the button. Possible values are:
   *
   * `div`: The button is a `div` that looks like a button (the root tag will be `div` instead of `button`).
   * `a`: The button behaves like a link (the root tag will be `a` instead of `button`).
   * `toggle`: The button can be toggled between an active and inactive state.
   *
   * Defaults to `button`
   */
  get type(): "div" | "a" | "toggle" | null {
    return this.getStringAttribute(Option.attributes.type);
  }
  set type(value) {
    this.setStringAttribute(Option.attributes.type, value);
  }

  /**
   * The URL that the link button points to.
   * (Component will be wrapped in `a` instead of `button`)
   */
  get href(): string | null {
    return this.getStringAttribute(Option.attributes.href);
  }
  set href(value) {
    this.setStringAttribute(Option.attributes.href, value);
  }

  /**
   * Draws the option in an active state.
   */
  get active(): boolean {
    return this.getBooleanAttribute(Option.attributes.active);
  }
  set active(value: boolean) {
    this.setBooleanAttribute(Option.attributes.active, value);
  }

  /**
   * The value this option is associated with.
   */
  get value(): string | null {
    return this.getStringAttribute(Option.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(Option.attributes.value, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Option.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Option.attributes.icon, value);
  }

  /**
   * The name of the icon to display when this option is active.
   */
  get activeIcon(): IconName | string | null {
    return this.getStringAttribute(Option.attributes.activeIcon);
  }
  set activeIcon(value) {
    this.setStringAttribute(Option.attributes.activeIcon, value);
  }
  /**
   * The size of the option.
   *
   * Default is `md`.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Option.attributes.size);
  }
  set size(value) {
    this.setStringAttribute(Option.attributes.size, value);
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): SizeName | string | null {
    return this.getStringAttribute(Option.attributes.spacing);
  }
  set spacing(value) {
    this.setStringAttribute(Option.attributes.spacing, value);
  }

  /**
   * The option label.
   */
  get label(): string | null {
    return this.getStringAttribute(Option.attributes.label);
  }
  set label(value) {
    this.setStringAttribute(Option.attributes.label, value);
  }

  /**
   * The action to perform when clicking this option.
   */
  get action(): string | null {
    return this.getStringAttribute(Option.attributes.action);
  }
  set action(value) {
    this.setStringAttribute(Option.attributes.action, value);
  }

  get labelEl(): HTMLElement | null {
    return this.getElementByClass("label");
  }

  get iconEl(): HTMLElement | null {
    return this.getElementByClass("icon");
  }

  get inactiveIconEl(): HTMLElement | null {
    return this.getElementByClass("inactive-icon");
  }

  get activeIconEl(): HTMLElement | null {
    return this.getElementByClass("active-icon");
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Option.dependencies.ripple);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (
      name === Option.attributes.ariaHasPopup ||
      name === Option.attributes.ariaExpanded ||
      name === Option.attributes.autofocus ||
      name === Option.attributes.href
    ) {
      this.updateRootAttribute(name, newValue);
    }
    if (name === Option.attributes.disabled) {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Option.attributes.mask) {
      const ripple = this.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Option.attributes.icon) {
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === Option.attributes.label) {
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
    }
  };

  emitChange(value: string | null) {
    const rect = this.root?.getBoundingClientRect();
    const detail = { key: this.key, oldRect: rect, newRect: rect, value };
    this.emit(CHANGING_EVENT, detail);
    this.emit(CHANGED_EVENT, detail);
  }

  protected override onContentAssigned(children: Element[]): void {
    const nodes = children;
    nodes.forEach((node) => {
      if (node.nodeName.toLowerCase() === Option.dependencies.badge) {
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
