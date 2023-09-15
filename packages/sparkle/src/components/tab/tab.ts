import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import STYLES from "../../../../spec-component/src/caches/STYLE_CACHE";
import { RefMap } from "../../../../spec-component/src/component";
import { Properties } from "../../../../spec-component/src/types/Properties";
import getAttributeNameMap from "../../../../spec-component/src/utils/getAttributeNameMap";
import getKeys from "../../../../spec-component/src/utils/getKeys";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { SizeName } from "../../types/sizeName";
import spec from "./_tab";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, STYLES.icons),
  "active-icon": (v: string) => getCssIcon(v, STYLES.icons),
  "icon-size": getCssSize,
  "hover-color": getCssColor,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "active",
    "value",
    "disabled",
    "status",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Tabs are used to represent and activate panels.
 */
export default class Tab
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
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
   * Draws the tab in an active state.
   */
  get active(): boolean {
    return this.getBooleanAttribute(Tab.attrs.active);
  }
  set active(value: boolean) {
    this.setBooleanAttribute(Tab.attrs.active, value);
  }

  /**
   * The value this tab is associated with.
   */
  get value(): string | null {
    return this.getStringAttribute(Tab.attrs.value);
  }
  set value(value) {
    this.setStringAttribute(Tab.attrs.value, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Tab.attrs.icon);
  }
  set icon(value) {
    this.setStringAttribute(Tab.attrs.icon, value);
  }

  /**
   * The name of the icon to display when this tab is active.
   */
  get activeIcon(): IconName | string | null {
    return this.getStringAttribute(Tab.attrs.activeIcon);
  }
  set activeIcon(value) {
    this.setStringAttribute(Tab.attrs.activeIcon, value);
  }

  /**
   * The background color when the tab is hovered.
   */
  get hoverColor(): SizeName | string | null {
    return this.getStringAttribute(Tab.attrs.hoverColor);
  }
  set hoverColor(value) {
    this.setStringAttribute(Tab.attrs.hoverColor, value);
  }

  /**
   * The size of the icon.
   */
  get iconSize(): SizeName | string | null {
    return this.getStringAttribute(Tab.attrs.iconSize);
  }
  set iconSize(value) {
    this.setStringAttribute(Tab.attrs.iconSize, value);
  }

  /**
   * Reflects if the tab is in the process of activating or deactivating.
   */
  get status(): "activating" | "deactivating" | null {
    return this.getStringAttribute(Tab.attrs.status);
  }
  set status(value) {
    this.setStringAttribute(Tab.attrs.status, value);
  }

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Tab.attrs.disabled) {
      this.updateRootAttribute(
        Tab.attrs.tabIndex,
        newValue != null ? "-1" : "0"
      );
      this.updateRootAttribute(
        Tab.attrs.ariaDisabled,
        newValue != null ? "true" : "false"
      );
      const ripple = this.ref.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Tab.attrs.mask) {
      const ripple = this.ref.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Tab.attrs.icon) {
      const iconEl = this.ref.icon;
      if (iconEl) {
        iconEl.hidden = name == null;
      }
    }
    if (name === Tab.attrs.active) {
      const active = newValue != null;
      this.updateRootAttribute(
        Tab.attrs.ariaSelected,
        active ? "true" : "false"
      );
      this.updateRootAttribute(Tab.attrs.tabIndex, active ? "0" : "-1");
    }
  }

  override onConnected() {
    this.ref.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
    const icon = this.icon;
    const iconEl = this.ref.icon;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const active = this.active;
    this.updateRootAttribute(Tab.attrs.ariaSelected, active ? "true" : "false");
    this.updateRootAttribute(Tab.attrs.tabIndex, active ? "0" : "-1");
  }

  override onDisconnected() {
    this.ref.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tab": Tab;
  }
}
