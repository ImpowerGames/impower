import getCssSize from "../../../../sparkle-style-transformer/src/utils/getCssSize";
import SparkleElement, {
  DEFAULT_SPARKLE_ATTRIBUTES,
  DEFAULT_SPARKLE_TRANSFORMERS,
} from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import { getSlotChildren } from "../../utils/getSlotChildren";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import type Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-tab"]);

export const DEFAULT_TRANSFORMERS = {
  ...DEFAULT_SPARKLE_TRANSFORMERS,
  "indicator-width": getCssSize,
};

const DEFAULT_ATTRIBUTES = {
  ...DEFAULT_SPARKLE_ATTRIBUTES,
  ...getAttributeNameMap([
    "indicator",
    "vertical",
    "value",
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
  static override tagName = "s-tabs";

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
    return Tabs.augmentHtml(html, DEFAULT_DEPENDENCIES);
  }

  override get css() {
    return Tabs.augmentCss(css, DEFAULT_DEPENDENCIES);
  }

  override get transformers() {
    return DEFAULT_TRANSFORMERS;
  }

  /**
   * The placement of the indicator relative to the tabs.
   *
   * Defaults to "after".
   */
  get indicator(): "" | "before" | "after" | "none" | null {
    return this.getStringAttribute(Tabs.attributes.indicator);
  }
  set indicator(value) {
    this.setStringAttribute(Tabs.attributes.indicator, value);
  }

  /**
   * Orients the tabs vertically.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute(Tabs.attributes.vertical);
  }
  set vertical(value) {
    this.setStringAttribute(Tabs.attributes.vertical, value);
  }

  /**
   * The value of the active tab.
   */
  get value(): string | null {
    return this.getStringAttribute(Tabs.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(Tabs.attributes.value, value);
  }

  /**
   * The width of the indicator.
   */
  get indicatorWidth(): SizeName | string | null {
    return this.getStringAttribute(Tabs.attributes.indicatorWidth);
  }
  set indicatorWidth(value) {
    this.setStringAttribute(Tabs.attributes.indicatorWidth, value);
  }

  protected _tabs: Tab[] = [];
  get tabs(): Tab[] {
    return this._tabs;
  }

  get indicatorEl(): HTMLElement | null {
    return this.getElementByClass("indicator");
  }

  get navEl(): HTMLElement | null {
    return this.getElementByClass("nav");
  }

  protected _pointerDownOnAnyTab?: boolean;

  protected _activatingValue: string | null = null;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Tabs.attributes.indicator) {
      this.updateTabs(false);
      const indicatorEl = this.indicatorEl;
      if (indicatorEl) {
        indicatorEl.hidden = newValue === "none";
      }
    }
    if (name === Tabs.attributes.vertical) {
      const vertical = newValue != null;
      this.updateRootAttribute(
        Tabs.attributes.ariaOrientation,
        vertical ? "vertical" : "horizontal"
      );
      this.updateTabs(false);
    }
  }

  protected override onConnected(): void {
    this._activatingValue = this.value;
    const indicator = this.indicator;
    const indicatorEl = this.indicatorEl;
    if (indicatorEl) {
      indicatorEl.hidden = indicator === "none";
    }
    const vertical = this.vertical;
    this.updateRootAttribute(
      Tabs.attributes.ariaOrientation,
      vertical ? "vertical" : "horizontal"
    );
  }

  protected override onParsed(): void {
    this.setupTabs(getSlotChildren(this, this.contentSlot));
  }

  protected override onDisconnected(): void {
    this.unbindTabs();
  }

  async activateTab(tab: Tab, animate: boolean): Promise<void> {
    const oldTab = this.tabs.find((tab) => tab.active);
    const newValue = tab.value;
    const changed = this.value !== newValue;
    this.value = newValue;

    if (oldTab === tab) {
      return;
    }

    await nextAnimationFrame();
    if (this.interrupted(newValue)) {
      return;
    }

    const oldRect = oldTab?.root?.getBoundingClientRect();
    const newRect = tab?.root?.getBoundingClientRect();
    const detail = { oldRect, newRect, value: newValue };

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
      tab.labelEl,
      tab.iconEl,
      tab.inactiveIconEl,
      tab.activeIconEl,
      this.indicatorEl
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
    oldTab?: Tab
  ): Promise<void> {
    const indicator = this.indicatorEl;
    const navEl = this.navEl;
    const vertical = this.vertical;
    const tabEl = tab?.root;

    if (!navEl || !tabEl || !indicator) {
      return;
    }

    tab.state = "activating";
    if (oldTab) {
      oldTab.state = "deactivating";
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
    indicator.style.setProperty("display", "flex");

    await nextAnimationFrame();
    if (this.interrupted(newValue)) {
      return;
    }

    indicator.style.setProperty("transform", transform);

    await animationsComplete(indicator);
    if (this.interrupted(newValue)) {
      return;
    }

    indicator.style.setProperty("display", "none");

    tab.state = null;
    if (oldTab) {
      oldTab.state = null;
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

  bindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.root.addEventListener("pointerdown", this.handlePointerDownTab, {
        passive: true,
      });
      tab.root.addEventListener("pointerenter", this.handlePointerEnterTab, {
        passive: true,
      });
      tab.root.addEventListener("keydown", this.handleKeyDownTab, {
        passive: true,
      });
      tab.root.addEventListener("click", this.handleClickTab, {
        passive: true,
      });
      window.addEventListener("pointerup", this.handlePointerUp, {
        passive: true,
      });
    });
  }

  unbindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.root.removeEventListener("pointerdown", this.handlePointerDownTab);
      tab.root.removeEventListener("pointerenter", this.handlePointerEnterTab);
      tab.root.removeEventListener("keydown", this.handleKeyDownTab);
      tab.root.removeEventListener("click", this.handleClickTab);
      window.removeEventListener("pointerup", this.handlePointerUp);
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

  handlePointerDownTab = (e: PointerEvent): void => {
    this._pointerDownOnAnyTab = true;
  };

  handlePointerEnterTab = (e: PointerEvent): void => {
    if (e.currentTarget instanceof HTMLElement) {
      const tab = (e.currentTarget.getRootNode() as ShadowRoot)?.host as Tab;
      if (this._pointerDownOnAnyTab) {
        this._activatingValue = tab.value;
        this.updateTabs(true);
      }
    }
  };

  handlePointerUp = (e: PointerEvent): void => {
    this._pointerDownOnAnyTab = false;
  };

  handleKeyDownTab = (e: KeyboardEvent): void => {
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

  handleClickTab = (e: MouseEvent): void => {
    if (e.currentTarget instanceof HTMLElement) {
      const tab = (e.currentTarget.getRootNode() as ShadowRoot)?.host as Tab;
      this._activatingValue = tab.value;
      this.updateTabs(true);
    }
  };

  protected setupTabs(children: Element[]): void {
    this.unbindTabs();
    this._tabs = children.filter(
      (el) => el.tagName.toLowerCase() === Tabs.dependencies.tab
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
