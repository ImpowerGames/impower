import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { SizeName } from "../../types/sizeName";
import spec from "./_option";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v),
  "active-icon": (v: string) => getCssIcon(v),
  spacing: getCssSize,
  size: getCssSize,
  "icon-size": getCssSize,
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
  static override get tag() {
    return spec.tag;
  }

  override get props() {
    return {
      ...super.props,
      type: this.type,
      href: this.href,
      icon: this.icon,
      activeIcon: this.activeIcon,
    };
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
      state: this.state,
      props: this.props,
    });
  }

  override get css() {
    return spec.css;
  }

  override get selectors() {
    return spec.selectors;
  }

  override get ref() {
    return super.ref as RefMap<typeof this.selectors>;
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
    return this.getStringAttribute(Option.attrs.key);
  }
  set key(value) {
    this.setStringAttribute(Option.attrs.key, value);
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
    return this.getStringAttribute(Option.attrs.type);
  }
  set type(value) {
    this.setStringAttribute(Option.attrs.type, value);
  }

  /**
   * The URL that the link button points to.
   * (Component will be wrapped in `a` instead of `button`)
   */
  get href(): string | null {
    return this.getStringAttribute(Option.attrs.href);
  }
  set href(value) {
    this.setStringAttribute(Option.attrs.href, value);
  }

  /**
   * Draws the option in an active state.
   */
  get active(): boolean {
    return this.getBooleanAttribute(Option.attrs.active);
  }
  set active(value: boolean) {
    this.setBooleanAttribute(Option.attrs.active, value);
  }

  /**
   * The value this option is associated with.
   */
  get value(): string | null {
    return this.getStringAttribute(Option.attrs.value);
  }
  set value(value) {
    this.setStringAttribute(Option.attrs.value, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): string | null {
    return this.getStringAttribute(Option.attrs.icon);
  }
  set icon(value) {
    this.setStringAttribute(Option.attrs.icon, value);
  }

  /**
   * The name of the icon to display when this option is active.
   */
  get activeIcon(): string | null {
    return this.getStringAttribute(Option.attrs.activeIcon);
  }
  set activeIcon(value) {
    this.setStringAttribute(Option.attrs.activeIcon, value);
  }
  /**
   * The size of the option.
   *
   * Default is `md`.
   */
  get size(): SizeName | string | null {
    return this.getStringAttribute(Option.attrs.size);
  }
  set size(value) {
    this.setStringAttribute(Option.attrs.size, value);
  }

  /**
   * The size of the icon.
   */
  get iconSize(): SizeName | string | null {
    return this.getStringAttribute(Option.attrs.iconSize);
  }
  set iconSize(value) {
    this.setStringAttribute(Option.attrs.iconSize, value);
  }

  /**
   * The spacing between the icon and the label.
   */
  get spacing(): SizeName | string | null {
    return this.getStringAttribute(Option.attrs.spacing);
  }
  set spacing(value) {
    this.setStringAttribute(Option.attrs.spacing, value);
  }

  /**
   * The option label.
   */
  get label(): string | null {
    return this.getStringAttribute(Option.attrs.label);
  }
  set label(value) {
    this.setStringAttribute(Option.attrs.label, value);
  }

  /**
   * The action to perform when clicking this option.
   */
  get action(): string | null {
    return this.getStringAttribute(Option.attrs.action);
  }
  set action(value) {
    this.setStringAttribute(Option.attrs.action, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (
      name === Option.attrs.ariaHasPopup ||
      name === Option.attrs.ariaExpanded ||
      name === Option.attrs.autofocus ||
      name === Option.attrs.href
    ) {
      this.updateRootAttribute(name, newValue);
    }
    if (name === Option.attrs.disabled) {
      const ripple = this.ref.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Option.attrs.mask) {
      const ripple = this.ref.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Option.attrs.icon) {
      const iconEl = this.ref.icon;
      if (iconEl) {
        iconEl.hidden = newValue == null;
      }
    }
    if (name === Option.attrs.label) {
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
    const iconEl = this.ref.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    this.ref.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
  }

  override onDisconnected() {
    this.ref.ripple?.unbind?.(this.root);
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

  protected override onContentAssigned(children: Element[]) {
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
