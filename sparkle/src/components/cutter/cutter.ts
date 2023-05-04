import SparkleElement from "../../core/sparkle-element";
import css from "./cutter.css";
import html from "./cutter.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Cutters clip the corners of their content.
 */
export default class Cutter extends SparkleElement {
  static override async define(
    tag = "s-cutter",
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tag, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  protected _targetEl?: HTMLElement;

  protected override onConnected(): void {
    this.root.addEventListener("slotchange", this.handleContentSlotChange);
  }

  protected override onDisconnected(): void {
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
