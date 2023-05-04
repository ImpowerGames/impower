import SparkleElement from "../../core/sparkle-element";
import { getCssColor } from "../../utils/getCssColor";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar extends SparkleElement {
  static override async define(
    tag = "s-progress-bar",
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
    return [...super.observedAttributes, "value", "label-color"];
  }

  /**
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute("value");
  }

  /**
   * The color of the label.
   */
  get labelColor(): string | null {
    return this.getStringAttribute("label-color");
  }

  protected override attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === "title") {
      this.updateRootAttribute("title", newValue);
    }
    if (name === "value") {
      this.updateRootAttribute("aria-valuenow", newValue);
      this.updateRootCssVariable(
        name,
        newValue.endsWith("%") ? newValue : `${newValue}%`
      );
    }
    if (name === "label-color") {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-bar": ProgressBar;
  }
}
