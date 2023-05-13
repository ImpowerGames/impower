import SparkleElement from "../../core/sparkle-element";
import { getAttributeNameMap } from "../../utils/getAttributeNameMap";
import { getCssColor } from "../../utils/getCssColor";
import css from "./progress-bar.css";
import html from "./progress-bar.html";

const styles = new CSSStyleSheet();
styles.replaceSync(css);

export const DEFAULT_PROGRESS_BAR_ATTRIBUTES = getAttributeNameMap([
  "value",
  "label-color",
]);

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class ProgressBar extends SparkleElement {
  static override tagName = "s-progress-bar";

  static override get attributes() {
    return { ...super.attributes, ...DEFAULT_PROGRESS_BAR_ATTRIBUTES };
  }

  static override async define(
    tagName?: string,
    dependencies?: Record<string, string>
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies);
  }

  override get html(): string {
    return html;
  }

  override get styles(): CSSStyleSheet[] {
    return [styles];
  }

  /**
   * The current progress as a percentage, 0 to 100.
   */
  get value(): string | null {
    return this.getStringAttribute(ProgressBar.attributes.value);
  }
  set value(value) {
    this.setStringAttribute(ProgressBar.attributes.value, value);
  }

  /**
   * The color of the label.
   */
  get labelColor(): string | null {
    return this.getStringAttribute(ProgressBar.attributes.labelColor);
  }
  set labelColor(value) {
    this.setStringAttribute(ProgressBar.attributes.labelColor, value);
  }

  protected override onAttributeChanged(
    name: string,
    oldValue: string,
    newValue: string
  ): void {
    if (name === ProgressBar.attributes.value) {
      this.updateRootAttribute("aria-valuenow", newValue);
      this.updateRootCssVariable(
        name,
        newValue.endsWith("%") ? newValue : `${newValue}%`
      );
    }
    if (name === ProgressBar.attributes.labelColor) {
      this.updateRootCssVariable(name, getCssColor(newValue));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-progress-bar": ProgressBar;
  }
}
