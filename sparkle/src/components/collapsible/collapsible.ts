import SparkleElement from "../../core/sparkle-element";
import css from "./collapsible.css";
import html from "./collapsible.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_COLLAPSIBLE_DEPENDENCIES = {
  "s-button": "s-button",
};

/**
 * Collapsibles can be used to collapse child buttons so that only their icon is visible.
 */
export default class Collapsible extends SparkleElement {
  static override dependencies = DEFAULT_COLLAPSIBLE_DEPENDENCIES;

  static override async define(
    tag = "s-collapsible",
    dependencies = DEFAULT_COLLAPSIBLE_DEPENDENCIES
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return Collapsible.augment(html, DEFAULT_COLLAPSIBLE_DEPENDENCIES);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  static override get observedAttributes() {
    return [...super.observedAttributes, "collapsed"];
  }

  /**
   * Collapses any child labels.
   */
  get collapsed(): boolean {
    return this.getBooleanAttribute("collapsed");
  }

  protected _buttonEl?: HTMLElement;

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "collapsed") {
      this.updateCollapsed();
    }
  }

  protected override onConnected(): void {
    this.root.addEventListener("slotchange", this.handleContentSlotChange);
  }

  protected override onDisconnected(): void {
    this.root.removeEventListener("slotchange", this.handleContentSlotChange);
  }

  protected updateCollapsed(): void {
    const rootEl = this._buttonEl;
    const labelEl = rootEl?.querySelector<HTMLElement>(`.label`);
    const labelRect = labelEl?.getBoundingClientRect();
    if (labelEl && rootEl && labelRect) {
      const width = labelRect.width;
      if (this.collapsed) {
        rootEl.style.transform = `translateX(${width}px)`;
        rootEl.style.filter = "none";
        rootEl.style.margin = "0";
        labelEl.style.opacity = "0";
      } else {
        rootEl.style.transform = `translateX(0)`;
        rootEl.style.filter = "none";
        rootEl.style.margin = "0";
        labelEl.style.opacity = "1";
      }
    }
  }

  protected handleContentSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const elements = slot?.assignedElements?.();
    const buttons = elements.filter(
      (el) => el.tagName.toLowerCase() === Collapsible.dependencies["s-button"]
    );
    const targetEl = buttons?.[0]?.shadowRoot?.firstElementChild as HTMLElement;
    if (this._buttonEl !== targetEl) {
      this._buttonEl = targetEl;
      this.transferBorderStyle(targetEl);
      this.updateCollapsed();
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-collapsible": Collapsible;
  }
}
