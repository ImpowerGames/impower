import SparkleElement from "../../core/sparkle-element";
import css from "./badge.css";
import html from "./badge.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge extends SparkleElement {
  static async define(tag = "s-badge"): Promise<CustomElementConstructor> {
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
    return [...super.observedAttributes, "float"];
  }

  /**
   * Determines if the badge should be floated over the left or right corner.
   */
  get float(): "left" | "right" | null {
    return this.getStringAttribute("float");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
