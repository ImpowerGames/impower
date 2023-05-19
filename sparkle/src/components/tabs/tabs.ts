import getCssSize from "sparkle-style-transformer/utils/getCssSize.js";
import type SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { animationsComplete } from "../../utils/animate";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import type Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const styles = new CSSStyleSheet();

const ONCHANGE_EVENT = "onchange";

const DEFAULT_DEPENDENCIES = getDependencyNameMap(["s-tab"]);

export const DEFAULT_TRANSFORMERS = {
  "indicator-width": getCssSize,
};

const DEFAULT_ATTRIBUTES = getAttributeNameMap([
  "indicator",
  "vertical",
  "value",
  ...getKeys(DEFAULT_TRANSFORMERS),
]);

/**
 * Tabs indicate which child tab is currently active.
 */
export default class Tabs
  extends SparkleElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override tagName = "s-tabs";

  static override dependencies = { ...DEFAULT_DEPENDENCIES };

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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

  override get styles() {
    styles.replaceSync(Tabs.augmentCss(css, DEFAULT_DEPENDENCIES));
    return [styles];
  }

  override get transformers() {
    return { ...super.transformers, ...DEFAULT_TRANSFORMERS };
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

  protected _resizeObserver?: ResizeObserver;

  protected _pointerDown?: boolean;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === Tabs.attributes.indicator) {
      this.updateTabs(this.value);
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
      this.updateTabs(this.value);
    }
  }

  protected override onConnected(): void {
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
    this._resizeObserver = new ResizeObserver(this.handleResize);
  }

  protected override onParsed(): void {
    this._resizeObserver?.observe(this.root);
  }

  protected override onDisconnected(): void {
    this._resizeObserver?.disconnect();
    this.unbindTabs();
  }

  async updateIndicator(
    tabElement: HTMLElement,
    tabValue: string | null
  ): Promise<void> {
    if (tabElement && this.indicator !== "none") {
      const indicator = this.indicatorEl;
      const navEl = this.navEl;
      const vertical = this.vertical;
      const navRect = navEl?.getBoundingClientRect();
      const tabRect = tabElement?.getBoundingClientRect();
      if (navRect && tabRect) {
        const size = vertical ? tabRect.height : tabRect.width;
        const offset = vertical ? tabRect.y - navRect.y : tabRect.x - navRect.x;
        if (indicator) {
          if (!indicator.style.transform && !indicator.style.opacity) {
            indicator.style.setProperty("transition", "none");
          } else {
            indicator.style.setProperty("transition", null);
          }
          indicator.style.transform = vertical
            ? `translateY(${offset}px) scaleY(${size})`
            : `translateX(${offset}px) scaleX(${size})`;
          indicator.style.opacity = "1";

          if (indicator.style.transition !== "none") {
            await animationsComplete(indicator);
          }
        }
      }
    }

    this.value = tabValue;
    this.emit(ONCHANGE_EVENT);
  }

  updateTabs(value: string | null): void {
    this.tabs.forEach((tab) => {
      if (value === tab.value) {
        tab.active = true;
        this.updateIndicator(tab.root, tab.value);
      } else {
        tab.active = false;
      }
    });
  }

  bindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.addEventListener("pointerdown", this.handlePointerDownTab, {
        passive: true,
      });
      tab.addEventListener("pointerenter", this.handlePointerEnterTab, {
        passive: true,
      });
      tab.addEventListener("keydown", this.handleKeyDownTab, {
        passive: true,
      });
      tab.addEventListener("click", this.handleClickTab, {
        passive: true,
      });
      window.addEventListener("pointerup", this.handlePointerUp, {
        passive: true,
      });
    });
  }

  unbindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.removeEventListener("pointerdown", this.handlePointerDownTab);
      tab.removeEventListener("pointerenter", this.handlePointerEnterTab);
      tab.removeEventListener("keydown", this.handleKeyDownTab);
      tab.removeEventListener("click", this.handleClickTab);
      window.removeEventListener("pointerup", this.handlePointerUp);
    });
  }

  activateTab(tab: Tab): void {
    this.updateTabs(tab.value);
  }

  focusTab(tab: Tab, activate: boolean) {
    for (var i = 0; i < this.tabs.length; i += 1) {
      var t = this.tabs[i];
      if (t === tab) {
        tab.focus();
        if (activate) {
          this.activateTab(tab);
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
    this._pointerDown = true;
  };

  handlePointerEnterTab = (e: PointerEvent): void => {
    const tab = e.currentTarget as Tab;
    if (this._pointerDown) {
      this.activateTab(tab);
    }
  };

  handlePointerUp = (e: PointerEvent): void => {
    this._pointerDown = false;
  };

  handleKeyDownTab = (e: KeyboardEvent): void => {
    const tgt = e.currentTarget as Tab;
    const vertical = this.vertical;
    const dir = vertical ? "column" : "row";
    switch (e.key) {
      case navPrevKey(dir):
        {
          this.focusPreviousTab(tgt, true);
        }
        break;
      case navNextKey(dir):
        {
          this.focusNextTab(tgt, true);
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
  };

  handleClickTab = (e: MouseEvent): void => {
    const tab = e.currentTarget as Tab;
    this.activateTab(tab);
  };

  protected handleResize = (): void => {
    this.updateTabs(this.value);
  };

  protected override onContentAssigned = (children: Element[]): void => {
    this.unbindTabs();
    this._tabs = children.filter(
      (el) => el.tagName.toLowerCase() === Tabs.dependencies.tab
    ) as Tab[];
    this.bindTabs();
    this.updateTabs(this.value);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tabs": Tabs;
  }
  interface HTMLElementEventMap {
    onchange: SparkleEvent;
  }
}
