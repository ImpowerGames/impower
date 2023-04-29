import SparkleElement from "../../core/sparkle-element";
import css from "./cutter.css";
import html from "./cutter.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Cutters clip the corners of its content.
 */
export default class Cutter extends SparkleElement {
  static async define(tag = "s-cutter"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
    return customElements.whenDefined(tag);
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  override get html(): string {
    return html;
  }

  protected _targetEl?: HTMLElement;

  protected override connectedCallback(): void {
    super.connectedCallback();
    this.root.addEventListener("slotchange", this.handleContentSlotChange);
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.root.removeEventListener("slotchange", this.handleContentSlotChange);
  }

  protected handleContentSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const elements = slot?.assignedElements?.();
    const element = elements?.[0];
    const targetEl = (element?.shadowRoot?.firstElementChild ||
      element?.firstElementChild) as HTMLElement;
    if (this._targetEl !== targetEl) {
      this._targetEl = targetEl;
      this.transferBorderStyle(targetEl);
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-cutter": Cutter;
  }
}
