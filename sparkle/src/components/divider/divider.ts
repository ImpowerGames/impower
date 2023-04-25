import SparkleElement from "../../core/sparkle-element";
import css from "./divider.css";
import html from "./divider.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Dividers are used to visually separate or group elements.
 */
export default class Divider extends SparkleElement {
  static async define(tag = "s-divider"): Promise<CustomElementConstructor> {
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
    return [...super.observedAttributes, "vertical"];
  }

  /**
   * Whether or not the divider is vertical instead of horizontal.
   */
  get vertical(): boolean {
    return this.getBooleanAttribute("vertical");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
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
