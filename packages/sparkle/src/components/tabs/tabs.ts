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
import { animationsComplete } from "../../utils/animationsComplete";
import { getSlotChildren } from "../../utils/getSlotChildren";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import type Tab from "../tab/tab";
import spec from "./_tabs";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "indicator-width": getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "key",
    "indicator",
    "vertical",
    "active",
    ...getKeys(DEFAULT_TRANSFORMERS),
  ]),
};

/**
 * Tabs indicate which child tab is currently active.
 */
export default class Tabs
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  protected _indicatorInitialized = false;

  static override get tag() {
    return spec.tag;
  }

  override get html() {
    return spec.html({
      graphics: this.graphics,
      stores: this.stores,
      context: this.context,
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
    return this.getStringAttribute(Tabs.attrs.key);
  }
  set key(value) {
    this.setStringAttribute(Tabs.attrs.key, value);
  }

  /**
   * The placement of the indicator relative to the tabs.
   *
   * Defaults to "after".
   */
  get indicator(): "" | "before" | "after" | "none" | null {
    return this.getStringAttribute(Tabs.attrs.indicator);
  }
  set indicator(value) {
    this.setStringAttribute(Tabs.attrs.indicator, value);
  }

  /**
   * Orients the tabs vertically.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(Tabs.attrs.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(Tabs.attrs.vertical, value);
  }

  /**
   * The value of the active tab.
   */
  get active(): string | null {
    return this.getStringAttribute(Tabs.attrs.active);
  }
  set active(value) {
    this.setStringAttribute(Tabs.attrs.active, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(Tabs.attrs.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(Tabs.attrs.indicatorWidth, value);
  }

  protected _tabs: Tab[] = [];
  get tabs(): Tab[] {
    return this._tabs;
  }

  protected _activatingValue: string | null = null;

  override onAttributeChanged(name: string, newValue: string) {
    if (name === Tabs.attrs.indicator) {
      this.updateTabs(false);
      const indicatorEl = this.ref.indicator;
      if (indicatorEl && newValue === "none") {
        indicatorEl.hidden = true;
      }
    }
    if (name === Tabs.attrs.vertical) {
      const vertical = newValue != null;
      this.updateRootAttribute(
        Tabs.attrs.ariaOrientation,
        vertical ? "vertical" : "horizontal"
      );
      this.updateTabs(false);
    }
  }

  override onConnected() {
    this._activatingValue = this.active;
    const indicator = this.indicator;
    const indicatorEl = this.ref.indicator;
    if (indicatorEl && indicator === "none") {
      indicatorEl.hidden = true;
    }
    const vertical = this.vertical;
    this.updateRootAttribute(
      Tabs.attrs.ariaOrientation,
      vertical ? "vertical" : "horizontal"
    );
  }

  override onParsed() {
    this.setupTabs(getSlotChildren(this, this.contentSlot));
  }

  override onDisconnected() {
    this.unbindTabs();
  }

  async activateTab(tab: Tab, animate: boolean): Promise<void> {
    const oldTab = this.tabs.find((tab) => tab.active);
    const newValue = tab.value;
    const changed = this.active !== newValue;
    this.active = newValue;

    if (oldTab === tab) {
      if (!this._indicatorInitialized) {
        this._indicatorInitialized = true;
        await this.updateIndicator(newValue, tab, oldTab, true);
      }
      return;
    }

    await nextAnimationFrame();
    if (this.interrupted(newValue)) {
      return;
    }

    const oldRect = oldTab?.root?.getBoundingClientRect();
    const newRect = tab?.root?.getBoundingClientRect();
    const detail = { key: this.key, oldRect, newRect, value: newValue };

    if (changed) {
      this.emit(CHANGING_EVENT, detail);
    }

    if (oldTab) {
      oldTab.active = false;
    }
    tab.active = true;
    if (animate && this.indicator !== "none") {
      await this.updateIndicator(newValue, tab, oldTab);
    }

    await animationsComplete(
      tab.root,
      tab.ref.label,
      tab.ref.icon,
      tab.ref.inactiveIcon,
      tab.ref.activeIcon,
      this.ref.indicator
    );
    if (this.interrupted(newValue)) {
      return;
    }

    if (changed) {
      this.emit(CHANGED_EVENT, detail);
    }
  }

  interrupted(newValue: string | null): boolean {
    return this._activatingValue !== newValue;
  }

  async deactivateTab(tab: Tab): Promise<void> {
    tab.active = false;
  }

  async updateIndicator(
    newValue: string | null,
    tab: Tab,
    oldTab?: Tab,
    instantly?: boolean
  ): Promise<void> {
    const indicator = this.ref.indicator;
    const navEl = this.ref.nav;
    const vertical = this.vertical;
    const tabEl = tab?.root;

    if (!navEl || !tabEl || !indicator) {
      return;
    }

    tab.status = "activating";
    if (oldTab) {
      oldTab.status = "deactivating";
    }

    const size = vertical ? tabEl.offsetHeight : tabEl.offsetWidth;
    const offset = vertical
      ? tabEl.offsetTop - navEl.offsetTop
      : tabEl.offsetLeft - navEl.offsetLeft;

    const transform = vertical
      ? `translateY(${offset}px)`
      : `translateX(${offset}px)`;
    if (vertical) {
      indicator.style.setProperty("height", `${size}px`);
    } else {
      indicator.style.setProperty("width", `${size}px`);
    }

    indicator.hidden = false;

    if (!instantly) {
      await nextAnimationFrame();
      if (this.interrupted(newValue)) {
        return;
      }
    }

    indicator.style.setProperty("transform", transform);

    if (!instantly) {
      await animationsComplete(indicator);
      if (this.interrupted(newValue)) {
        return;
      }
    }

    indicator.hidden = true;

    tab.status = null;
    if (oldTab) {
      oldTab.status = null;
    }
  }

  async updateTabs(animate: boolean): Promise<void> {
    await Promise.all(
      this.tabs.map((tab) => {
        if (this._activatingValue === tab.value) {
          return this.activateTab(tab, animate);
        } else {
          return this.deactivateTab(tab);
        }
      })
    );
  }

  bindTabs() {
    this.tabs.forEach((tab) => {
      tab.root.addEventListener("keydown", this.handleKeyDownTab, {
        passive: true,
      });
      tab.root.addEventListener("click", this.handleClickTab, {
        passive: true,
      });
    });
  }

  unbindTabs() {
    this.tabs.forEach((tab) => {
      tab.root.removeEventListener("keydown", this.handleKeyDownTab);
      tab.root.removeEventListener("click", this.handleClickTab);
    });
  }

  focusTab(tab: Tab, activate: boolean) {
    for (var i = 0; i < this.tabs.length; i += 1) {
      var t = this.tabs[i];
      if (t === tab) {
        tab.focus();
        if (activate) {
          this._activatingValue = tab.value;
          this.updateTabs(true);
        }
      }
    }
  }

  focusPreviousTab(tab: Tab, activate: boolean) {
    const firstTab = this.tabs[0];
    const lastTab = this.tabs[this.tabs.length - 1];
    if (tab === firstTab) {
      if (lastTab) {
        this.focusTab(lastTab, activate);
      }
    } else {
      const index = this.tabs.indexOf(tab);
      const prevTab = this.tabs[index - 1];
      if (prevTab) {
        this.focusTab(prevTab, activate);
      }
    }
  }

  focusNextTab(tab: Tab, activate: boolean) {
    const firstTab = this.tabs[0];
    const lastTab = this.tabs[this.tabs.length - 1];
    if (tab === lastTab) {
      if (firstTab) {
        this.focusTab(firstTab, activate);
      }
    } else {
      const index = this.tabs.indexOf(tab);
      const nextTab = this.tabs[index + 1];
      if (nextTab) {
        this.focusTab(nextTab, activate);
      }
    }
  }

  handleKeyDownTab = (e: KeyboardEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      const tab = (e.currentTarget.getRootNode() as ShadowRoot)?.host as Tab;
      const vertical = this.vertical;
      const dir = vertical ? "column" : "row";
      switch (e.key) {
        case navPrevKey(dir):
          {
            this.focusPreviousTab(tab, true);
          }
          break;
        case navNextKey(dir):
          {
            this.focusNextTab(tab, true);
          }
          break;
        case navStartKey():
          {
            const firstTab = this.tabs[0];
            if (firstTab) {
              this.focusTab(firstTab, true);
            }
          }
          break;
        case navEndKey():
          {
            const lastTab = this.tabs[this.tabs.length - 1];
            if (lastTab) {
              this.focusTab(lastTab, true);
            }
          }
          break;
        default:
          break;
      }
    }
  };

  handleClickTab = (e: MouseEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      const tab = (e.currentTarget.getRootNode() as ShadowRoot)?.host as Tab;
      this._activatingValue = tab.value;
      this.updateTabs(true);
    }
  };

  protected setupTabs(children: Element[]) {
    this.unbindTabs();
    this._tabs = children.filter(
      (el) => el.tagName.toLowerCase() === this.selectors.tab
    ) as Tab[];
    this.bindTabs();
    this.updateTabs(false);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tabs": Tabs;
  }
  interface HTMLElementEventMap {
    changing: CustomEvent;
    changed: CustomEvent;
  }
}
