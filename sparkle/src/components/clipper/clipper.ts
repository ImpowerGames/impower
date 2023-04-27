import SparkleElement from "../../core/sparkle-element";
import css from "./clipper.css";
import html from "./clipper.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Clippers clip the corners of its content.
 */
export default class Clipper extends SparkleElement {
  static async define(tag = "s-clipper"): Promise<CustomElementConstructor> {
    customElements.define(tag, this);
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

  get labelEl(): HTMLElement | null {
    return this.getElementByPart("label");
  }

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
    this.getElementByPart("content")?.addEventListener(
      "slotchange",
      this.handleContentSlotChange
    );
  }

  protected override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.getElementByPart("content")?.removeEventListener(
      "slotchange",
      this.handleContentSlotChange
    );
  }

  protected updateCollapsed(): void {
    const labelEl = this.labelEl;
    const labelRect = labelEl?.getBoundingClientRect();
    if (labelEl && labelRect) {
      const width = labelRect.width;
      if (this.collapsed) {
        labelEl.style.opacity = "0";
        this.root.style.transform = `translateX(${width}px)`;
      } else {
        labelEl.style.opacity = "1";
        this.root.style.transform = `translateX(0)`;
      }
    }
  }

  protected handleContentSlotChange = (e: Event) => {
    const slot = e.currentTarget as HTMLSlotElement;
    const nodes = slot?.assignedNodes?.();
    const hasLabel = nodes.length > 0;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "s-clipper": Clipper;
  }
}
