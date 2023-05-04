import SparkleElement from "../../core/sparkle-element";
import css from "./divider.css";
import html from "./divider.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider extends SparkleElement {
  static override async define(
    tag = "s-divider",
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
    return [...super.observedAttributes, "vertical"];
  }

  /**
   * Whether or not the divider is vertical instead of horizontal.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute("vertical");
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === "vertical") {
      this.updateRootAttribute(
        "aria-orientation",
        newValue != null ? "vertical" : "horizontal"
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-divider": Divider;
  }
}
