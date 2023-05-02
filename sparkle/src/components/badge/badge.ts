import SparkleElement from "../../core/sparkle-element";
import css from "./badge.css";
import html from "./badge.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Badges are used to draw attention and display statuses or counts.
 */
export default class Badge extends SparkleElement {
  static override async define(
    tag = "s-badge",
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

  static override get observedAttributes() {
    return [...super.observedAttributes, "float"];
  }

  /**
   * Determines if the badge should be floated over the left or right corner.
   */
  get float(): "left" | "right" | null {
    return this.getStringAttribute("float");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "float") {
      this.updateRootStyle("--float", newValue);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-badge": Badge;
  }
}
