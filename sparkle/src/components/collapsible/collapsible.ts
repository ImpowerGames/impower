import SparkleElement from "../../core/sparkle-element";
import css from "./collapsible.css";
import html from "./collapsible.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Collapsibles can be used to expand or collapse child buttons.
 */
export default class Collapsible extends SparkleElement {
  static dependencies = {
    button: "s-button",
  };

  static async define(
    tag = "s-collapsible",
    dependencies = {
      button: "s-button",
    }
  ): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    if (dependencies) {
      this.dependencies = dependencies;
    }
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
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

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "collapsed") {
      this.updateCollapsed();
    }
  }

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener("slotchange", this.handleContentSlotChange);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
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
      (el) => el.tagName.toLowerCase() === Collapsible.dependencies.button
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
