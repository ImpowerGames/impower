import SparkleEvent from "../../core/SparkleEvent";
import SparkleElement from "../../core/sparkle-element";
import { navEndKey } from "../../utils/navEndKey";
import { navNextKey } from "../../utils/navNextKey";
import { navPrevKey } from "../../utils/navPrevKey";
import { navStartKey } from "../../utils/navStartKey";
import type Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

const onchangeEvent = new SparkleEvent("onchange");

export const DEFAULT_TABS_DEPENDENCIES = {
  "s-tab": "s-tab",
};

/**
 * Tabs indicate which child tab is currently active.
 */
export default class Tabs extends SparkleElement {
  static override dependencies = DEFAULT_TABS_DEPENDENCIES;

  static override async define(
    tag = "s-tabs",
    dependencies = DEFAULT_TABS_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Tabs.augment(html, DEFAULT_TABS_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "indicator", "vertical"];
  }

  /**
   * The placement of the indicator relative to the tabs.
   *
   * Defaults to "after".
   */
  get indicator(): "" | "before" | "after" | "none" | null {
    return this.getStringAttribute("indicator");
  }

  /**
   * Orients the tabs vertically.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute("vertical");
  }

  /**
   * The value of the active tab.
   */
  get value(): string | null {
    return this.getStringAttribute("value");
  }
  set value(value: string | null) {
    this.setStringAttribute("value", value);
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
    if (name === "indicator") {
      this.updateTabs();
      const indicatorEl = this.indicatorEl;
      if (indicatorEl) {
        indicatorEl.hidden = newValue === "none";
      }
    }
    if (name === "vertical") {
      const vertical = newValue != null;
      this.updateRootAttribute(
        "aria-orientation",
        vertical ? "vertical" : "horizontal"
      );
      this.updateTabs();
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
      "aria-orientation",
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

  updateIndicator = (tabElement: HTMLElement): void => {
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
        }
      }
    }
  };

  updateTabs(): void {
    this.tabs.forEach((tab) => {
      if (this.value === tab.value) {
        tab.active = true;
        this.updateIndicator(tab.root);
      } else {
        tab.active = false;
      }
    });
  }

  bindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.addEventListener("pointerdown", this.onPointerDownTab);
      tab.addEventListener("pointerenter", this.onPointerEnterTab);
      tab.addEventListener("keydown", this.onKeyDown);
      tab.addEventListener("click", this.onClickTab);
      window.addEventListener("pointerup", this.onPointerUp);
    });
  }

  unbindTabs(): void {
    this.tabs.forEach((tab) => {
      tab.removeEventListener("pointerdown", this.onPointerDownTab);
      tab.removeEventListener("pointerenter", this.onPointerEnterTab);
      tab.removeEventListener("keydown", this.onKeyDown);
      tab.removeEventListener("click", this.onClickTab);
      window.removeEventListener("pointerup", this.onPointerUp);
    });
  }

  activateTab(tab: Tab): void {
    const value = tab.value;
    this.value = value;
    this.updateTabs();
    this.dispatchEvent(onchangeEvent);
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

  onPointerDownTab = (e: PointerEvent): void => {
    this._pointerDown = true;
  };

  onPointerEnterTab = (e: PointerEvent): void => {
    const tab = e.currentTarget as Tab;
    if (this._pointerDown) {
      this.activateTab(tab);
    }
  };

  onPointerUp = (e: PointerEvent): void => {
    this._pointerDown = false;
  };

  onKeyDown = (e: KeyboardEvent): void => {
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

  onClickTab = (e: MouseEvent): void => {
    const tab = e.currentTarget as Tab;
    this.activateTab(tab);
  };

  protected handleResize = (): void => {
    this.updateTabs();
  };

  protected override onContentAssigned = (slot: HTMLSlotElement): void => {
    this.unbindTabs();
    this._tabs = slot
      ?.assignedElements?.()
      .filter(
        (el) => el.tagName.toLowerCase() === Tabs.dependencies["s-tab"]
      ) as Tab[];
    this.bindTabs();
    this.updateTabs();
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
