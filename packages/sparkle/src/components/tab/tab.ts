import getCssColor from "../../../../sparkle-style-transformer/src/utils/getCssColor";
import getCssIcon from "../../../../sparkle-style-transformer/src/utils/getCssIcon";
import getCssMask from "../../../../sparkle-style-transformer/src/utils/getCssMask";
import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import Icons from "../../configs/icons";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { IconName } from "../../types/iconName";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import type Ripple from "../ripple/ripple";
import css from "./tab.css";
import html from "./tab.html";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-ripple"]);

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  icon: (v: string) => getCssIcon(v, Icons.all()),
  "active-icon": (v: string) => getCssIcon(v, Icons.all()),
  "icon-size": getCssSize,
  "hover-color": getCssColor,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "active",
    "value",
    "disabled",
    "state",
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
  static override tagName = "s-tab";

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

  override get html() {
    return Tab.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get css() {
    return Tab.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * Draws the tab in an active state.
   */
  get active(): boolean {
    return this.getBooleanAttribute(Tab.attributes.active);
  }
  set active(value: boolean) {
    this.setBooleanAttribute(Tab.attributes.active, value);
  }

  /**
   * The value this tab is associated with.
   */
  get value(): string | null {
    return this.getStringAttribute(Tab.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(Tab.attributes.value, value);
  }

  /**
   * The name of the icon to display.
   */
  get icon(): IconName | string | null {
    return this.getStringAttribute(Tab.attributes.icon);
  }
  set icon(value) {
    this.setStringAttribute(Tab.attributes.icon, value);
  }

  /**
   * The name of the icon to display when this tab is active.
   */
  get activeIcon(): IconName | string | null {
    return this.getStringAttribute(Tab.attributes.activeIcon);
  }
  set activeIcon(value) {
    this.setStringAttribute(Tab.attributes.activeIcon, value);
  }

  /**
   * The background color when the tab is hovered.
   */
  get hoverColor(): SizeName | string | null {
    return this.getStringAttribute(Tab.attributes.hoverColor);
  }
  set hoverColor(value) {
    this.setStringAttribute(Tab.attributes.hoverColor, value);
  }

  /**
   * The size of the icon.
   */
  get iconSize(): SizeName | string | null {
    return this.getStringAttribute(Tab.attributes.iconSize);
  }
  set iconSize(value) {
    this.setStringAttribute(Tab.attributes.iconSize, value);
  }

  /**
   * Reflects if the tab is in the process of activating or deactivating.
   */
  get state(): "activating" | "deactivating" | null {
    return this.getStringAttribute(Tab.attributes.state);
  }
  set state(value) {
    this.setStringAttribute(Tab.attributes.state, value);
  }

  get ripple(): Ripple | null {
    return this.getElementByTag<Ripple>(Tab.dependencies.ripple);
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

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Tab.attributes.disabled) {
      this.updateRootAttribute(
        Tab.attributes.tabIndex,
        newValue != null ? "-1" : "0"
      );
      this.updateRootAttribute(
        Tab.attributes.ariaDisabled,
        newValue != null ? "true" : "false"
      );
    }
    if (name === Tab.attributes.disabled) {
      const ripple = this.ripple;
      if (ripple) {
        ripple.hidden = newValue != null;
      }
    }
    if (name === Tab.attributes.mask) {
      const ripple = this.ripple;
      if (ripple) {
        if (newValue) {
          const mask = getCssMask(newValue);
          ripple.root.style.webkitMask = mask;
          ripple.root.style.mask = mask;
        }
      }
    }
    if (name === Tab.attributes.icon) {
      const iconEl = this.iconEl;
      if (iconEl) {
        iconEl.hidden = name == null;
      }
    }
    if (name === Tab.attributes.active) {
      const active = newValue != null;
      this.updateRootAttribute(
        Tab.attributes.ariaSelected,
        active ? "true" : "false"
      );
      this.updateRootAttribute(Tab.attributes.tabIndex, active ? "0" : "-1");
    }
  }

  protected override onConnected(): void {
    this.ripple?.bind?.(this.root);
    this.root.addEventListener("click", this.handleClick);
    const icon = this.icon;
    const iconEl = this.iconEl;
    if (iconEl) {
      iconEl.hidden = icon == null;
    }
    const active = this.active;
    this.updateRootAttribute(
      Tab.attributes.ariaSelected,
      active ? "true" : "false"
    );
    this.updateRootAttribute(Tab.attributes.tabIndex, active ? "0" : "-1");
  }

  protected override onDisconnected(): void {
    this.ripple?.unbind?.(this.root);
    this.root.removeEventListener("click", this.handleClick);
  }

  protected handleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tab": Tab;
  }
}
