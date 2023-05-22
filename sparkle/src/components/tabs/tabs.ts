import getCssSize from "sparkle-style-transformer/utils/getCssSize.js";
import type SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { Properties } from "../../types/properties";
import { SizeName } from "../../types/sizeName";
import { animationsComplete } from "../../utils/animationsComplete";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getDependencyNameMap } from "../../utils/getDependencyNameMap";
import { getKeys } from "../../utils/getKeys";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import { nextAnimationFrame } from "../../utils/nextAnimationFrame";
import type Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const styles = new CSSStyleSheet();

const CHANGING_EVENT = "changing";
const CHANGED_EVENT = "changed";

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

  async activateTab(tab: Tab): Promise<void> {
    const oldTab = this.tabs.find((tab) => tab.active);
    const newValue = tab.value;
    const changed = this.value !== newValue;
    this.value = newValue;
    tab.active = true;

    await nextAnimationFrame();
    const oldRect = oldTab?.root?.getBoundingClientRect();
    const newRect = tab?.root?.getBoundingClientRect();

    const detail = { oldRect, newRect, value: newValue };

    if (changed) {
      this.emit(CHANGING_EVENT, detail);
    }

    if (this.indicator !== "none") {
      await this.updateIndicator(tab);
    }

    if (changed) {
      this.emit(CHANGED_EVENT, detail);
    }
  }

  async deactivateTab(tab: Tab): Promise<void> {
    tab.active = false;
  }

  async updateIndicator(tab: Tab): Promise<void> {
    await nextAnimationFrame();
    const indicator = this.indicatorEl;
    const navEl = this.navEl;
    const vertical = this.vertical;
    const tabEl = tab?.root;
    if (navEl && tabEl) {
      const size = vertical ? tabEl.offsetHeight : tabEl.offsetWidth;
      const offset = vertical
        ? tabEl.offsetTop - navEl.offsetTop
        : tabEl.offsetLeft - navEl.offsetLeft;
      if (indicator) {
        if (!indicator.style.transform) {
          indicator.style.setProperty("transition", "none");
        } else {
          indicator.style.setProperty("transition", null);
        }
        indicator.style.transform = vertical
          ? `translateY(${offset}px) scaleY(${size})`
          : `translateX(${offset}px) scaleX(${size})`;

        await new Promise((resolve) => window.requestAnimationFrame(resolve));

        indicator.style.setProperty("transition", null);
        indicator.style.opacity = "1";

        await animationsComplete(indicator);
      }
    }
  }

  async updateTabs(value: string | null): Promise<void> {
    await Promise.all(
      this.tabs.map((tab) => {
        if (value === tab.value) {
          return this.activateTab(tab);
        } else {
          return this.deactivateTab(tab);
        }
      })
    );
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

  focusTab(tab: Tab, activate: boolean) {
    for (var i = 0; i < this.tabs.length; i += 1) {
      var t = this.tabs[i];
      if (t === tab) {
        tab.focus();
        if (activate) {
          this.updateTabs(tab.value);
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
      this.updateTabs(tab.value);
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
    this.updateTabs(tab.value);
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
    changing: SparkleEvent;
    changed: SparkleEvent;
  }
}
