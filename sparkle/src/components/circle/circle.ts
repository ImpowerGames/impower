import SparkleElement from "../../core/sparkle-element";
import { getCssSize } from "../../utils/getCssSize";
import css from "./circle.css";
import html from "./circle.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Cutters clip the corners of their content.
 */
export default class Circle extends SparkleElement {
  static override async define(
    tag = "s-circle",
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
    return [...super.observedAttributes, "size"];
  }

  /**
   * The size of the circle.
   */
  get size(): string | null {
    return this.getStringAttribute("size");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "size") {
      this.updateRootCssVariable(name, getCssSize(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-circle": Circle;
  }
}
