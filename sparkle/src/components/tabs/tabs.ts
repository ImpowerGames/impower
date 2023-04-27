import SparkleElement from "../../core/sparkle-element";
import Tab from "../tab/tab";
import css from "./tabs.css";
import html from "./tabs.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Tabs indicate which child tab is currently active.
 */
export default class Tabs extends SparkleElement {
  static tabTag = "s-tab";

  static async define(
    tag = "s-tabs",
    tabTag = "s-tab"
  ): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    this.tabTag = tabTag;
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
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

  protected _tabs: Tab[] = [];
  get tabs(): Tab[] {
    return this._tabs;
  }

  get navEl(): HTMLElement | null {
    return this.getElementByPart("nav");
  }

  get indicatorEl(): HTMLElement | null {
    return this.getElementByPart("indicator");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "indicator" || name === "vertical") {
      this.updateTabs();
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.navEl?.addEventListener("slotchange", this.handleNavSlotChange);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.navEl?.removeEventListener("slotchange", this.handleNavSlotChange);
    this._tabs.forEach((tab) => {
      tab.removeEventListener("click", this.onClickTab);
    });
  }

  updateIndicator = (tabElement: HTMLElement) => {
    if (this.indicator !== "none") {
      const indicator = this.indicatorEl;
      const vertical = this.vertical;
      const navRect = this.navEl?.getBoundingClientRect();
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

  updateTabs() {
    this._tabs.forEach((tab) => {
      if (this.value === tab.value) {
        tab.active = true;
        this.updateIndicator(tab.root);
      } else {
        tab.active = false;
      }
    });
  }

  onClickTab = (e: MouseEvent) => {
    const tab = e.currentTarget as Tab;
    if (tab.value != null) {
      this.setAttribute("value", tab.value);
    } else {
      this.removeAttribute("value");
    }
    this.updateTabs();
  };

  protected handleNavSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    this._tabs.forEach((tab) => {
      // Remove listeners from old slotted tabs
      tab.removeEventListener("click", this.onClickTab);
    });
    this._tabs = slot
      ?.assignedElements?.()
      .filter((el) => el.tagName.toLowerCase() === Tabs.tabTag) as Tab[];
    this.updateTabs();
    this._tabs.forEach((tab) => {
      // Add listeners to new slotted tabs
      tab.addEventListener("click", this.onClickTab);
    });
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-tabs": Tabs;
  }
}
