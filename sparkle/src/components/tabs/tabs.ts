import SparkleElement from "../../core/sparkle-element";
import type Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

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

  get navSlot(): HTMLSlotElement | null {
    return this.getElementByClass("nav");
  }

  get indicatorEl(): HTMLElement | null {
    return this.getElementByClass("indicator");
  }

  protected _resizeObserver?: ResizeObserver;

  protected _pointerDown?: boolean;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "indicator" || name === "vertical") {
      this.updateTabs();
    }
  }

  protected override onConnected(): void {
    this._resizeObserver = new ResizeObserver(this.handleResize);
    this.navSlot?.addEventListener("slotchange", this.handleNavSlotChange);
  }

  protected override onParsed(): void {
    this._resizeObserver?.observe(this.root);
  }

  protected override onDisconnected(): void {
    this._resizeObserver?.disconnect();
    this.navSlot?.removeEventListener("slotchange", this.handleNavSlotChange);
    this.unbindTabs();
  }

  updateIndicator = (tabElement: HTMLElement): void => {
    if (tabElement && this.indicator !== "none") {
      const indicator = this.indicatorEl;
      const vertical = this.vertical;
      const navRect = this.navSlot?.getBoundingClientRect();
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
    this._tabs.forEach((tab) => {
      if (this.value === tab.value) {
        tab.active = true;
        this.updateIndicator(tab.root);
      } else {
        tab.active = false;
      }
    });
  }

  bindTabs(): void {
    this._tabs.forEach((tab) => {
      tab.addEventListener("pointerdown", this.onPointerDownTab);
      tab.addEventListener("pointerenter", this.onPointerEnterTab);
      tab.addEventListener("click", this.onClickTab);
      window.addEventListener("pointerup", this.onPointerUp);
    });
  }

  unbindTabs(): void {
    this._tabs.forEach((tab) => {
      tab.removeEventListener("pointerdown", this.onPointerDownTab);
      tab.removeEventListener("pointerenter", this.onPointerEnterTab);
      tab.removeEventListener("click", this.onClickTab);
      window.removeEventListener("pointerup", this.onPointerUp);
    });
  }

  activateTab(tab: Tab): void {
    const value = tab.value;
    this.value = value;
    this.updateTabs();
    this.emit("onchange");
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

  onClickTab = (e: MouseEvent): void => {
    const tab = e.currentTarget as Tab;
    this.activateTab(tab);
  };

  protected handleResize = (): void => {
    this.updateTabs();
  };

  protected handleNavSlotChange = (e: Event): void => {
    const slot = e.currentTarget as HTMLSlotElement;
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
}
